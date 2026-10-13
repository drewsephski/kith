import { expect, it } from "vitest";
import { createNativePrivateNetworkRecorder } from "./native-private-network.js";

const nativeHeaders = {
  origin: "rakazo://",
  "cache-control": "no-store, no-cache",
};
const noStore = { "cache-control": "no-store" };

function completeJourney(recorder: ReturnType<typeof createNativePrivateNetworkRecorder>) {
  recorder.observe(
    new Request("https://api.example.test/api/auth/sign-in/email", { headers: nativeHeaders }),
    new Response(null, { headers: noStore }),
  );
  recorder.observe(
    new Request("https://api.example.test/rpc/threads/subscribe", {
      headers: { ...nativeHeaders, authorization: "Bearer private-token-sentinel" },
    }),
    new Response("private-conversation-sentinel", {
      headers: { ...noStore, "content-type": "text/event-stream" },
    }),
  );
}

it("accepts actual native auth and authenticated stream policy with sanitized evidence", () => {
  const recorder = createNativePrivateNetworkRecorder();
  completeJourney(recorder);
  expect(() => recorder.assert()).not.toThrow();
  expect(recorder.snapshot()).toMatchObject({
    privateRequests: 2,
    authRequests: 1,
    rpcRequests: 1,
    bearerRequests: 1,
    successfulBearerRpcResponses: 1,
    streamResponses: 1,
    requestCachePolicyFailures: 0,
    cookieFailures: 0,
    responseCachePolicyFailures: 0,
  });
  const saved = JSON.stringify(recorder.snapshot());
  expect(saved).not.toContain("sentinel");
  expect(saved).not.toContain("example.test");
  expect(saved).not.toContain("subscribe");
  recorder.snapshot().privateRequests = 99;
  expect(recorder.snapshot().privateRequests).toBe(2);
});

it("ignores anonymous probes and public assets", () => {
  const recorder = createNativePrivateNetworkRecorder();
  for (const [pathname, origin] of [
    ["/rpc/health", "rakazo://"],
    ["/assets/logo.svg", "rakazo://"],
  ])
    recorder.observe(
      new Request(`https://api.example.test${pathname}`, {
        headers: { origin: origin!, cookie: "private-cookie-sentinel" },
      }),
      new Response(null, { headers: { "cache-control": "public, max-age=3600" } }),
    );
  expect(recorder.snapshot().privateRequests).toBe(0);
  expect(() => recorder.assert()).toThrow("Native private network acceptance failed");
});

it("cannot hide private requests by omitting the native Origin header", () => {
  const recorder = createNativePrivateNetworkRecorder();
  completeJourney(recorder);
  recorder.observe(
    new Request("https://api.example.test/api/auth/get-session"),
    new Response(null, { status: 401, headers: noStore }),
  );
  expect(recorder.snapshot()).toMatchObject({ privateRequests: 3, requestCachePolicyFailures: 1 });
  expect(() => recorder.assert()).toThrow("Native private network acceptance failed");
});

it.each(["missing-cache", "cookie", "cacheable-response", "missing-bearer"])(
  "rejects %s on otherwise passing native execution",
  (failure) => {
    const recorder = createNativePrivateNetworkRecorder();
    completeJourney(recorder);
    const headers = new Headers(nativeHeaders);
    headers.set("authorization", "Bearer private-token-sentinel");
    if (failure === "missing-cache") headers.set("cache-control", "no-store");
    if (failure === "cookie") headers.set("cookie", "private-cookie-sentinel");
    if (failure === "missing-bearer") headers.delete("authorization");
    recorder.observe(
      new Request("https://api.example.test/rpc/me", { headers }),
      new Response(null, {
        headers: failure === "cacheable-response" ? { "cache-control": "public" } : noStore,
      }),
    );
    expect(() => recorder.assert()).toThrow("Native private network acceptance failed");
    try {
      recorder.assert();
    } catch (error) {
      expect(String(error)).not.toContain("sentinel");
      expect(String(error)).not.toContain("example.test");
    }
  },
);

it("checks failed, conditional and voice responses without requiring a bearer on rejections", () => {
  const recorder = createNativePrivateNetworkRecorder();
  completeJourney(recorder);
  for (const status of [401, 413, 304])
    recorder.observe(
      new Request("https://api.example.test/rpc/me", { headers: nativeHeaders }),
      new Response(null, { status, headers: noStore }),
    );
  recorder.observe(
    new Request("https://api.example.test/api/voice/speak", {
      headers: { ...nativeHeaders, authorization: "Bearer private-token-sentinel" },
    }),
    new Response(null, { headers: noStore }),
  );
  expect(recorder.snapshot()).toMatchObject({ errorResponses: 2, voiceRequests: 1 });
  expect(() => recorder.assert()).not.toThrow();
});
