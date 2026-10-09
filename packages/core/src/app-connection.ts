import type { Connection } from "@rakazo/contracts";
import { abortableDelay } from "./async.js";

/** Poll the authorization already begun; never repeat its connection mutation. */
export async function waitForAppConnection(
  complete: () => Promise<Connection>,
  options: { signal?: AbortSignal; attempts?: number; pollIntervalMs?: number } = {},
): Promise<Connection> {
  const attempts = options.attempts ?? 60;
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error("Use a positive connection-check limit");
  for (let attempt = 0; attempt < attempts; attempt++) {
    options.signal?.throwIfAborted();
    const connection = await complete();
    options.signal?.throwIfAborted();
    if (connection.status !== "pending" || attempt === attempts - 1) return connection;
    await abortableDelay(options.pollIntervalMs ?? 2000, options.signal);
  }
  throw new Error("Connection could not be checked");
}
