import { describe, expect, it } from "vitest";
import { reconcileTerminalRunSnapshot } from "./terminal-run-snapshot.js";

describe("terminal run snapshot authority", () => {
  const previous = {
    threadId: "thread",
    run: { id: "run", status: "running" },
    activeRuns: [
      { id: "run", status: "running" },
      { id: "peer", status: "running" },
    ],
    messages: [
      { id: "progress:run", runId: "run", seq: 10 },
      { id: "progress:peer", runId: "peer", seq: 11 },
    ],
    cursor: 11,
  };
  it("reconciles the completed run while preserving its active peer and the event cursor", () => {
    const next = {
      ...previous,
      run: { id: "run", status: "completed" },
      messages: [{ id: "result", runId: "run", seq: 9 }],
      cursor: 9,
    };
    expect(reconcileTerminalRunSnapshot(previous, next)).toMatchObject({
      cursor: 11,
      run: { status: "completed" },
      activeRuns: [{ id: "peer" }],
      messages: [{ id: "result" }, { id: "progress:peer" }],
    });
  });
  it("does not infer completion from response prose or a different run or thread", () => {
    expect(reconcileTerminalRunSnapshot(previous, previous)).toBeNull();
    expect(
      reconcileTerminalRunSnapshot(previous, {
        ...previous,
        threadId: "other",
        run: { id: "run", status: "completed" },
      }),
    ).toBeNull();
    expect(
      reconcileTerminalRunSnapshot(previous, {
        ...previous,
        run: { id: "older", status: "completed" },
      }),
    ).toBeNull();
  });
});
