import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  captureThreadStop,
  isConversationalRun,
  threadStopIsSettled,
} from "./run-state.js";

describe("Stop response reconciliation", () => {
  const request = captureThreadStop({
    threadId: "thread-1",
    run: { id: "run-1", status: "running" },
  });
  it.each(["cancelled", "completed", "failed"])(
    "accepts authoritative %s after a lost reply",
    (status) => {
      expect(
        threadStopIsSettled(request, { threadId: "thread-1", run: { id: "run-1", status } }),
      ).toBe(true);
    },
  );
  it("does not mistake missing, foreign, or contradictory state for settlement", () => {
    expect(threadStopIsSettled(request, null)).toBe(false);
    expect(threadStopIsSettled(request, { threadId: "thread-2", settledRunIds: ["run-1"] })).toBe(
      false,
    );
    expect(threadStopIsSettled(request, { threadId: "thread-1", activeRuns: [] })).toBe(false);
    expect(
      threadStopIsSettled(request, {
        threadId: "thread-1",
        settledRunIds: ["run-1"],
        activeRuns: [{ id: "run-1", status: "running" }],
      }),
    ).toBe(false);
  });
  it("requires every captured group run to settle and does not affect a newer run", () => {
    const group = captureThreadStop({
      threadId: "group-1",
      activeRuns: [
        { id: "run-1", status: "running" },
        { id: "run-2", status: "queued" },
      ],
    });
    expect(threadStopIsSettled(group, { threadId: "group-1", settledRunIds: ["run-1"] })).toBe(
      false,
    );
    expect(
      threadStopIsSettled(group, {
        threadId: "group-1",
        settledRunIds: ["run-1", "run-2"],
        activeRuns: [{ id: "run-3", status: "running" }],
      }),
    ).toBe(true);
  });
  it("cannot claim a stop without an active request identity", () => {
    expect(
      captureThreadStop({ threadId: "thread-1", run: { id: "run-1", status: "completed" } }),
    ).toBeNull();
    expect(threadStopIsSettled(null, { threadId: "thread-1", settledRunIds: ["run-1"] })).toBe(
      false,
    );
  });
});

describe("run state machine", () => {
  it("allows takeover resume onto a lease", () => {
    expect(canTransition("waiting_takeover", "leased")).toBe(true);
    expect(canTransition("waiting_takeover", "running")).toBe(false);
  });

  it("withholds user steering from routine, webhook, and creation intro turns", () => {
    expect(isConversationalRun("user")).toBe(true);
    expect(isConversationalRun("follow_up")).toBe(true);
    expect(isConversationalRun("messaging")).toBe(true);
    expect(isConversationalRun("routine")).toBe(false);
    expect(isConversationalRun("webhook")).toBe(false);
    expect(isConversationalRun("created")).toBe(false);
  });

  it("rejects rewriting a completed run", () => {
    expect(() => assertTransition("completed", "running")).toThrow(/illegal/i);
  });

  it("never leaves a terminal state except failed retry", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("completed" as const, "cancelled" as const),
        fc.constantFrom(
          "queued" as const,
          "leased" as const,
          "running" as const,
          "waiting_input" as const,
          "completed" as const,
        ),
        (from, to) => {
          expect(canTransition(from, to)).toBe(false);
        },
      ),
    );
  });
});
