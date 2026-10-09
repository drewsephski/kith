import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { publicBackendOrigin, vercelBuildConfig, writeVercelOutput } from "./vercel-build.mjs";

test("accepts public HTTPS roots and canonicalizes only a trailing slash", () => {
  assert.equal(
    publicBackendOrigin(" https://kith-example.fly.dev/ "),
    "https://kith-example.fly.dev",
  );
  assert.equal(publicBackendOrigin("https://API.example.com:443"), "https://api.example.com");
});

test("rejects missing, private, credential-bearing and non-root proxy destinations", () => {
  for (const invalid of [
    undefined,
    "",
    "http://api.example.com",
    "https://localhost",
    "https://api.localhost",
    "https://api.internal",
    "https://api.local",
    "https://api.test",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://192.168.1.20",
    "https://user:secret@api.example.com",
    "https://api.example.com/rpc",
    "https://api.example.com/rpc/..",
    "https://api.example.com/./",
    "https://api.example.com/?key=secret",
    "https://api.example.com/#secret",
    "https://api.example.com.",
  ]) {
    assert.throws(() => publicBackendOrigin(invalid), /API_PROXY_TARGET/);
  }
});

test("routes auth, RPC and screen requests to the backend without CDN caching", () => {
  const { routes } = vercelBuildConfig("https://kith-example.fly.dev");
  for (const requestPath of [
    "/api",
    "/api/auth/get-session",
    "/rpc/feed/stream",
    "/novnc/session/view/token/websockify",
  ]) {
    const route = routes.find((item) => item.src && new RegExp(item.src).test(requestPath));
    const match = new RegExp(route.src).exec(requestPath);
    assert.equal(route.dest.replace("$1", match[1]), `https://kith-example.fly.dev${requestPath}`);
    assert.equal(route.headers["Cache-Control"], "private, no-store");
    assert.equal(route.headers["Vercel-CDN-Cache-Control"], "no-store");
    assert.equal(route.headers["CDN-Cache-Control"], "no-store");
  }
  assert.equal(new RegExp(routes[0].src).test("/rpc-example"), false);
  assert.equal(new RegExp(routes[0].src).test("/api-key"), false);
  assert.equal(routes[1].dest, "https://kith-example.fly.dev/health");
  assert.deepEqual(routes[2], { handle: "filesystem" });
  assert.deepEqual(routes[3].methods, ["GET", "HEAD"]);
  assert.equal(routes[3].dest, "/index.html");
});

test("writes static assets and routing output without retaining stale files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kith-vercel-test-"));
  const dist = path.join(root, "dist");
  const output = path.join(root, "output");
  try {
    await mkdir(dist);
    await mkdir(output);
    await writeFile(path.join(dist, "index.html"), "<html>Kith</html>");
    await writeFile(path.join(output, "stale.txt"), "old");
    await writeVercelOutput({ target: "https://kith-example.fly.dev", dist, output });
    assert.equal(
      await readFile(path.join(output, "static/index.html"), "utf8"),
      "<html>Kith</html>",
    );
    const config = JSON.parse(await readFile(path.join(output, "config.json"), "utf8"));
    assert.equal(config.version, 3);
    await assert.rejects(readFile(path.join(output, "stale.txt")), { code: "ENOENT" });
    await assert.rejects(
      writeVercelOutput({ target: "https://user:secret@api.example.com", dist, output }),
      /without credentials/,
    );
    assert.equal(
      await readFile(path.join(output, "static/index.html"), "utf8"),
      "<html>Kith</html>",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authenticates only the auth proxy handoff without sharing its token with screen upstreams", () => {
  const secret = "offline_proxy_secret_0123456789abcdef";
  const { routes } = vercelBuildConfig("https://kith-example.fly.dev", secret);
  const routeFor = (pathname) =>
    routes.find((route) => route.src && new RegExp(route.src).test(pathname));
  for (const pathname of ["/api/auth", "/api/auth/get-session", "/api/auth/sign-in/email"]) {
    const route = routeFor(pathname);
    assert.deepEqual(route.transforms, [
      {
        type: "request.headers",
        op: "set",
        target: { key: "x-kith-proxy-token" },
        args: secret,
      },
    ]);
    assert.ok(!JSON.stringify(route.headers).includes(secret));
  }
  for (const pathname of [
    "/api/other",
    "/api/auth-other",
    "/rpc/feed/stream",
    "/novnc/session/view/token",
    "/health",
    "/assets/index.js",
  ]) {
    assert.equal(routeFor(pathname)?.transforms, undefined);
  }
  for (const invalid of ["short", "x".repeat(257), `${"x".repeat(32)}\r\n`]) {
    assert.throws(
      () => vercelBuildConfig("https://kith-example.fly.dev", invalid),
      /AUTH_PROXY_SECRET/,
    );
  }
});
