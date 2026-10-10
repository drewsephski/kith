// @vitest-environment jsdom

import type { Connection } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { list, catalog } = vi.hoisted(() => ({ list: vi.fn(), catalog: vi.fn() }));
vi.mock("../../lib/rpc", () => ({
  rpc: { connections: { list, catalog } },
  selectedSpaceId: () => "space-1",
}));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

import { AssistantForYou } from "./assistant-for-you";

let root: Root;
let container: HTMLDivElement;
const onSuggest = vi.fn();
function connection(provider: string, status: Connection["status"] = "connected"): Connection {
  return {
    id: provider,
    connectorId: "composio",
    provider,
    displayName: provider,
    status,
    capabilities: [],
    createdAt: "2026-10-09T12:00:00Z",
  };
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  list.mockResolvedValue([connection("gmail")]);
  catalog.mockResolvedValue([]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function render() {
  await act(async () => root.render(<AssistantForYou botId="bot-1" onSuggest={onSuggest} />));
}
it("offers concrete connected-service prompts without statuses or task starter metadata", async () => {
  await render();
  expect(container.querySelectorAll("button")).toHaveLength(3);
  expect(container.textContent).not.toMatch(
    /Needs attention|In progress|Completed|Plan my day|Remember something/,
  );
  const button = container.querySelector("button")!;
  expect(button.textContent).toBe("Draft important replies");
  act(() => button.click());
  expect(onSuggest).toHaveBeenCalledWith(
    expect.stringContaining("create a draft response for each"),
  );
  expect(onSuggest.mock.calls[0]).toHaveLength(1);
});
it("omits tasks for disconnected services and hides the empty strip", async () => {
  list.mockResolvedValue([connection("gmail", "revoked"), connection("slack", "pending")]);
  await render();
  expect(container.childElementCount).toBe(0);
});
it("includes provider-connected services discovered through the catalog", async () => {
  list.mockResolvedValue([]);
  catalog.mockResolvedValue([
    {
      connectorId: "composio",
      slug: "github",
      name: "GitHub",
      logo: null,
      connected: true,
      noAuth: false,
    },
  ]);
  await render();
  expect(container.querySelectorAll("button")).toHaveLength(1);
  expect(container.textContent).toContain("Triage pull requests");
});
it("hides suggestions when connection discovery fails", async () => {
  list.mockRejectedValue(new Error("Unavailable"));
  catalog.mockRejectedValue(new Error("Unavailable"));
  await render();
  expect(container.childElementCount).toBe(0);
});
it("requires both services for a cross-service task", async () => {
  list.mockResolvedValue([connection("googleanalytics4")]);
  await render();
  expect(container.childElementCount).toBe(0);
  list.mockResolvedValue([connection("googleanalytics4"), connection("googlesheets")]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Create a weekly report");
});

it("reuses confirmed Shell connection discovery without fetching it again", async () => {
  await act(async () =>
    root.render(<AssistantForYou botId="bot-1" apps={["github"]} onSuggest={onSuggest} />),
  );
  expect(container.textContent).toContain("Triage pull requests");
  expect(list).not.toHaveBeenCalled();
  expect(catalog).not.toHaveBeenCalled();
});
