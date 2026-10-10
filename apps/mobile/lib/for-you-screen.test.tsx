// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  push: vi.fn(),
  space: "space-one",
  generation: 1,
  storage: new Map<string, string>(),
}));
vi.mock("./api", () => ({
  rpc: state.rpc,
  selectedSpaceId: () => state.space,
  currentApiBase: () => "https://example.test",
}));
vi.mock("./session", () => ({ currentSessionGeneration: () => state.generation }));
vi.mock("./i18n", () => ({
  t: (text: string) => text,
  useI18n: () => ({ t: (text: string) => text }),
}));
vi.mock("./native", () => ({
  native: {},
  useMobileTokens: () => ({}),
  useThemedStyles: (create: () => unknown) => create(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => state.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    state.storage.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    state.storage.delete(key);
  },
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: state.push }),
  useFocusEffect: (callback: () => () => void) => useEffect(callback, [callback]),
}));
vi.mock("../components/menu-picker", () => ({ MenuPicker: () => null }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("react-native", () => {
  const View = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    View,
    Text: View,
    ScrollView: View,
    ActivityIndicator: View,
    StyleSheet: { create: (styles: unknown) => styles },
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button type="button" aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

import ForYou from "../app/for-you";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  state.storage.clear();
  state.space = "space-one";
  state.generation = 1;
  state.rpc.mockImplementation(async (proc: string) => {
    if (proc === "me") return { userId: "user-one", spaceId: "space-one" };
    if (proc === "assistant/get") return { botId: "assistant-one" };
    if (proc === "runs/list") return { runs: [] };
    if (proc === "bots/launchForYou") return { id: "child-one" };
    return [];
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
async function render() {
  await act(async () => root.render(<ForYou />));
}
async function clickSuggestion() {
  await act(async () =>
    (
      host.querySelector('button[aria-label="Make a plan for the week ahead"]') as HTMLButtonElement
    ).click(),
  );
}
it("persists launch identity before dispatch and reuses it after restarting the screen", async () => {
  let attempts = 0;
  const operations: string[] = [];
  const original = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(async (proc: string, input: { operationId: string }) => {
    if (proc !== "bots/launchForYou") return original(proc, input);
    expect([...state.storage.values()]).toContain(input.operationId);
    operations.push(input.operationId);
    if (attempts++ === 0) throw new Error("Lost response");
    return { id: "child-one" };
  });
  await render();
  await clickSuggestion();
  expect(state.storage.size).toBe(1);
  act(() => root.unmount());
  root = createRoot(host);
  await render();
  await clickSuggestion();
  expect(operations).toHaveLength(2);
  expect(operations[0]).toBe(operations[1]);
  expect(state.storage.size).toBe(0);
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/thread",
    params: { botId: "child-one", name: "Make a plan for the week ahead" },
  });
});
it("rejects an old account/space launch while loading the assistant", async () => {
  let resolve!: (value: { botId: string }) => void;
  const original = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation((proc: string, input: unknown) =>
    proc === "assistant/get"
      ? new Promise((done) => {
          resolve = done;
        })
      : original(proc, input),
  );
  await render();
  act(() =>
    (
      host.querySelector('button[aria-label="Make a plan for the week ahead"]') as HTMLButtonElement
    ).click(),
  );
  await act(async () => {
    state.space = "space-two";
    state.generation += 1;
    resolve({ botId: "assistant-one" });
  });
  expect(state.rpc.mock.calls.some(([proc]) => proc === "bots/launchForYou")).toBe(false);
  expect(state.push).not.toHaveBeenCalled();
});
it("opens persisted approvals at the authoritative message destination", async () => {
  const original = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation((proc: string, input: unknown) =>
    proc === "runs/list"
      ? Promise.resolve({
          runs: [
            {
              runId: "run-1",
              botId: "bot-1",
              botName: "Draft review",
              groupId: null,
              groupName: null,
              threadId: "thread-1",
              messageId: "approval-1",
              status: "waiting_input",
              trigger: "user",
              notificationsEnabled: false,
              promptSnippet: "Review the draft",
              updatedAt: "2026-10-09T12:00:00Z",
            },
          ],
        })
      : original(proc, input),
  );
  await render();
  const work = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Review the draft"),
  )!;
  act(() => work.click());
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/thread",
    params: { botId: "bot-1", name: "Draft review", messageId: "approval-1" },
  });
});

it("offers an unconnected conversational starter before the full Explore catalog", async () => {
  await render();
  expect(host.querySelector("button")?.textContent).toBe("Make a plan for the week ahead");
  expect(host.textContent).toContain("Explore");
  expect(host.textContent).not.toContain("Your work");
});
