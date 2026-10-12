import type { ProductEvent } from "@rakazo/contracts";
import { abortableDelay } from "@rakazo/core";
import { expect, it } from "vitest";
import { watchRunCancellation } from "./run-cancellation.js";

function event(threadId: string, runId: string): ProductEvent {
  return {
    id: "synthetic",
    spaceId: "synthetic",
    botId: "synthetic",
    threadId,
    runId,
    type: "run.cancelled",
    seq: 1,
    payload: {},
    createdAt: new Date().toISOString(),
  };
}
it("ignores other runs and conversations, then aborts the exact execution", async () => {
  const execution = new AbortController();
  const stop = watchRunCancellation(
    {
      async *follow() {
        yield event("foreign", "owned-run");
        expect(execution.signal.aborted).toBe(false);
        yield event("owned-thread", "foreign-run");
        expect(execution.signal.aborted).toBe(false);
        yield event("owned-thread", "owned-run");
      },
    },
    "owned-thread",
    "owned-run",
    0,
    execution,
  );
  await expect.poll(() => execution.signal.aborted).toBe(true);
  await stop();
});
it("stops its subscription at normal completion without cancelling execution", async () => {
  const execution = new AbortController();
  let detached = false;
  const stop = watchRunCancellation(
    {
      async *follow(_thread, _cursor, signal) {
        try {
          await abortableDelay(60_000, signal!);
          yield* [];
        } finally {
          detached = true;
        }
      },
    },
    "owned-thread",
    "owned-run",
    0,
    execution,
  );
  await stop();
  expect(detached).toBe(true);
  expect(execution.signal.aborted).toBe(false);
});
it("fails closed if durable cancellation observation fails", async () => {
  const execution = new AbortController();
  const stop = watchRunCancellation(
    {
      async *follow() {
        yield* [];
        throw new Error("synthetic failure");
      },
    },
    "thread",
    "run",
    0,
    execution,
  );
  await expect.poll(() => execution.signal.aborted).toBe(true);
  await stop();
});
