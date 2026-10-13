import type { Hono } from "hono";

/** Cover successful, rejected and streaming private responses before route guards run. */
export function mountPrivateResponseCachePolicy(app: Hono): void {
  for (const path of ["/api/auth/*", "/rpc/*", "/api/voice/*"]) {
    app.use(path, async (c, next) => {
      await next();
      c.header("cache-control", "no-store");
    });
  }
}
