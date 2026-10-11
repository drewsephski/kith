// @vitest-environment jsdom
import type { EmailCard as EmailBlock } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { rpc, readOnly, textInput, text, dimensions } = vi.hoisted(() => ({
  rpc: vi.fn(),
  readOnly: { value: false },
  textInput: vi.fn(),
  text: vi.fn(),
  dimensions: { fontScale: 1 },
}));
vi.mock("react-native", () => {
  const view = ({ children }: { children?: ReactNode }) => createElement("div", {}, children);
  return {
    View: view,
    StyleSheet: {
      absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    },
    useWindowDimensions: () => dimensions,
    Text: (props: { children?: ReactNode; accessibilityElementsHidden?: boolean }) => {
      text(props);
      return createElement(
        "span",
        { "aria-hidden": props.accessibilityElementsHidden },
        props.children,
      );
    },
    TextInput: (props: {
      accessibilityLabel: string;
      value: string;
      onChangeText: (text: string) => void;
      editable: boolean;
    }) => {
      textInput(props);
      const { accessibilityLabel, value, onChangeText, editable } = props;
      return createElement("textarea", {
        "aria-label": accessibilityLabel,
        value,
        readOnly: editable === false,
        onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
      });
    },
  };
});
vi.mock("./api", () => ({ rpc }));
vi.mock("./thread-read-only", () => ({ useThreadReadOnly: () => readOnly.value }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({
    border: "border",
    foreground: "foreground",
    mutedForeground: "muted",
    card: "card",
    destructive: "destructive",
  }),
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    onPress,
    disabled,
    busy,
  }: {
    label: string;
    onPress: () => void;
    disabled: boolean;
    busy: boolean;
  }) =>
    createElement(
      "button",
      { type: "button", disabled: disabled || busy, onClick: onPress },
      label,
    ),
}));

import { EmailCard, EmailPreview } from "../components/EmailCard";
import type { MobileMessage } from "./api";

const block: EmailBlock = {
  kind: "email",
  mode: "draft",
  draftId: "draft-1",
  email: {
    account: "mail@example.test",
    to: ["recipient@example.test"],
    cc: [],
    bcc: ["hidden@example.test"],
    subject: "Status",
    body: "Reviewed response",
  },
};
const message = {
  id: "message-1",
  threadId: "thread-1",
  botId: "bot-1",
  role: "bot",
  blocks: [block],
} as MobileMessage;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  readOnly.value = false;
  dimensions.fontScale = 1;
  textInput.mockClear();
  text.mockClear();
  rpc.mockReset().mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

it("shows the entire read-only email as selectable, unrestricted text", () => {
  const body = `Hi Alex,\n\n${"A complete paragraph of the reply.\n".repeat(80)}\nBest,\nYour assistant`;
  act(() => root.render(<EmailPreview email={{ ...block.email, body }} />));
  expect(container.querySelector("textarea")).toBeNull();
  const bodyProps = text.mock.calls
    .map(([props]) => props)
    .find((props) => props.children === body);
  expect(bodyProps.selectable).toBe(true);
  expect(bodyProps.numberOfLines).toBeUndefined();
  expect(bodyProps.style.height).toBeUndefined();
  expect(bodyProps.style.maxHeight).toBeUndefined();
  expect(container.textContent).toContain(body);
});

it("lets long draft subjects and bodies define their input height, including trailing blank lines", () => {
  const subject = "A long subject with enough words to wrap on a narrow phone screen";
  const body = `Hi Alex,\n\n${"Full reply paragraph.\n".repeat(40)}\n`;
  act(() =>
    root.render(<EmailPreview email={{ ...block.email, subject, body }} onChange={vi.fn()} />),
  );
  for (const value of [subject, body]) {
    const input = textInput.mock.calls
      .map(([props]) => props)
      .find((props) => props.value === value);
    expect(input.multiline).toBe(true);
    expect(input.scrollEnabled).toBe(false);
    expect(Object.assign({}, ...input.style)).toMatchObject({ top: 0, bottom: 0 });
    expect(Object.assign({}, ...input.style).height).toBeUndefined();
    const mirror = text.mock.calls
      .map(([props]) => props)
      .find((props) => props.children === `${value}\u200b`);
    expect(mirror.accessibilityElementsHidden).toBe(true);
    expect(mirror.importantForAccessibility).toBe("no-hide-descendants");
  }
});

it("keeps draft text and its measured height at the same scale when Dynamic Type changes", () => {
  const onChange = vi.fn();
  act(() => root.render(<EmailPreview email={block.email} onChange={onChange} />));
  dimensions.fontScale = 1.5;
  act(() => root.render(<EmailPreview email={block.email} onChange={onChange} />));
  const input = textInput.mock.calls
    .map(([props]) => props)
    .findLast((props) => props.value === block.email.body);
  const mirror = text.mock.calls
    .map(([props]) => props)
    .findLast((props) => props.children === `${block.email.body}\u200b`);
  expect(input.allowFontScaling).toBe(false);
  expect(mirror.allowFontScaling).toBe(false);
  expect(Object.assign({}, ...input.style)).toMatchObject({ fontSize: 22.5, lineHeight: 33 });
  expect(Object.assign({}, ...mirror.style)).toMatchObject({ fontSize: 22.5, lineHeight: 33 });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it("renders recipients and submits the card reference once through the native action", async () => {
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  expect(container.textContent).toContain("hidden@example.test");
  await act(async () => {
    container.querySelector<HTMLButtonElement>("button")!.click();
    container.querySelector<HTMLButtonElement>("button")!.click();
  });
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith(
    "threads/send",
    expect.objectContaining({
      botId: "bot-1",
      emailAction: { messageId: "message-1", blockIndex: 0 },
    }),
  );
  expect(container.textContent).toContain("Requested");
});
it("disables actions for archived threads", async () => {
  readOnly.value = true;
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(rpc).not.toHaveBeenCalled();
});

it("sends content edited directly in the native card", async () => {
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  const body = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Email body"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      body,
      "My reply",
    );
    body.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll("button")).toHaveLength(1);
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(rpc).toHaveBeenCalledWith(
    "threads/send",
    expect.objectContaining({
      emailAction: {
        messageId: "message-1",
        blockIndex: 0,
        edits: { subject: "Status", body: "My reply" },
      },
    }),
  );
});
