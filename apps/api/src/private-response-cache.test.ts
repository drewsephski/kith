import { Hono } from "hono";
import { expect, it } from "vitest";
import { mountPrivateResponseCachePolicy } from "./private-response-cache.js";
import { mountApiRequestBodyLimits } from "./request-body-limit.js";

it("prevents caching private success, error, conditional and streaming responses", async () => {
  const app = new Hono();
  mountPrivateResponseCachePolicy(app);
  mountApiRequestBodyLimits(app);
  app.post("/api/auth/sign-in/email", (c) => c.json({ token: "fake-token" }));
  app.get("/api/auth/get-session", (c) => c.json({ userId: "fake-user" }));
  app.post("/rpc/me", (c) => c.json({ error: "Unauthorized" }, 401));
  app.get("/rpc/conditional", () => new Response(null, { status: 304 }));
  app.post(
    "/rpc/threads/subscribe",
    () =>
      new Response('data: {"json":{"type":"heartbeat"}}\n\n', {
        headers: { "content-type": "text/event-stream", "cache-control": "public" },
      }),
  );
  app.post("/api/voice/speak", () => new Response("private-audio"));
  app.get("/assets/logo.svg", (c) => {
    c.header("cache-control", "public, max-age=3600");
    return c.text("safe-public-asset");
  });
  const requests = [
    ["/api/auth/sign-in/email", { method: "POST" }, 200],
    ["/api/auth/get-session", {}, 200],
    ["/api/auth/not-a-route", {}, 404],
    [
      "/api/auth/sign-in/email",
      { method: "POST", headers: { "content-length": "1048576" }, body: "{}" },
      413,
    ],
    ["/rpc/me", { method: "POST" }, 401],
    ["/rpc/conditional", { headers: { "if-none-match": "fake-validator" } }, 304],
    ["/rpc/not-a-route", {}, 404],
    ["/rpc/threads/subscribe", { method: "POST" }, 200],
    ["/api/voice/speak", { method: "POST" }, 200],
  ] as const;
  for (const [path, init, status] of requests) {
    const response = await app.request(path, init);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  const asset = await app.request("/assets/logo.svg");
  expect(asset.headers.get("cache-control")).toBe("public, max-age=3600");
});
