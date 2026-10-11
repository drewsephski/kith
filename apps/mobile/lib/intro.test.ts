import { expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    storage.set(key, value);
  },
}));

import { loadIntroProgress, parseIntroProgress, saveIntroProgress } from "./intro";

it("starts at Meet Kith and resumes an interrupted introduction", async () => {
  expect(await loadIntroProgress()).toEqual({ scene: 0, complete: false });
  await saveIntroProgress({ scene: 1, complete: false });
  vi.resetModules();
  const restarted = await import("./intro");
  expect(await restarted.loadIntroProgress()).toEqual({ scene: 1, complete: false });
});
it("persists skip/completion across restart without account or server dependence", async () => {
  await saveIntroProgress({ scene: 2, complete: true });
  vi.resetModules();
  const restarted = await import("./intro");
  expect(await restarted.loadIntroProgress()).toEqual({ scene: 2, complete: true });
});
it.each([null, "bad", '{"scene":-1,"complete":false}', '{"scene":4,"complete":true}'])(
  "recovers an invalid or older record: %s",
  (raw) => {
    expect(parseIntroProgress(raw)).toEqual({ scene: 0, complete: false });
  },
);
