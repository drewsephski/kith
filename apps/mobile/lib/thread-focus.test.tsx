// @vitest-environment jsdom
import { act, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  focused: true,
  scope: "space-a:0",
  listeners: new Set<() => void>(),
  rpc: vi.fn(),
  notifications: vi.fn(async () => undefined),
  saveLast: vi.fn(async () => undefined),
  focusPrompt: vi.fn(),
  cancelPrompt: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (effect: () => () => void) => {
    const focused = useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => {
          state.listeners.delete(listener);
        };
      },
      () => state.focused,
    );
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
vi.mock("./api", () => ({
  rpc: state.rpc,
  mobileScreenScopeKey: () => state.scope,
  captureMobileScreenScope: () => {
    const scope = state.scope;
    return () => scope === state.scope;
  },
}));
vi.mock("./focus-prompt", () => ({
  focusPromptThreadActive: state.focusPrompt,
  cancelFocusPrompt: state.cancelPrompt,
}));
vi.mock("./last-bot", () => ({ saveLastBotId: state.saveLast }));
vi.mock("./live-notifications", () => ({ setOpenNotificationThread: state.notifications }));

import { useThreadFocus } from "./thread-focus";

function setFocused(focused: boolean) {
  act(() => {
    state.focused = focused;
    for (const listener of state.listeners) listener();
  });
}

describe("thread focus metadata lifecycle", () => {
  let root: Root | undefined;
  let host: HTMLElement;
  beforeEach(() => {
    state.focused = true;
    state.scope = "space-a:0";
    state.listeners.clear();
    vi.clearAllMocks();
    state.rpc.mockResolvedValue({ needsModel: false });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root?.unmount());
    host.remove();
  });

  it("a fresh roster object and speech callback after a read cannot refocus or repeat metadata reads", async () => {
    const refresh = vi.fn();
    const speak = vi.fn();
    function Screen() {
      const [roster, setRoster] = useState({ id: "bot-a", autoSpeak: false });
      const speakReply = useCallback(() => {
        speak(roster);
      }, [roster]);
      const refreshBots = useCallback(async () => {
        refresh();
        // Bound a regression's loop so the test reports repeated reads instead of hanging.
        if (refresh.mock.calls.length < 8) setRoster({ id: "bot-a", autoSpeak: false });
      }, []);
      useThreadFocus({
        botId: "bot-a",
        readOnly: false,
        notificationThreadId: "thread-a",
        refreshBots,
        markRead: () => undefined,
        speakReply,
        onNeedsModel: () => undefined,
      });
      return null;
    }
    await act(async () => {
      root!.render(<Screen />);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("me");
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("a real blur and return refreshes once and uses the latest speech/read callbacks", async () => {
    const refresh = vi.fn(async () => undefined);
    const markRead = vi.fn();
    const speak = vi.fn();
    function Screen({ version }: { version: number }) {
      useThreadFocus({
        botId: "bot-a",
        readOnly: false,
        notificationThreadId: "thread-a",
        refreshBots: refresh,
        markRead: () => markRead(version),
        speakReply: () => speak(version),
        onNeedsModel: () => undefined,
      });
      return null;
    }
    await act(async () => {
      root!.render(<Screen version={1} />);
    });
    setFocused(false);
    await act(async () => {
      root!.render(<Screen version={2} />);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      setFocused(true);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(markRead).toHaveBeenLastCalledWith(2);
    expect(speak).toHaveBeenLastCalledWith(2);
    expect(state.notifications).toHaveBeenCalledWith(null);
  });

  it("bot/thread and account/Space epoch changes refresh once while unchanged renders do not", async () => {
    const refresh = vi.fn(async () => undefined);
    function Screen({
      botId = "bot-a",
      threadId = "thread-a",
    }: {
      botId?: string;
      threadId?: string;
    }) {
      useThreadFocus({
        botId,
        notificationThreadId: threadId,
        readOnly: false,
        refreshBots: refresh,
        markRead: () => undefined,
        speakReply: () => undefined,
        onNeedsModel: () => undefined,
      });
      return null;
    }
    await act(async () => {
      root!.render(<Screen />);
    });
    await act(async () => {
      root!.render(<Screen />);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      root!.render(<Screen botId="bot-b" threadId="thread-b" />);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    state.scope = "space-b:1";
    await act(async () => {
      root!.render(<Screen botId="bot-b" threadId="thread-b" />);
    });
    state.scope = "space-a:2";
    await act(async () => {
      root!.render(<Screen />);
    });
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("rejects a late model entitlement response after an account/Space A-to-B-to-A epoch change", async () => {
    let resolve: (value: { needsModel: boolean }) => void = () => undefined;
    state.rpc.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const needsModel = vi.fn();
    function Screen() {
      useThreadFocus({
        botId: "bot-a",
        readOnly: false,
        refreshBots: async () => undefined,
        markRead: () => undefined,
        speakReply: () => undefined,
        onNeedsModel: needsModel,
      });
      return null;
    }
    await act(async () => {
      root!.render(<Screen />);
    });
    state.scope = "space-b:1";
    state.scope = "space-a:2";
    await act(async () => {
      resolve({ needsModel: true });
      await Promise.resolve();
    });
    expect(needsModel).not.toHaveBeenCalled();
  });

  it("read-only/group focus retains notification and read behavior without starting speech or bot setup", async () => {
    const markRead = vi.fn();
    const speak = vi.fn();
    function Screen() {
      useThreadFocus({
        readOnly: true,
        notificationThreadId: "group-thread",
        refreshBots: async () => undefined,
        markRead,
        speakReply: speak,
        onNeedsModel: () => undefined,
      });
      return null;
    }
    await act(async () => {
      root!.render(<Screen />);
    });
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(speak).not.toHaveBeenCalled();
    expect(state.saveLast).not.toHaveBeenCalled();
    expect(state.cancelPrompt).toHaveBeenCalledTimes(1);
    expect(state.notifications).toHaveBeenCalledWith({
      botId: undefined,
      threadId: "group-thread",
    });
  });
});
