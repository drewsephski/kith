import type { Pool } from "@rakazo/db";
import { Hono } from "hono";

const pendingCheckouts = new WeakSet<Pool>();

/** Destroy only the probe's checked-out connection when its read stalls. */
export async function checkDatabaseReadiness(pool: Pool, signal: AbortSignal) {
  signal.throwIfAborted();
  // Expiry cannot cancel the shared pool's connection/retry queue. Keep only
  // one checkout pending until it settles, even after the HTTP deadline.
  if (pendingCheckouts.has(pool)) throw new Error("Readiness checkout pending");
  pendingCheckouts.add(pool);
  const client = await pool.connect().finally(() => pendingCheckouts.delete(pool));
  let released = false;
  const destroy = () => {
    if (released) return;
    released = true;
    client.release(true);
  };
  if (signal.aborted) {
    // No query ran: this recovered connection is healthy and can be reused.
    client.release();
    throw new Error("Readiness probe expired");
  }
  signal.addEventListener("abort", destroy, { once: true });
  try {
    await client.query("SELECT 1");
  } catch (error) {
    destroy();
    throw error;
  } finally {
    signal.removeEventListener("abort", destroy);
    if (!released) client.release();
  }
}

/**
 * `/health` is public liveness, so it stays a constant body. Deployment details are for
 * operators on the API port; a reverse proxy adds forwarding headers, so a request that
 * carries them came through the public edge and gets no details.
 */
export function healthRoutes(
  details: () => Record<string, unknown>,
  checkDatabase?: (signal: AbortSignal) => Promise<unknown>,
) {
  const app = new Hono();
  let pendingProbe: Promise<boolean> | undefined;
  const databaseReady = async () => {
    if (!checkDatabase) return true;
    // Share a slow probe rather than consuming another pool slot per health read.
    if (!pendingProbe) {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      const probe = Promise.race([
        Promise.resolve()
          .then(() => checkDatabase(controller.signal))
          .then(
            () => true,
            () => false,
          ),
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => {
            controller.abort();
            resolve(false);
          }, 3_000);
        }),
      ]).finally(() => {
        clearTimeout(timeout);
        if (pendingProbe === probe) pendingProbe = undefined;
      });
      pendingProbe = probe;
    }
    return pendingProbe;
  };
  app.get("/ready", async (c) => {
    c.header("cache-control", "no-store");
    const degraded = details().degraded === true || !(await databaseReady());
    return c.json({ ok: !degraded, degraded }, degraded ? 503 : 200);
  });
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/internal/health", async (c) => {
    if (c.req.header("x-forwarded-for") || c.req.header("forwarded")) return c.notFound();
    c.header("cache-control", "no-store");
    const state = details();
    const database = await databaseReady();
    return c.json({
      ok: database,
      ...state,
      degraded: state.degraded === true || !database,
      ...(checkDatabase ? { database } : {}),
    });
  });
  return app;
}
