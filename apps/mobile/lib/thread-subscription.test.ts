import { afterEach, expect, it, vi } from "vitest";
import type { ThreadEvent } from "./api";
import { recoverThreadSubscription } from "./thread-subscription";

afterEach(() => vi.useRealTimers());
it("recovers an initially failed snapshot before accepting live events and resumes without replay", async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const received: ThreadEvent[] = [];
  const snapshot = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ threadId: "owned", cursor: 8 });
  let attempts = 0;
  const cursors: number[] = [];
  const subscribe = vi.fn(async (cursor: number, receive: (event: ThreadEvent) => void) => {
    cursors.push(cursor);
    receive({ threadId: "foreign", seq: 100, type: "thread.progress" });
    receive({ threadId: "owned", seq: 9, type: "thread.message.created" });
    receive({ threadId: "owned", seq: 10, type: "thread.progress" });
    if (++attempts === 2) abort.abort();
    else throw new Error("Disconnected");
  });
  const task = recoverThreadSubscription({
    signal: abort.signal,
    isCurrent: () => true,
    snapshot,
    subscribe,
    receive: (event) => received.push(event),
    reconnecting: vi.fn(),
    failed: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(250);
  await task;
  expect(cursors).toEqual([8, 10]);
  expect(received.map((event) => event.seq)).toEqual([9, 10]);
  expect(snapshot).toHaveBeenCalledTimes(3);
});
it("does not subscribe or reveal unidentified activity when snapshots remain unavailable", async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const subscribe = vi.fn();
  const snapshot = vi.fn().mockResolvedValue(null);
  const task = recoverThreadSubscription({
    signal: abort.signal,
    isCurrent: () => true,
    snapshot,
    subscribe,
    receive: vi.fn(),
    reconnecting: vi.fn(),
    failed: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(750);
  abort.abort();
  await task;
  expect(subscribe).not.toHaveBeenCalled();
  expect(snapshot).toHaveBeenCalledTimes(3);
});
it.each(["navigation", "account", "Space", "endpoint"])(
  "fences late events and snapshot completion after %s changes",
  async () => {
    const abort = new AbortController();
    let current = true;
    const receive = vi.fn();
    const task = recoverThreadSubscription({
      signal: abort.signal,
      isCurrent: () => current,
      snapshot: async () => ({ threadId: "owned", cursor: 1 }),
      subscribe: async (_cursor, deliver) => {
        current = false;
        deliver({ threadId: "owned", seq: 2, type: "thread.message.created" });
      },
      receive,
      reconnecting: vi.fn(),
      failed: vi.fn(),
    });
    await task;
    expect(receive).not.toHaveBeenCalled();
  },
);
it("rejects a snapshot that completes after session invalidation", async () => {
  let current = true;
  const subscribe = vi.fn();
  await recoverThreadSubscription({
    signal: new AbortController().signal,
    isCurrent: () => current,
    snapshot: async () => {
      current = false;
      return { threadId: "old", cursor: 20 };
    },
    subscribe,
    receive: vi.fn(),
    reconnecting: vi.fn(),
    failed: vi.fn(),
  });
  expect(subscribe).not.toHaveBeenCalled();
});
