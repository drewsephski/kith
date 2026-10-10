import type { RunActivityRow } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { connectedForYouSuggestions, forYouWork } from "./for-you-work.js";

function run(
  id: string,
  status: RunActivityRow["status"],
  updatedAt = "2026-10-09T12:00:00Z",
): RunActivityRow {
  return {
    runId: id,
    botId: `bot-${id}`,
    botName: id,
    groupId: null,
    groupName: null,
    threadId: `thread-${id}`,
    messageId: `message-${id}`,
    status,
    trigger: "user",
    notificationsEnabled: false,
    promptSnippet: id,
    updatedAt,
  };
}
describe("For you persisted work", () => {
  it("prioritizes answers, recovery and active work before completed results", () => {
    const runs = forYouWork([
      run("result", "completed"),
      run("active", "running"),
      run("failed", "failed"),
      run("approval", "waiting_input"),
      run("cancelled", "cancelled"),
    ]);
    expect(runs.map((row) => row.runId)).toEqual(["approval", "failed", "active", "result"]);
    expect(runs[0]?.messageId).toBe("message-approval");
  });
  it("deduplicates runs and keeps recent work within each priority", () => {
    expect(
      forYouWork(
        [
          run("old", "completed", "2026-10-08T00:00:00Z"),
          run("new", "completed"),
          run("new", "completed"),
        ],
        1,
      ).map((row) => row.runId),
    ).toEqual(["new"]);
    expect(forYouWork([])).toEqual([]);
  });
});
describe("For you connected context", () => {
  it("chooses different catalog tasks for confirmed different accounts", () => {
    expect(connectedForYouSuggestions(["googlemail"])).toEqual(["important-replies"]);
    expect(connectedForYouSuggestions(["github", "googlecalendar"])).toEqual([
      "meeting-brief",
      "pull-requests",
    ]);
    expect(connectedForYouSuggestions([])).toEqual([]);
  });
});
