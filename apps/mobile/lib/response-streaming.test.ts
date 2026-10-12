import { RESPONSE_STREAMING_STORAGE_KEY } from "@rakazo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

describe("mobile response streaming preference", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("keeps text hidden until the stored preference is known", async () => {
    const { getCachedResponseStreamingEnabled, setResponseStreamingPreference } = await import(
      "./response-streaming"
    );
    expect(getCachedResponseStreamingEnabled()).toBe(false);
    await setResponseStreamingPreference("on");
    expect(getCachedResponseStreamingEnabled()).toBe(true);
  });

  it("enables streaming for a missing preference without overwriting an explicit off", async () => {
    const { loadResponseStreamingPreference, getCachedResponseStreamingEnabled } = await import(
      "./response-streaming"
    );
    await expect(loadResponseStreamingPreference()).resolves.toBe("on");
    expect(getCachedResponseStreamingEnabled()).toBe(true);
    store.set(RESPONSE_STREAMING_STORAGE_KEY, "off");
    await expect(loadResponseStreamingPreference()).resolves.toBe("off");
    expect(store.get(RESPONSE_STREAMING_STORAGE_KEY)).toBe("off");
  });

  it("does not let a late storage read overwrite a new toggle choice", async () => {
    const { getItemAsync } = await import("expo-secure-store");
    let finish!: (value: string | null) => void;
    vi.mocked(getItemAsync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { loadResponseStreamingPreference, setResponseStreamingPreference } = await import(
      "./response-streaming"
    );
    const pending = loadResponseStreamingPreference();
    await setResponseStreamingPreference("off");
    finish(null);
    await expect(pending).resolves.toBe("off");
  });

  it("loads a saved on preference and notifies subscribers", async () => {
    const { loadResponseStreamingPreference, subscribeResponseStreaming } = await import(
      "./response-streaming"
    );
    store.set(RESPONSE_STREAMING_STORAGE_KEY, "on");
    const listener = vi.fn();
    subscribeResponseStreaming(listener);

    await expect(loadResponseStreamingPreference()).resolves.toBe("on");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("notifies subscribers before SecureStore finishes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { setItemAsync } = await import("expo-secure-store");
    vi.mocked(setItemAsync).mockImplementation(async () => {
      await gate;
    });
    const {
      getCachedResponseStreamingEnabled,
      setResponseStreamingPreference,
      subscribeResponseStreaming,
    } = await import("./response-streaming");
    const listener = vi.fn();
    subscribeResponseStreaming(listener);

    const pending = setResponseStreamingPreference("on");
    expect(getCachedResponseStreamingEnabled()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    release();
    await pending;
  });

  it("normalizes an empty stored value to off", async () => {
    store.set(RESPONSE_STREAMING_STORAGE_KEY, "");
    const { loadResponseStreamingPreference } = await import("./response-streaming");
    await expect(loadResponseStreamingPreference()).resolves.toBe("off");
  });
});
