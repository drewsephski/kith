import type { RunActivityRow } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { assistantHighlights } from "./assistant-highlights.js";

function row(runId: string, status: RunActivityRow["status"], threadId = runId): RunActivityRow {
  return {
    runId,
    status,
    threadId,
    botId: "bot",
    botName: "Kith",
    groupId: null,
    groupName: null,
    trigger: "task_starter",
    notificationsEnabled: false,
    promptSnippet: "Prepare my day",
    updatedAt: "2026-10-09T12:00:00Z",
  };
}
describe("assistant highlights", () => {
  it("prioritizes attention and actual work over recent completion, and omits cancelled work", () => {
    expect(
      assistantHighlights(
        [row("active", "running"), row("attention", "waiting_input")],
        [row("done", "completed"), row("cancelled", "cancelled")],
      ).map((item) => item.runId),
    ).toEqual(["attention", "active", "done"]);
  });
  it("uses current active state and shows one actionable context per conversation", () => {
    expect(
      assistantHighlights(
        [row("same", "running", "thread"), row("needs", "waiting_takeover", "thread")],
        [row("same", "completed", "thread")],
      ).map((item) => item.runId),
    ).toEqual(["needs"]);
  });
  it("stays empty without persisted work and honors the display limit", () => {
    expect(assistantHighlights([], [])).toEqual([]);
    expect(assistantHighlights([row("a", "running"), row("b", "queued")], [], 1)).toHaveLength(1);
  });
});
