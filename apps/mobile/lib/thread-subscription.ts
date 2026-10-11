import { abortableDelay } from "@rakazo/core";
import type { ThreadEvent } from "./api";

/** Never open a stream until a scoped snapshot has established its identity. */
export async function recoverThreadSubscription(options: {
  signal: AbortSignal;
  isCurrent: () => boolean;
  snapshot: () => Promise<{ threadId: string; cursor?: number } | null | undefined>;
  subscribe: (cursor: number, receive: (event: ThreadEvent) => void) => Promise<void>;
  receive: (event: ThreadEvent) => void;
  reconnecting: (value: boolean) => void;
  failed: (error: unknown) => void;
}) {
  let identity: string | null = null;
  let cursor = -1;
  let retryMs = 250;
  const current = () => !options.signal.aborted && options.isCurrent();
  while (current()) {
    try {
      const snapshot = await options.snapshot();
      if (!current()) return;
      if (!snapshot) throw new Error("Could not load conversation");
      if (identity !== snapshot.threadId) cursor = -1;
      identity = snapshot.threadId;
      cursor = Math.max(cursor, snapshot.cursor ?? -1);
      await options.subscribe(cursor, (event) => {
        if (
          !current() ||
          (event.threadId && event.threadId !== identity) ||
          (event.seq !== undefined && event.seq <= cursor)
        )
          return;
        cursor = Math.max(cursor, event.seq ?? -1);
        retryMs = 250;
        options.reconnecting(false);
        options.receive(event);
      });
    } catch (error) {
      if (current()) options.failed(error);
    }
    if (!current()) return;
    options.reconnecting(true);
    await abortableDelay(retryMs, options.signal);
    retryMs = Math.min(retryMs * 2, 5_000);
  }
}
