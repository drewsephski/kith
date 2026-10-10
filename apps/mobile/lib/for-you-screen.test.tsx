// @vitest-environment jsdom

import { FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), push: vi.fn() }));
vi.mock("../lib/api", () => ({ rpc: mocks.rpc, selectedSpaceId: () => "space-fixture" }));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("../lib/i18n", () => ({
  t: (value: string) => value,
  useI18n: () => ({ t: (value: string) => value }),
}));
vi.mock("../lib/native", () => ({
  native: {},
  useThemedStyles: (create: () => unknown) => create(),
  useMobileTokens: () => ({ destructive: "red" }),
}));
vi.mock("../components/menu-picker", () => ({ MenuPicker: () => null }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  Text: ({ children, accessibilityRole }: { children: ReactNode; accessibilityRole?: string }) =>
    createElement("span", { role: accessibilityRole === "alert" ? "alert" : undefined }, children),
  ActivityIndicator: () => null,
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    disabled: boolean;
    accessibilityLabel: string;
  }) =>
    createElement(
      "button",
      { type: "button", onClick: onPress, disabled, "aria-label": accessibilityLabel },
      children,
    ),
}));

import ForYou from "../app/for-you";

it("keeps a failed prompt on the native page and opens the same thread on retry", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let failed = false;
  mocks.rpc.mockImplementation(async (path: string) => {
    if (path === "assistant/get") return { botId: "assistant-fixture" };
    if (path === "bots/create") return { id: "conversation-fixture" };
    if (path === "threads/send" && !failed) {
      failed = true;
      throw new Error("Could not send");
    }
    return {};
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ForYou />));
    const button = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => button.click());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => button.click());
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "bots/create")).toHaveLength(1);
    const sends = mocks.rpc.mock.calls.filter(([path]) => path === "threads/send");
    expect(sends[0]).toEqual(sends[1]);
    expect(sends[1]?.[1]).toEqual(
      expect.objectContaining({
        botId: "conversation-fixture",
        text: FOR_YOU_SUGGESTIONS[0]!.prompt,
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/thread",
      params: { botId: "conversation-fixture", name: FOR_YOU_SUGGESTIONS[0]!.title },
    });
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
