import { afterEach, expect, it, vi } from "vitest";
import { privateApiFetch } from "./private-api-fetch";

afterEach(() => vi.unstubAllGlobals());

it("keeps shared native private requests out of caches and cookie jars", async () => {
  const response = new Response("private", { headers: { "cache-control": "no-store" } });
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  await expect(
    privateApiFetch("https://api.example.test/rpc/me", {
      method: "POST",
      credentials: "include",
      headers: new Headers({
        authorization: "Bearer fake-token",
        "x-rakazo-space-id": "space-a",
        "cache-control": "public, max-age=3600",
      }),
      signal: controller.signal,
      body: "{}",
    }),
  ).resolves.toBe(response);
  expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/rpc/me", {
    method: "POST",
    credentials: "omit",
    headers: {
      authorization: "Bearer fake-token",
      "x-rakazo-space-id": "space-a",
      "cache-control": "no-store, no-cache",
    },
    signal: controller.signal,
    body: "{}",
  });
});

it("preserves explicit bearer auth and reads sign-in tokens without native cookies", async () => {
  const response = new Response('{"token":"fake-token"}', {
    headers: { "set-cookie": "better-auth.session_token=fake-token; HttpOnly" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  const result = await privateApiFetch("https://api.example.test/api/auth/sign-in/email");
  expect(await result.json()).toEqual({ token: "fake-token" });
  expect(result.headers.get("set-cookie")).toContain("better-auth.session_token=fake-token");
});

it("preserves authorization on a Request input while overriding its cookie policy", async () => {
  const fetchMock = vi.fn(async () => new Response("private"));
  vi.stubGlobal("fetch", fetchMock);
  const request = new Request("https://api.example.test/rpc/me", {
    credentials: "include",
    headers: {
      authorization: "Bearer fake-token",
      "x-rakazo-space-id": "space-a",
      cookie: "better-auth.session_token=old-account-token",
    },
  });
  await privateApiFetch(request);
  expect(fetchMock).toHaveBeenCalledWith(
    request,
    expect.objectContaining({
      credentials: "omit",
      headers: {
        authorization: "Bearer fake-token",
        "x-rakazo-space-id": "space-a",
        "cache-control": "no-store, no-cache",
      },
    }),
  );
});
