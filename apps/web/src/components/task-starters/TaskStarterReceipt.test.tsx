// @vitest-environment jsdom
import type { TaskStarterReceipt as Receipt } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  receipt: vi.fn(),
  reconcile: vi.fn(),
  chooseMeeting: vi.fn(),
  retry: vi.fn(),
  publish: vi.fn(),
  saveTodos: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("../../lib/rpc", () => ({ rpc: { taskStarters: api } }));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return {
    useLingui: () => ({ t, i18n: { locale: "en" } }),
    Trans: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock("@rakazo/chat-ui/web", () => ({
  ChatMarkdown: ({ children }: { children: ReactNode }) => children,
}));

import { TaskStarterReceipt } from "./TaskStarterReceipt";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const receipt: Receipt = {
  id: "receipt-1",
  runId: "run-1",
  starter: "gmail_search",
  status: "queued",
  result: null,
  error: null,
  createdAt: "2026-10-09T18:00:00Z",
  updatedAt: "2026-10-09T18:00:00Z",
};
async function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<TaskStarterReceipt receiptId={receipt.id} />));
}
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("polls only active durable receipts and stops after completion", async () => {
  vi.useFakeTimers();
  api.receipt.mockResolvedValueOnce(receipt).mockResolvedValue({
    ...receipt,
    status: "completed",
    result: {
      kind: "gmail_search",
      sources: [],
      warnings: [],
      summary: "No matching email",
      messages: [],
      coverage: [],
    },
  });
  await render();
  expect(api.receipt).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(api.receipt).toHaveBeenCalledTimes(2);
  expect(container?.textContent).toContain("No matching email");
  await act(async () => vi.advanceTimersByTimeAsync(20_000));
  expect(api.receipt).toHaveBeenCalledTimes(2);
});

it("cancels receipt polling when the card unmounts", async () => {
  vi.useFakeTimers();
  api.receipt.mockResolvedValue(receipt);
  await render();
  act(() => root?.unmount());
  root = null;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(api.receipt).toHaveBeenCalledTimes(1);
});

it("never offers a retry or publish when a spreadsheet write is uncertain", async () => {
  api.receipt.mockResolvedValue({
    ...receipt,
    starter: "analytics_report",
    status: "reconciliation_required",
    error: "The update could not be confirmed",
    result: {
      kind: "analytics_report",
      sources: [],
      warnings: [],
      summary: "",
      report: {
        propertyId: "123456",
        timezone: "America/Chicago",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        currency: null,
        metrics: [{ name: "sessions", label: "Sessions", value: 100 }],
        spreadsheetId: "sheet-fixture",
        url: "https://docs.google.com/spreadsheets/d/sheet-fixture",
        range: "Report!A1:B3",
        values: [],
        provisional: true,
        published: false,
      },
    },
  });
  await render();
  expect(container?.textContent).toContain("Check the destination before starting another report");
  expect(container?.textContent).not.toContain("Publish to Sheet");
  expect(container?.textContent).not.toContain("Retry task");
  expect(api.publish).not.toHaveBeenCalled();
  expect(api.retry).not.toHaveBeenCalled();
});

it("follows the durable publish receipt rather than reloading its original preview", async () => {
  const report = {
    propertyId: "123456",
    timezone: "America/Chicago",
    startDate: "2026-10-05",
    endDate: "2026-10-09",
    currency: null,
    metrics: [{ name: "sessions" as const, label: "Sessions", value: 100 }],
    spreadsheetId: "sheet-fixture",
    url: null,
    range: "Report!A1:B3",
    values: [],
    provisional: true,
    published: false,
  };
  const preview: Receipt = {
    ...receipt,
    starter: "analytics_report",
    status: "completed",
    result: { kind: "analytics_report", sources: [], warnings: [], summary: "", report },
  };
  const published: Receipt = {
    ...preview,
    id: "published-receipt",
    result: {
      kind: "analytics_report",
      sources: [],
      warnings: [],
      summary: "",
      report: {
        ...report,
        published: true,
        url: "https://docs.google.com/spreadsheets/d/sheet-fixture",
      },
    },
  };
  api.receipt.mockImplementation(async ({ receiptId }: { receiptId: string }) =>
    receiptId === published.id ? published : preview,
  );
  api.publish.mockResolvedValue({ ...published, status: "running" });
  await render();
  const publish = [...(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (button) => button.textContent === "Publish to Sheet",
  );
  if (!publish) throw new Error("publish button not found");
  await act(async () => publish.click());
  expect(api.publish).toHaveBeenCalledWith({
    receiptId: receipt.id,
    clientNonce: `task-publish:${receipt.id}`,
  });
  expect(api.receipt).toHaveBeenLastCalledWith({ receiptId: published.id });
  expect(container?.textContent).toContain("Open spreadsheet");
  expect(container?.textContent).not.toContain("Publish to Sheet");
});
