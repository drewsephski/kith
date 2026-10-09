import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { QuickAskController, quickAskBounds } from "./quick-ask";

function windowFixture() {
  const bounds = { x: 60, y: 80, width: 1200, height: 800 };
  const win = {
    getNormalBounds: () => bounds,
    isMaximized: () => true,
    isFullScreen: () => false,
    isAlwaysOnTop: () => false,
    isDestroyed: () => false,
    once: vi.fn<(name: string, listener: () => void) => void>(),
    setBounds: vi.fn(),
    setFullScreen: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    unmaximize: vi.fn(),
    maximize: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    webContents: { send: vi.fn() },
  };
  return { win, native: win as unknown as BrowserWindow, bounds };
}

describe("Quick Ask", () => {
  it("waits for the native fullscreen transition before resizing", () => {
    const { win, native } = windowFixture();
    vi.spyOn(win, "isFullScreen").mockReturnValue(true);
    const controller = new QuickAskController();
    controller.enter(native, { x: 0, y: 0, width: 1440, height: 900 });
    expect(win.setBounds).not.toHaveBeenCalled();
    expect(win.once).toHaveBeenCalledWith("leave-full-screen", expect.any(Function));
    vi.spyOn(win, "isFullScreen").mockReturnValue(false);
    win.once.mock.calls[0]?.[1]();
    expect(win.setBounds).toHaveBeenCalledOnce();
    controller.leave(native);
    expect(win.setFullScreen).toHaveBeenLastCalledWith(true);
  });

  it("fits the current display's work area, including small displays", () => {
    expect(quickAskBounds({ x: 100, y: 50, width: 600, height: 400 })).toEqual({
      x: 100,
      y: 50,
      width: 600,
      height: 400,
    });
    expect(quickAskBounds({ x: 1440, y: 24, width: 1440, height: 900 })).toEqual({
      x: 1800,
      y: 144,
      width: 720,
      height: 520,
    });
  });

  it("restores the original window when expanded, even after repeated enter calls", () => {
    const { win, native, bounds } = windowFixture();
    const controller = new QuickAskController();
    const area = { x: 0, y: 0, width: 1440, height: 900 };
    controller.enter(native, area);
    controller.enter(native, area);
    expect(win.setBounds).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith("desktop.quickAsk.changed", true);
    expect(controller.active()).toBe(true);
    controller.leave(native);
    expect(win.setBounds).toHaveBeenLastCalledWith(bounds);
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(win.maximize).toHaveBeenCalledOnce();
    expect(controller.active()).toBe(false);
    expect(win.hide).not.toHaveBeenCalled();
  });

  it("dismisses without destroying the authenticated window", () => {
    const { win, native } = windowFixture();
    const controller = new QuickAskController();
    controller.enter(native, { x: 0, y: 0, width: 1440, height: 900 });
    controller.leave(native, true);
    controller.leave(native, true);
    expect(win.hide).toHaveBeenCalledOnce();
    expect(win.webContents.send).toHaveBeenLastCalledWith("desktop.quickAsk.changed", false);
  });
});
