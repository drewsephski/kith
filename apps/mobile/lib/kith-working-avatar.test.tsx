// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KithWorkingAvatar } from "../components/kith-working-avatar";

const state = vi.hoisted(() => ({
  motion: new Set<(enabled: boolean) => void>(),
  app: new Set<(status: string) => void>(),
}));

vi.mock("react-native", () => ({
  Image: ({ source, onError }: { source: unknown; onError: () => void }) =>
    createElement("button", { type: "button", "data-source": String(source), onClick: onError }),
  StyleSheet: { create: <T,>(styles: T) => styles },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: (_event: string, callback: (enabled: boolean) => void) => {
      state.motion.add(callback);
      return { remove: () => state.motion.delete(callback) };
    },
  },
  AppState: {
    currentState: "active",
    addEventListener: (_event: string, callback: (status: string) => void) => {
      state.app.add(callback);
      return { remove: () => state.app.delete(callback) };
    },
  },
}));

describe("native companion playback", () => {
  let root: Root;
  let container: HTMLDivElement;
  const source = () => container.querySelector("button")?.getAttribute("data-source");

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    expect(state.motion.size).toBe(0);
    expect(state.app.size).toBe(0);
    container.remove();
    vi.unstubAllGlobals();
  });

  it("stops when the loading row leaves view and resumes when visible", async () => {
    await act(async () => root.render(<KithWorkingAvatar active />));
    expect(source()).toContain("kith-companion-working.gif");
    act(() => root.render(<KithWorkingAvatar active={false} />));
    expect(source()).toContain("kith-companion.png");
    act(() => root.render(<KithWorkingAvatar active />));
    expect(source()).toContain("kith-companion-working.gif");
  });

  it("responds to native Reduce Motion and application background events", async () => {
    await act(async () => root.render(<KithWorkingAvatar active />));
    act(() => {
      for (const callback of state.motion) callback(true);
    });
    expect(source()).toContain("kith-companion.png");
    act(() => {
      for (const callback of state.motion) callback(false);
    });
    expect(source()).toContain("kith-companion-working.gif");
    act(() => {
      for (const callback of state.app) callback("background");
    });
    expect(source()).toContain("kith-companion.png");
    act(() => {
      for (const callback of state.app) callback("active");
    });
    expect(source()).toContain("kith-companion-working.gif");
  });

  it("uses the still artwork after a decoder error", async () => {
    await act(async () => root.render(<KithWorkingAvatar active />));
    act(() => container.querySelector("button")?.click());
    expect(source()).toContain("kith-companion.png");
  });
});
