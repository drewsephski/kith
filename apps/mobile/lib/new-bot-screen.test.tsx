// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Action = { type: string; payload?: unknown };
const state = vi.hoisted(() => ({
  epoch: 0,
  store: new Map<string, string>(),
  prevent: false,
  beforeRemove: undefined as undefined | ((event: { data: { action: Action } }) => void),
  options: {} as { gestureEnabled?: boolean; headerLeft?: () => ReactNode },
  replace: vi.fn(),
  back: vi.fn(),
  dispatch: vi.fn(),
  actions: [] as Action[],
  rpc: vi.fn<(procedure: string, input?: unknown, options?: unknown) => Promise<unknown>>(),
}));
function attemptRemoval(action: Action) {
  if (state.prevent) state.beforeRemove?.({ data: { action } });
  else state.actions.push(action);
}
vi.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: typeof state.options }) => {
      state.options = options;
      return <header>{options.headerLeft?.()}</header>;
    },
  },
  useRouter: () => ({
    canGoBack: () => true,
    back: () => {
      state.back();
      attemptRemoval({ type: "GO_BACK" });
    },
    replace: (target: unknown) => {
      state.replace(target);
      attemptRemoval({ type: "REPLACE", payload: target });
    },
  }),
  useNavigation: () => ({
    dispatch: (action: Action) => {
      state.dispatch(action);
      state.actions.push(action);
    },
  }),
}));
vi.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (prevent: boolean, callback: typeof state.beforeRemove) => {
    state.prevent = prevent;
    state.beforeRemove = callback;
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: () => <span>Creating</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) => (
    <span role={accessibilityRole}>{children}</span>
  ),
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../components/sheet-header", () => ({
  cancelHeaderOptions: (label: string, onPress: () => void, disabled = false) => ({
    headerLeft: () => (
      <button type="button" disabled={disabled} onClick={onPress}>
        {label}
      </button>
    ),
  }),
}));
vi.mock("./native", () => ({
  useMobileTokens: () => ({ background: "", foreground: "", destructive: "" }),
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
  t: (value: string) => value,
}));
vi.mock("./api", () => ({
  rpc: state.rpc,
  mobileScreenScopeKey: () => String(state.epoch),
  captureMobileScreenScope: () => {
    const epoch = state.epoch;
    return () => epoch === state.epoch;
  },
  captureApiRequestContext: async () => ({ apiBase: "https://example.test", headers: {} }),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => state.store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    state.store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    state.store.delete(key);
  },
}));

import NewBot from "../app/new";
import * as botCreation from "./bot-creation";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("new bot creation removal guard", () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    state.epoch += 1;
    state.store.clear();
    state.prevent = false;
    state.beforeRemove = undefined;
    state.actions = [];
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  function button(label: string) {
    const result = [...host.querySelectorAll("button")].find((item) => item.textContent === label);
    if (!result) throw new Error(`Missing ${label} button`);
    return result;
  }
  async function mount(create: Promise<unknown>) {
    state.rpc.mockImplementation(async (procedure) =>
      procedure === "me" ? { userId: "test-user", spaceId: "test-space" } : create,
    );
    await act(async () => {
      root.render(<NewBot />);
    });
  }

  it("blocks Cancel, gesture and hardware/back removal until create settles, then replaces once", async () => {
    const create = deferred<{ id: string; name: string }>();
    await mount(create.promise);
    expect(button("Cancel").disabled).toBe(true);
    expect(state.options.gestureEnabled).toBe(false);
    act(() => {
      button("Cancel").click();
      attemptRemoval({ type: "GO_BACK" });
    });
    expect(state.back).not.toHaveBeenCalled();
    expect(state.actions).toEqual([]);
    await act(async () => {
      create.resolve({ id: "bot-created", name: "New bot" });
    });
    expect(state.replace).toHaveBeenCalledTimes(1);
    expect(state.replace).toHaveBeenCalledWith({
      pathname: "/thread",
      params: { botId: "bot-created", name: "New bot" },
    });
    // Pending state was still rendered when replace dispatched: settlement admits only its action.
    expect(state.dispatch).toHaveBeenCalledTimes(1);
    expect(state.actions).toHaveLength(1);
    expect(state.store.size).toBe(0);
  });

  it("failure enables Cancel and back without discarding the uncertain creation nonce", async () => {
    const create = deferred<unknown>();
    await mount(create.promise);
    await act(async () => {
      create.reject(new Error("Lost response"));
    });
    expect(button("Cancel").disabled).toBe(false);
    expect(state.options.gestureEnabled).toBe(true);
    expect(state.store.size).toBe(1);
    act(() => {
      button("Cancel").click();
    });
    expect(state.back).toHaveBeenCalledTimes(1);
    expect(state.actions).toEqual([{ type: "GO_BACK" }]);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("an explicit retry keeps the nonce and blocks removal again until one successful navigation", async () => {
    const first = deferred<unknown>();
    await mount(first.promise);
    await act(async () => {
      first.reject(new Error("Lost response"));
    });
    const nonce = [...state.store.values()][0];
    const retry = deferred<{ id: string; name: string }>();
    state.rpc.mockImplementation(async (procedure) =>
      procedure === "me" ? { userId: "test-user", spaceId: "test-space" } : retry.promise,
    );
    await act(async () => {
      button("Try again").click();
    });
    expect(button("Cancel").disabled).toBe(true);
    act(() => attemptRemoval({ type: "GO_BACK" }));
    expect(state.actions).toEqual([]);
    expect(
      state.rpc.mock.calls
        .filter(([procedure]) => procedure === "onboarding/create")
        .map(([, input]) => input),
    ).toEqual([{ clientNonce: nonce }, { clientNonce: nonce }]);
    await act(async () => {
      retry.resolve({ id: "bot-created", name: "New bot" });
    });
    expect(state.replace).toHaveBeenCalledTimes(1);
    expect(state.actions).toHaveLength(1);
  });

  it("does not prevent authentication or Space boundary replacement while the old create is pending", async () => {
    const create = deferred<{ id: string; name: string }>();
    await mount(create.promise);
    state.epoch += 1;
    act(() => attemptRemoval({ type: "RESET", payload: "new-session" }));
    expect(state.dispatch).toHaveBeenCalledWith({ type: "RESET", payload: "new-session" });
    await act(async () => {
      create.resolve({ id: "old-bot", name: "New bot" });
    });
    expect(state.replace).not.toHaveBeenCalled();
  });
  it("a scope change after the helper settles cannot redirect a still-mounted creation screen", async () => {
    const original = botCreation.createConversationalBot;
    const settled = vi.fn();
    vi.spyOn(botCreation, "createConversationalBot").mockImplementationOnce(() =>
      original().then((bot) => {
        // The helper returned an accepted bot; the account/Space changes before the screen resumes.
        expect(bot?.id).toBe("old-bot");
        settled();
        state.epoch += 1;
        return bot;
      }),
    );
    const create = deferred<{ id: string; name: string }>();
    await mount(create.promise);
    await act(async () => {
      create.resolve({ id: "old-bot", name: "New bot" });
    });
    expect(settled).toHaveBeenCalledTimes(1);
    expect(host.isConnected).toBe(true);
    expect(button("Cancel").disabled).toBe(false);
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.actions).toEqual([]);
  });
});
