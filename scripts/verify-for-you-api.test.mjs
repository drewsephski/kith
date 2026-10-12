import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyForYouApi, verifyHostedApi } from "./verify-for-you-api.mjs";

const unauthorized = () =>
  Response.json({ json: { code: "UNAUTHORIZED", status: 401 } }, { status: 401 });

const hosted = async (url) =>
  url.pathname === "/ready"
    ? Response.json({ ok: true, degraded: false })
    : url.pathname === "/api/auth/get-session"
      ? Response.json(null)
      : unauthorized();

test("checks an anonymous session as well as compatible routes", async () => {
  const requests = [];
  await verifyHostedApi("https://api.example.test", async (url, init) => {
    requests.push({ url, init });
    return hosted(url);
  });
  assert.equal(requests.length, 4);
  for (const { init } of requests.filter(({ url }) => !url.pathname.startsWith("/rpc/"))) {
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
  }
});

for (const route of ["/api/auth/get-session"]) {
  for (const response of [
    () => new Response("private database quota details", { status: 500 }),
    () => new Response("<html>SPA fallback</html>"),
    () => Response.json({ ok: false }),
    () => Response.json({ session: { token: "synthetic-session" } }),
  ]) {
    test(`rejects unavailable or invalid ${route} without disclosing response data`, async () => {
      await assert.rejects(
        verifyHostedApi("https://api.example.test", async (url) =>
          url.pathname === route ? response() : hosted(url),
        ),
        (error) => {
          assert.equal(
            error.message,
            `Hosted API unavailable: ${route}. Restore the compatible backend first.`,
          );
          return true;
        },
      );
    });
  }
}

test("checks every For you route anonymously without accepting redirects", async () => {
  const requests = [];
  await verifyForYouApi("https://api.example.test", async (url, init) => {
    requests.push({ url, init });
    return unauthorized();
  });
  assert.deepEqual(
    requests.map(({ url }) => url.pathname),
    ["/rpc/forYou/discover", "/rpc/forYou/dismiss", "/rpc/bots/launchForYou"],
  );
  for (const { init } of requests) {
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.deepEqual(init.headers, { "content-type": "application/json" });
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(JSON.parse(init.body).json.assistantId, "compatibility-probe");
  }
});

for (const route of ["forYou/discover", "forYou/dismiss", "bots/launchForYou"]) {
  test(`rejects a healthy backend missing ${route}`, async () => {
    await assert.rejects(
      verifyForYouApi("https://api.example.test", async (url) =>
        url.pathname === `/rpc/${route}`
          ? new Response("404 Not Found", { status: 404 })
          : unauthorized(),
      ),
      { message: `For you API unavailable: ${route}. Deploy the compatible backend first.` },
    );
  });
}

for (const [name, request] of [
  ["SPA fallback", async () => new Response("<html>Sign in</html>")],
  ["unprotected route", async () => Response.json({ json: {} })],
  ["unrelated unauthorized response", async () => Response.json({}, { status: 401 })],
  [
    "wrong RPC error",
    async () => Response.json({ json: { code: "BAD_REQUEST", status: 401 } }, { status: 401 }),
  ],
  [
    "wrong error status",
    async () => Response.json({ json: { code: "UNAUTHORIZED", status: 404 } }, { status: 401 }),
  ],
  [
    "network failure",
    async () => {
      throw new Error("private transport details");
    },
  ],
]) {
  test(`rejects ${name} without disclosing the destination or response`, async () => {
    await assert.rejects(verifyForYouApi("https://api.example.test", request), (error) => {
      assert.match(error.message, /Deploy the compatible backend first/);
      assert.doesNotMatch(error.message, /api\.example|private transport|<html>/);
      return true;
    });
  });
}
