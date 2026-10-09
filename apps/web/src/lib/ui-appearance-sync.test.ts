// @vitest-environment jsdom

import { darkTokens, lightTokens, UI_APPEARANCE_STORAGE_KEY } from "@rakazo/ui-tokens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyUiAppearance,
  getResolvedUiAppearance,
  getUiAppearancePreference,
  setUiAppearance,
  subscribeUiAppearance,
  watchUiAppearance,
} from "./ui-appearance";

let systemLight = false;
const mediaListeners = new Set<() => void>();
let stopWatching: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("localStorage", window.localStorage);
  localStorage.clear();
  systemLight = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemLight;
    },
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  }));
  document.head.innerHTML = '<meta name="theme-color" content="">';
  applyUiAppearance("system");
});

afterEach(() => {
  stopWatching?.();
  stopWatching = undefined;
  mediaListeners.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("appearance synchronization", () => {
  it("persists choices and updates subscribers, browser chrome, and the root together", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUiAppearance(listener);
    try {
      setUiAppearance("light");
      expect(localStorage.getItem(UI_APPEARANCE_STORAGE_KEY)).toBe("light");
      expect(getUiAppearancePreference()).toBe("light");
      expect(getResolvedUiAppearance()).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
        lightTokens.background,
      );
      expect(listener).toHaveBeenCalledOnce();
      unsubscribe();
      setUiAppearance("dark");
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("retains the active choice when storage is unavailable and the OS changes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    stopWatching = watchUiAppearance();
    setUiAppearance("light");
    for (const listener of mediaListeners) listener();
    expect(getUiAppearancePreference()).toBe("light");
    expect(getResolvedUiAppearance()).toBe("light");
  });

  it("tracks the OS only in System mode and cleans up listeners", () => {
    stopWatching = watchUiAppearance();
    systemLight = true;
    for (const listener of mediaListeners) listener();
    expect(getResolvedUiAppearance()).toBe("light");
    setUiAppearance("dark");
    for (const listener of mediaListeners) listener();
    expect(getResolvedUiAppearance()).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      darkTokens.background,
    );
    setUiAppearance("system");
    expect(getResolvedUiAppearance()).toBe("light");
    stopWatching();
    expect(mediaListeners.size).toBe(0);
  });

  it("applies choices from other windows and returns to System on removal or clear", () => {
    stopWatching = watchUiAppearance();
    const storageChange = (key: string | null, newValue: string | null) => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue, storageArea: localStorage }),
      );
    };
    storageChange("other-setting", "light");
    expect(getUiAppearancePreference()).toBe("system");
    storageChange(UI_APPEARANCE_STORAGE_KEY, "light");
    expect(getResolvedUiAppearance()).toBe("light");
    storageChange(UI_APPEARANCE_STORAGE_KEY, null);
    expect(getUiAppearancePreference()).toBe("system");
    expect(getResolvedUiAppearance()).toBe("dark");
    storageChange(UI_APPEARANCE_STORAGE_KEY, "light");
    storageChange(null, null);
    expect(getResolvedUiAppearance()).toBe("dark");
    stopWatching();
    storageChange(UI_APPEARANCE_STORAGE_KEY, "light");
    expect(getResolvedUiAppearance()).toBe("dark");
  });
});
