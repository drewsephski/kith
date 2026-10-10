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
vi.mock("../components/minimal-scroll", async () => {
  const native = await import("react-native");
  return {
    ScrollView: native.ScrollView,
    ...(Object.hasOwn(native, "FlatList") ? { FlatList: native.FlatList } : {}),
  };
});

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
vi.mock("../components/connector-icon", () => ({ ConnectorIcon: () => null }));
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
    if (proc === "forYou/discover") return { recommendations: [], unavailable: false };
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
it("does not load or display completed, active, or waiting work", async () => {
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
  expect(host.textContent).not.toContain("Review the draft");
  expect(host.textContent).not.toContain("Your work");
  expect(state.rpc.mock.calls.some(([proc]) => proc === "runs/list")).toBe(false);
});

it("offers conversational suggestions without unavailable service tasks", async () => {
  await render();
  expect(host.querySelector('button[aria-label="Make a plan for the week ahead"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Draft replies that need your attention");
  expect(host.textContent).not.toContain("Prepare for your next meeting");
  expect(host.textContent).toContain("Explore");
  expect(host.textContent).not.toContain("Your work");
});

it("shows actual connected account labels and filters tasks by their service", async () => {
  const original = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation((proc: string, input: unknown) =>
    proc === "connections/list"
      ? Promise.resolve([
          {
            id: "mail-one",
            connectorId: "composio",
            provider: "gmail",
            displayName: "Gmail · Work",
            status: "connected",
          },
          {
            id: "mail-two",
            connectorId: "composio",
            provider: "gmail",
            displayName: "Gmail · Personal",
            status: "connected",
          },
          {
            id: "github",
            connectorId: "composio",
            provider: "github",
            displayName: "GitHub",
            status: "revoked",
          },
        ])
      : original(proc, input),
  );
  await render();
  expect(host.textContent).toContain("Gmail · Work");
  expect(host.textContent).toContain("Gmail · Personal");
  expect(
    host.querySelector('button[aria-label="Draft replies that need your attention"]'),
  ).not.toBeNull();
  expect(host.querySelector('button[aria-label="Get pull requests ready to ship"]')).toBeNull();
});
