import type { ThreadEvents } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";

/** Quiet model streams must observe durable Stop without waiting for a lease renewal. */
export function watchRunCancellation(
  events: Pick<ThreadEvents, "follow">,
  threadId: string,
  runId: string,
  cursor: number,
  execution: AbortController,
) {
  const subscription = new AbortController();
  const abortSubscription = () => subscription.abort();
  execution.signal.addEventListener("abort", abortSubscription, { once: true });
  if (execution.signal.aborted) subscription.abort();
  const work = (async () => {
    try {
      for await (const event of events.follow(threadId, cursor, subscription.signal, {
        catchUpMs: 400,
      })) {
        if (
          event.threadId === threadId &&
          (event.type === "thread.cleared" ||
            (event.runId === runId && event.type === "run.cancelled"))
        ) {
          execution.abort();
          return;
        }
      }
    } catch {
      if (!subscription.signal.aborted) {
        // A failed observer must not leave paid inference unaware of cancellation.
        // Lease and effect fencing still determine whether anything can be committed.
        getLogger().warn("run cancellation subscription failed");
        execution.abort();
      }
    }
  })();
  return async () => {
    execution.signal.removeEventListener("abort", abortSubscription);
    subscription.abort();
    await work;
  };
}
