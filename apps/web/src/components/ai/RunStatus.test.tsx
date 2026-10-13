// @vitest-environment jsdom
import type { ThreadMessage } from "@rakazo/contracts";
import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RunStatus } from "./RunStatus";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
}));
vi.mock("./CollaborationMarker", () => ({
  ActiveBotGlyph: ({ label, showAvatar }: { label: string; showAvatar: boolean }) => (
    <div role="status" data-avatar={String(showAvatar)}>
      {label}
    </div>
  ),
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(props: Partial<ComponentProps<typeof RunStatus>>) {
  await act(async () => root.render(<RunStatus bots={[]} messages={[]} {...props} />));
}
const bot = { botId: "bot", runId: "run", name: "Scout", color: "ink", status: "running" };
const response: ThreadMessage = {
  id: "progress:run",
  threadId: "thread",
  runId: "run",
  seq: 1,
  role: "bot",
  blocks: [{ kind: "text", text: "Got it." }],
  createdAt: "2026-10-10T12:00:00Z",
};
it("keeps execution visible after an acknowledgement and falls back to honest generation", async () => {
  await render({ bots: [bot], messages: [response] });
  expect(host.textContent).toBe("Working…");
  expect(host.querySelector("[data-avatar]")?.getAttribute("data-avatar")).toBe("false");
  await render({
    bots: [bot],
    messages: [
      {
        ...response,
        blocks: [
          ...response.blocks,
          { kind: "progress", text: "Searching Gmail…", activity: true },
        ],
      },
    ],
  });
  expect(host.textContent).toBe("Searching Gmail…");
  await render({ bots: [bot], messages: [response], reconnecting: true });
  expect(host.textContent).toBe("Reconnecting…");
});
it.each([
  ["queued", "Queued…"],
  ["leased", "Starting…"],
  ["completed", "Done"],
  ["failed", "Couldn’t finish"],
  ["cancelled", "Stopped"],
  ["waiting_input", "Waiting for your input"],
  ["waiting_takeover", "Waiting for you"],
])("shows %s without requiring response prose", async (status, label) => {
  await render({ bots: [{ ...bot, status }], latestRun: { id: "run", status } });
  expect(host.textContent).toBe(label);
});
it("distinguishes a pending approval and simultaneous work by identity", async () => {
  await render({
    bots: [bot],
    waitingBots: [
      { ...bot, botId: "peer", runId: "peer-run", name: "Helper", status: "waiting_input" },
    ],
    messages: [
      {
        ...response,
        runId: "peer-run",
        blocks: [{ kind: "ask", text: "Approve?", approvalEffectId: "effect", status: "pending" }],
      },
    ],
  });
  expect(host.textContent).toContain("Scout: Working…");
  expect(host.textContent).toContain("Helper: Waiting for approval");
  await render({
    latestRun: { id: "peer-run", status: "waiting_input" },
    messages: [
      {
        ...response,
        runId: "other",
        blocks: [{ kind: "ask", text: "Approve?", approvalEffectId: "effect", status: "pending" }],
      },
    ],
  });
  expect(host.textContent).toBe("Waiting for your input");
});
