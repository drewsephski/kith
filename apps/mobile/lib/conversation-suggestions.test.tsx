// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConversationSuggestions } from "../components/conversation-suggestions";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../components/minimal-scroll", async () => {
  const native = await import("react-native");
  return {
    ScrollView: native.ScrollView,
    ...(Object.hasOwn(native, "FlatList") ? { FlatList: native.FlatList } : {}),
  };
});

vi.mock("./api", () => ({ rpc }));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "en", t: (text: string) => text }) }));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));

let root: Root;
let container: HTMLDivElement;
const select = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  rpc.mockResolvedValue([
    { title: "Review onboarding risks", prompt: "Review the risks for the onboarding milestone." },
  ]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});
async function render(busy = false, connectedServices: string[] = []) {
  await act(async () =>
    root.render(
      <ConversationSuggestions
        scopeKey="user:space:thread"
        botId="bot"
        messageId="reply"
        busy={busy}
        connectedServices={connectedServices}
        onSelect={select}
      />,
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(350));
}

it("uses the shared API and native actions to select an editable follow-up", async () => {
  await render();
  expect(rpc).toHaveBeenCalledWith(
    "threads/suggestions",
    { botId: "bot", messageId: "reply", locale: "en" },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  act(() => container.querySelector("button")!.click());
  expect(select).toHaveBeenCalledWith("Review the risks for the onboarding milestone.");
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("suppresses follow-ups while running and refreshes when idle again", async () => {
  await render();
  await render(true);
  expect(container.textContent).toBe("");
  expect(rpc).toHaveBeenCalledTimes(1);
  await render();
  expect(container.textContent).toContain("Review onboarding risks");
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("preserves an empty surface when the optional generator is unavailable", async () => {
  rpc.mockRejectedValue(new Error("Unavailable"));
  await render();
  expect(container.textContent).toBe("");
});

it("does not label generic service starters as follow-ups during outages or abstention", async () => {
  rpc.mockRejectedValue(new Error("Unavailable"));
  await render(false, ["gmail"]);
  expect(container.textContent).toBe("");
  await render(true);
  rpc.mockResolvedValue([]);
  await render(false, ["github"]);
  expect(container.textContent).toBe("");
});
