// @vitest-environment jsdom

import type { MessageBlock } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const alert = vi.hoisted(() => vi.fn());

vi.mock("react-native", async () => {
  const { createElement, forwardRef } = await import("react");

  function MockView(props: { children?: ReactNode; testID?: string }) {
    return createElement("div", { "data-testid": props.testID }, props.children);
  }

  function MockText(props: { children?: ReactNode; accessibilityRole?: string }) {
    return createElement("span", { role: props.accessibilityRole }, props.children);
  }

  function MockPressable(props: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityState?: { disabled?: boolean; selected?: boolean };
    testID?: string;
  }) {
    const disabled = Boolean(props.disabled || props.accessibilityState?.disabled);
    return createElement(
      "button",
      {
        type: "button",
        disabled,
        "aria-label": props.accessibilityLabel,
        "aria-selected": props.accessibilityState?.selected ? "true" : "false",
        "data-testid": props.testID,
        onClick: () => {
          if (!disabled) props.onPress?.();
        },
      },
      props.children,
    );
  }

  return {
    Alert: { alert },
    Keyboard: { dismiss: vi.fn() },
    TextInput: forwardRef<
      HTMLInputElement,
      {
        value?: string;
        onChangeText?: (value: string) => void;
        accessibilityLabel?: string;
        editable?: boolean;
        maxLength?: number;
      }
    >((props, ref) =>
      createElement("input", {
        ref,
        value: props.value,
        onChange: (event: { target: { value: string } }) =>
          props.onChangeText?.(event.target.value),
        "aria-label": props.accessibilityLabel,
        disabled: props.editable === false,
        maxLength: props.maxLength,
      }),
    ),
    Pressable: MockPressable,
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: MockText,
    View: MockView,
    useWindowDimensions: () => ({ width: 393, height: 852, scale: 1, fontScale: 1 }),
  };
});

vi.mock("./api", () => ({
  rpc,
  captureMobileScreenScope: () => () => true,
  captureApiRequestContext: async () => ({ apiBase: "https://example.test", headers: {} }),
}));
vi.mock("../components/bot-avatar", () => ({ BotAvatar: () => null }));

vi.mock("./native", () => ({
  native: { fill: "fill", fillPressed: "fill-pressed" },
  useMobileTokens: () => ({
    background: "background",
    border: "border",
    card: "card",
    foreground: "foreground",
    mutedForeground: "muted",
  }),
}));

vi.mock("../components/native-symbol", () => ({
  NativeSymbol: () => null,
}));

vi.mock("../components/CalendarConnection", () => ({ CalendarConnection: () => null }));
vi.mock("../components/task-starters/setup", () => ({ TaskStarterSetup: () => null }));
vi.mock("../components/native-action-button", async () => {
  const { createElement } = await import("react");
  return {
    NativeActionButton: (props: {
      label: string;
      onPress: () => void;
      busy?: boolean;
      disabled?: boolean;
    }) =>
      createElement(
        "button",
        {
          type: "button",
          "aria-label": props.label,
          disabled: props.busy || props.disabled,
          onClick: props.onPress,
        },
        props.label,
      ),
  };
});

import { ChoiceCard } from "../components/ChoiceCard";

type ChoiceBlock = Extract<MessageBlock, { kind: "choice" }>;

const choice: ChoiceBlock = {
  kind: "choice",
  question: "What do you want me on first?",
  options: [
    { id: "day", letter: "A", label: "Organize my day" },
    { id: "inbox", letter: "B", label: "Email and follow-ups" },
  ],
};

function button(container: HTMLElement, label: string) {
  const element = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!element) throw new Error(`missing button ${label}`);
  return element;
}

describe("ChoiceCard", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    rpc.mockReset();
    alert.mockReset();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  function render(block: ChoiceBlock = choice, onDismissed?: () => void) {
    if (!container) {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    }
    act(() => {
      root?.render(
        <ChoiceCard
          messageId="message-identity"
          botId="bot-1"
          block={block}
          onDismissed={onDismissed}
        />,
      );
    });
    return container;
  }

  it("chooses through onboarding/choose and keeps only that option", async () => {
    rpc.mockResolvedValue({});
    const view = render();

    await act(async () => {
      button(view, "Email and follow-ups").click();
      await Promise.resolve();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("onboarding/choose", { botId: "bot-1", optionId: "inbox" });
    expect(view.textContent).toContain("Email and follow-ups");
    expect(view.textContent).not.toContain("Organize my day");
    expect(button(view, "Email and follow-ups").disabled).toBe(true);
    expect(button(view, "Email and follow-ups").getAttribute("aria-selected")).toBe("true");
    expect(view.querySelector("[data-testid='choice-card-dismiss']")).toBeNull();
  });

  it("dismisses through onboarding/dismissFocus and hides the card", async () => {
    rpc.mockResolvedValue({});
    const onDismissed = vi.fn();
    const view = render(choice, onDismissed);

    await act(async () => {
      button(view, "Dismiss").click();
      await Promise.resolve();
    });

    expect(rpc).toHaveBeenCalledWith("onboarding/dismissFocus", { botId: "bot-1" });
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(view.querySelector("[data-testid='choice-card']")).toBeNull();
  });

  it("disables every control while a request is in flight", async () => {
    let release: (value: unknown) => void = () => undefined;
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = render();

    await act(async () => {
      button(view, "Organize my day").click();
      button(view, "Email and follow-ups").click();
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("onboarding/choose", {
      botId: "bot-1",
      optionId: "day",
    });
    expect(button(view, "Organize my day").disabled).toBe(true);
    expect(button(view, "Email and follow-ups").disabled).toBe(true);
    expect(button(view, "Dismiss").disabled).toBe(true);
    expect(view.textContent).toContain("Email and follow-ups");

    button(view, "Email and follow-ups").click();
    expect(rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({});
      await Promise.resolve();
    });

    expect(view.textContent).toContain("Organize my day");
    expect(view.textContent).not.toContain("Email and follow-ups");
  });

  it("reports a failed request and leaves the card unanswered", async () => {
    rpc.mockRejectedValueOnce(new Error("Network down"));
    const view = render();

    await act(async () => {
      button(view, "Email and follow-ups").click();
      await Promise.resolve();
    });

    expect(alert).toHaveBeenCalledWith("Could not complete action", "Network down");
    expect(button(view, "Organize my day").disabled).toBe(false);
    expect(button(view, "Email and follow-ups").disabled).toBe(false);
    expect(view.querySelector("[data-testid='choice-card-dismiss']")).not.toBeNull();

    rpc.mockResolvedValueOnce({});
    await act(async () => {
      button(view, "Email and follow-ups").click();
      await Promise.resolve();
    });

    expect(rpc).toHaveBeenLastCalledWith("onboarding/choose", {
      botId: "bot-1",
      optionId: "inbox",
    });
    expect(view.textContent).not.toContain("Organize my day");
  });

  it("lets a later server answer replace the option chosen locally", async () => {
    rpc.mockResolvedValue({});
    const view = render();

    await act(async () => {
      button(view, "Organize my day").click();
      await Promise.resolve();
    });
    expect(view.textContent).not.toContain("Email and follow-ups");

    render({ ...choice, answerId: "inbox" });

    expect(view.textContent).toContain("Email and follow-ups");
    expect(view.textContent).not.toContain("Organize my day");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("renders identity presets and sends the scoped message identity once on rapid taps", async () => {
    let release: (value: unknown) => void = () => undefined;
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = render({
      kind: "choice",
      onboardingStage: "identity",
      question: "What should my name be, and what's my role?",
      options: [
        { id: "miso", letter: "A", label: "Miso", description: "Inbox assistant" },
        { id: "pippin", letter: "B", label: "Pippin", description: "Research assistant" },
        { id: "orbit", letter: "C", label: "Orbit", description: "Planning assistant" },
        { id: "pixel", letter: "D", label: "Pixel", description: "Coding partner" },
      ],
    });
    expect(view.textContent).toContain("What should my name be, and what's my role?");
    expect(view.textContent).not.toContain("What should I help you with first?");
    expect(view.querySelectorAll("[data-testid^='bot-identity-']")).toHaveLength(5);
    await act(async () => {
      button(view, "Pippin, Research assistant").click();
      button(view, "Pixel, Coding partner").click();
      await Promise.resolve();
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "onboarding/identity",
      { botId: "bot-1", messageId: "message-identity", identity: { presetId: "pippin" } },
      { requestContext: { apiBase: "https://example.test", headers: {} } },
    );
    await act(async () => {
      release({});
      await Promise.resolve();
    });
    expect(button(view, "Pippin, Research assistant").disabled).toBe(true);
    expect(view.textContent).not.toContain("Coding partner");
  });

  it("a durable identity answer suppresses a later lost-response error without remounting", async () => {
    let reject: (reason: Error) => void = () => undefined;
    rpc.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const identity: ChoiceBlock = {
      kind: "choice",
      onboardingStage: "identity",
      question: "What should my name be, and what's my role?",
      options: [{ id: "miso", letter: "A", label: "Miso", description: "Inbox assistant" }],
    };
    const view = render(identity);
    await act(async () => {
      button(view, "Miso, Inbox assistant").click();
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    render({ ...identity, answerId: "miso" });
    await act(async () => {
      reject(new Error("Network down"));
    });
    expect(view.querySelector("[role='alert']")).toBeNull();
    expect(view.textContent).not.toContain("Network down");
    expect(view.textContent).not.toContain(identity.question);
    expect(button(view, "Miso, Inbox assistant").disabled).toBe(true);
    expect(button(view, "Miso, Inbox assistant").getAttribute("aria-selected")).toBe("true");
    expect(view.querySelector("[aria-label='Custom']")).toBeNull();
  });

  it("hydrates a completed custom identity and keeps it read-only", () => {
    const view = render({
      kind: "choice",
      onboardingStage: "identity",
      question: "What should my name be, and what's my role?",
      answerId: "custom",
      options: [{ id: "custom", letter: "", label: "Atlas", description: "Research lead" }],
    });
    expect(view.textContent).not.toContain("What should my name be, and what's my role?");
    expect(view.textContent).toContain("Atlas");
    expect(view.textContent).toContain("Research lead");
    expect(button(view, "Atlas, Research lead").disabled).toBe(true);
    expect(view.querySelector("[aria-label='Custom']")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves explicit custom name and role while preserving input after a failed request", async () => {
    const view = render({
      kind: "choice",
      onboardingStage: "identity",
      question: "What should my name be, and what's my role?",
      options: [{ id: "miso", letter: "A", label: "Miso", description: "Inbox assistant" }],
    });
    await act(async () => {
      button(view, "Custom").click();
    });
    expect(view.querySelector("[aria-label='Miso, Inbox assistant']")).toBeNull();
    expect(button(view, "Save").disabled).toBe(true);
    const name = view.querySelector<HTMLInputElement>("[aria-label='Name']")!;
    const role = view.querySelector<HTMLInputElement>("[aria-label='Role']")!;
    expect(name.maxLength).toBe(80);
    expect(role.maxLength).toBe(500);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        " Atlas ",
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        role,
        " Research lead ",
      );
      role.dispatchEvent(new Event("input", { bubbles: true }));
    });
    rpc.mockRejectedValueOnce(new Error("Network down"));
    await act(async () => {
      button(view, "Save").click();
      await Promise.resolve();
    });
    expect(view.querySelector("[role='alert']")?.textContent).toBe("Network down");
    expect(name.value).toBe(" Atlas ");
    expect(role.value).toBe(" Research lead ");
    rpc.mockResolvedValueOnce({});
    await act(async () => {
      button(view, "Save").click();
      await Promise.resolve();
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "onboarding/identity",
      {
        botId: "bot-1",
        messageId: "message-identity",
        identity: { name: "Atlas", role: "Research lead" },
      },
      { requestContext: { apiBase: "https://example.test", headers: {} } },
    );
    expect(view.textContent).not.toContain("What should my name be, and what's my role?");
  });
});
