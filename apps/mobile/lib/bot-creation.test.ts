import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stored: new Map<string, string>(),
  current: true,
  scope: "scope",
  createFailure: false,
  storageFailure: false,
  context: { apiBase: "https://example.test", headers: {} },
}));
const rpc = vi.hoisted(() =>
  vi.fn(async (procedure: string) => {
    if (procedure === "me") return { userId: "test-user", spaceId: "test-space" };
    if (state.createFailure) throw new Error("Lost response");
    return { id: "test-bot", name: "New bot" };
  }),
);
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => state.stored.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (state.storageFailure) throw new Error("Storage unavailable");
    state.stored.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    state.stored.delete(key);
  }),
}));
vi.mock("./api", () => ({
  rpc,
  captureMobileScreenScope: () => {
    const scope = state.scope;
    return () => state.current && state.scope === scope;
  },
  mobileScreenScopeKey: () => state.scope,
  captureApiRequestContext: async () => state.context,
}));

import { createConversationalBot } from "./bot-creation";

describe("explicit conversational bot creation", () => {
  beforeEach(() => {
    state.stored.clear();
    state.current = true;
    state.scope = "scope";
    state.createFailure = false;
    state.storageFailure = false;
    rpc.mockClear();
  });
  it("coalesces rapid taps and uses a pinned authenticated request context", async () => {
    const first = createConversationalBot();
    const second = createConversationalBot();
    expect(first).toBe(second);
    expect(await first).toEqual({ id: "test-bot", name: "New bot" });
    expect(rpc.mock.calls.filter(([procedure]) => procedure === "onboarding/create")).toHaveLength(
      1,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "onboarding/create",
      expect.objectContaining({ clientNonce: expect.any(String) }),
      { requestContext: state.context },
    );
    expect(state.stored.size).toBe(0);
  });
  it("retains the nonce after an uncertain response and reuses it only on an explicit retry", async () => {
    state.createFailure = true;
    await expect(createConversationalBot()).rejects.toThrow("Lost response");
    const nonce = [...state.stored.values()][0];
    expect(nonce).toBeTruthy();
    state.createFailure = false;
    await createConversationalBot();
    expect(rpc).toHaveBeenLastCalledWith(
      "onboarding/create",
      { clientNonce: nonce },
      { requestContext: state.context },
    );
    expect(state.stored.size).toBe(0);
  });
  it("does not create without durable intent storage", async () => {
    state.storageFailure = true;
    await expect(createConversationalBot()).rejects.toThrow("Storage unavailable");
    expect(rpc.mock.calls.some(([procedure]) => procedure === "onboarding/create")).toBe(false);
  });
  it("does not navigate or create after account/Space scope changes", async () => {
    state.current = false;
    expect(await createConversationalBot()).toBeNull();
    expect(rpc.mock.calls.some(([procedure]) => procedure === "onboarding/create")).toBe(false);
  });
  it("settles only a definitive removed intent and does not automatically create a replacement", async () => {
    rpc.mockImplementationOnce(async () => ({ userId: "test-user", spaceId: "test-space" }));
    rpc.mockRejectedValueOnce(
      Object.assign(new Error("This bot is no longer available."), {
        code: "ONBOARDING_TARGET_REMOVED",
      }),
    );
    await expect(createConversationalBot()).rejects.toThrow("This bot is no longer available.");
    expect(state.stored.size).toBe(0);
    expect(rpc.mock.calls.filter(([procedure]) => procedure === "onboarding/create")).toHaveLength(
      1,
    );
  });
  it("a terminal response from an earlier scope epoch cannot clear the new creation intent", async () => {
    let rejectOld: (reason: unknown) => void = () => undefined;
    let resolveNew: (value: { id: string; name: string }) => void = () => undefined;
    rpc.mockImplementationOnce(async () => ({ userId: "test-user", spaceId: "test-space" }));
    rpc.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    const old = createConversationalBot();
    await vi.waitFor(() =>
      expect(
        rpc.mock.calls.filter(([procedure]) => procedure === "onboarding/create"),
      ).toHaveLength(1),
    );
    state.scope = "new-scope-epoch";
    const key = [...state.stored.keys()][0]!;
    const nextNonce = "00000000-0000-4000-8000-000000000002";
    state.stored.set(key, nextNonce);
    rpc.mockImplementationOnce(async () => ({ userId: "test-user", spaceId: "test-space" }));
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNew = resolve;
        }),
    );
    const next = createConversationalBot();
    await vi.waitFor(() =>
      expect(
        rpc.mock.calls.filter(([procedure]) => procedure === "onboarding/create"),
      ).toHaveLength(2),
    );
    rejectOld(Object.assign(new Error("Removed"), { code: "ONBOARDING_TARGET_REMOVED" }));
    await expect(old).rejects.toThrow("Removed");
    expect(state.stored.get(key)).toBe(nextNonce);
    resolveNew({ id: "next-bot", name: "New bot" });
    expect(await next).toEqual({ id: "next-bot", name: "New bot" });
    expect(state.stored.size).toBe(0);
  });
});
