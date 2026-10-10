// @vitest-environment jsdom
import type { RunActivityRow } from "@rakazo/contracts";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { list, selection } = vi.hoisted(() => ({ list: vi.fn(), selection: { id: "space-a" } }));
vi.mock("../../lib/rpc", () => ({ rpc: { runs: { list } }, selectedSpaceId: () => selection.id }));

import { useForYouWork } from "./use-for-you-context";

let root: Root;
let container: HTMLDivElement;
function row(id: string, status: RunActivityRow["status"]): RunActivityRow {
  return {
    runId: id,
    botId: `bot-${id}`,
    botName: id,
    groupId: null,
    groupName: null,
    threadId: id,
    messageId: `message-${id}`,
    status,
    trigger: "user",
    notificationsEnabled: false,
    promptSnippet: id,
    updatedAt: "2026-10-09T12:00:00Z",
  };
}
function Probe({ scope, revision }: { scope?: string; revision?: string }) {
  const { runs, failed } = useForYouWork(scope, revision);
  return (
    <output>
      {failed ? "unavailable" : runs.map((run) => `${run.runId}:${run.messageId}`).join(",")}
    </output>
  );
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  selection.id = "space-a";
  list.mockImplementation(({ filter }) =>
    Promise.resolve({
      runs: filter === "active" ? [row("approval", "waiting_input")] : [row("result", "completed")],
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it("loads persisted work with message destinations and deduplicates simultaneous focus/visibility refresh", async () => {
  await act(async () => root.render(<Probe scope="user-a:space-a" />));
  expect(container.textContent).toBe("approval:message-approval,result:message-result");
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(list).toHaveBeenCalledTimes(4);
});
it("does not fetch when rendering an unscoped preview", async () => {
  await act(async () => root.render(<Probe />));
  expect(list).not.toHaveBeenCalled();
});
it("clears work across user/space changes and rejects the previous in-flight response", async () => {
  let resolve!: (result: { runs: RunActivityRow[] }) => void;
  const pending = new Promise<{ runs: RunActivityRow[] }>((done) => {
    resolve = done;
  });
  list.mockReturnValue(pending);
  await act(async () => root.render(<Probe scope="user-a:space-a" />));
  selection.id = "space-b";
  list.mockResolvedValue({ runs: [] });
  await act(async () => root.render(<Probe scope="user-b:space-b" />));
  await act(async () => resolve({ runs: [row("private", "waiting_input")] }));
  expect(container.textContent).toBe("");
});
it("does not retain stale factual activity when refresh fails", async () => {
  await act(async () => root.render(<Probe scope="user-a:space-a" />));
  list.mockRejectedValue(new Error("Revoked"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toBe("unavailable");
});

it("refreshes when persisted bot work changes, without adding timer polling", async () => {
  await act(async () => root.render(<Probe scope="user-a:space-a" revision="bot:running" />));
  await act(async () => root.render(<Probe scope="user-a:space-a" revision="bot:running" />));
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => root.render(<Probe scope="user-a:space-a" revision="bot:completed" />));
  expect(list).toHaveBeenCalledTimes(4);
});
