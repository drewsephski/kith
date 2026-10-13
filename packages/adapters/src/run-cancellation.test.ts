import type { RealtimeFanout } from "@rakazo/adapter-kit";
import type { ProductEvent } from "@rakazo/contracts";
import { abortableDelay } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { createThreadEvents } from "@rakazo/db";
import { expect, it, vi } from "vitest";
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
it("aborts on a clear of its thread without a run id, ignoring foreign clears", async () => {
  const execution = new AbortController();
  const cleared = event("owned-thread", "owned-run");
  cleared.type = "thread.cleared";
  delete cleared.runId;
  const stop = watchRunCancellation(
    {
      async *follow() {
        yield { ...cleared, threadId: "foreign" };
        expect(execution.signal.aborted).toBe(false);
        yield cleared;
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

it.each(["rejected", "silent", "pending"])(
  "observes durable Stop promptly with %s realtime",
  async (mode) => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      let detached = false;
      let finishSubscription: ((release: () => Promise<void>) => void) | undefined;
      const release = async () => {
        detached = true;
      };
      const realtime: RealtimeFanout = {
        describe: () => ({
          id: "fixture",
          contractVersion: "1",
          adapterVersion: "1",
          capabilities: { distributed: false, push: true },
        }),
        publish: async () => {},
        close: async () => {},
        subscribe: async () => {
          if (mode === "rejected") throw new Error("fixture subscription unavailable");
          if (mode === "pending")
            return new Promise<() => Promise<void>>((resolve) => {
              finishSubscription = resolve;
            });
          return release;
        },
      };
      const prisma = {
        event: {
          findMany: vi.fn(async () =>
            cancelled ? [{ ...event("thread", "run"), createdAt: new Date() }] : [],
          ),
        },
      } as unknown as PrismaClient;
      const execution = new AbortController();
      const stop = watchRunCancellation(
        createThreadEvents(prisma, realtime),
        "thread",
        "run",
        0,
        execution,
      );
      await vi.advanceTimersByTimeAsync(0);
      cancelled = true;
      await vi.advanceTimersByTimeAsync(400);
      expect(execution.signal.aborted).toBe(true);
      await stop();
      finishSubscription?.(release);
      await vi.advanceTimersByTimeAsync(0);
      if (mode !== "rejected") expect(detached).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  },
);
