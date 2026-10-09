import type { Connection } from "@rakazo/contracts";
import { abortableDelay } from "./async.js";

/** Poll only the authorization just started. Never repeat the begin mutation. */
export async function waitForAppConnection(
  complete: () => Promise<Connection>,
  options: { signal?: AbortSignal; attempts?: number; pollIntervalMs?: number } = {},
): Promise<Connection> {
  const attempts = options.attempts ?? 60;
  for (let attempt = 0; attempt < attempts; attempt++) {
    options.signal?.throwIfAborted();
    const row = await complete();
    options.signal?.throwIfAborted();
    if (row.status !== "pending" || attempt === attempts - 1) return row;
    await abortableDelay(options.pollIntervalMs ?? 2000, options.signal);
  }
  throw new Error("Connection could not be checked");
}
