import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyForYouApi } from "./verify-for-you-api.mjs";

const unauthorized = () =>
  Response.json({ json: { code: "UNAUTHORIZED", status: 401 } }, { status: 401 });

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
