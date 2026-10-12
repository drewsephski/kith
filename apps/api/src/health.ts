import { Hono } from "hono";

/**
 * `/health` is public liveness, so it stays a constant body. Deployment details are for
 * operators on the API port; a reverse proxy adds forwarding headers, so a request that
 * carries them came through the public edge and gets no details.
 */
export function healthRoutes(
  details: () => Record<string, unknown>,
  checkDatabase?: () => Promise<unknown>,
) {
  const app = new Hono();
  let pendingProbe: Promise<boolean> | undefined;
  const databaseReady = async () => {
    if (!checkDatabase) return true;
    // Share a slow probe rather than consuming another pool slot per health read.
    pendingProbe ??= Promise.resolve()
      .then(checkDatabase)
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        pendingProbe = undefined;
      });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pendingProbe,
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => resolve(false), 3_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  };
  app.get("/ready", async (c) => {
    const degraded = details().degraded === true || !(await databaseReady());
    return c.json({ ok: !degraded, degraded }, degraded ? 503 : 200);
  });
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/internal/health", async (c) => {
    if (c.req.header("x-forwarded-for") || c.req.header("forwarded")) return c.notFound();
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
