import type { BrowserWindow, Rectangle } from "electron";

export function quickAskBounds(area: Rectangle): Rectangle {
  const width = Math.min(720, area.width);
  const height = Math.min(520, area.height);
  return {
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + Math.min(120, (area.height - height) / 3)),
  };
}

/** Keep a restored window reachable if its display was disconnected during Quick Ask. */
export function reachableBounds(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
  };
}

/** Reuse the authenticated window and partition; never create another execution surface. */
export class QuickAskController {
  private previous: {
    bounds: Rectangle;
    maximized: boolean;
    fullScreen: boolean;
    alwaysOnTop: boolean;
  } | null = null;
  active() {
    return this.previous !== null;
  }
  enter(win: BrowserWindow, area: Rectangle) {
    if (this.previous) return;
    const previous = {
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
      alwaysOnTop: win.isAlwaysOnTop(),
    };
    this.previous = previous;
    const present = () => {
      if (this.previous !== previous || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      if (previous.maximized) win.unmaximize();
      win.setBounds(quickAskBounds(area));
      win.setAlwaysOnTop(true);
      win.webContents.send("desktop.quickAsk.changed", true);
      win.show();
      win.focus();
    };
    // macOS changes fullscreen asynchronously; resizing before this event is ignored.
    if (previous.fullScreen) {
      win.once("leave-full-screen", present);
      win.setFullScreen(false);
    } else present();
  }
  leave(win: BrowserWindow, hide = false, getWorkArea?: (bounds: Rectangle) => Rectangle) {
    const previous = this.previous;
    if (!previous) return;
    this.previous = null;
    const restore = () => {
      if (this.previous || win.isDestroyed()) return;
      win.setAlwaysOnTop(previous.alwaysOnTop);
      win.setBounds(
        getWorkArea
          ? reachableBounds(previous.bounds, getWorkArea(previous.bounds))
          : previous.bounds,
      );
      if (previous.maximized) win.maximize();
      if (previous.fullScreen) win.setFullScreen(true);
      win.webContents.send("desktop.quickAsk.changed", false);
      if (hide) win.hide();
      else {
        win.show();
        win.focus();
      }
    };
    if (win.isFullScreen()) {
      win.once("leave-full-screen", restore);
      win.setFullScreen(false);
    } else restore();
  }
  reset() {
    this.previous = null;
  }
}
