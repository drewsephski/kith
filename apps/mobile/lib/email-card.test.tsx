// @vitest-environment jsdom
import type { EmailCard as EmailBlock } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { rpc, readOnly } = vi.hoisted(() => ({ rpc: vi.fn(), readOnly: { value: false } }));
vi.mock("react-native", () => {
  const view = ({ children }: { children?: ReactNode }) => createElement("div", {}, children);
  return {
    View: view,
    Text: view,
    TextInput: ({
      accessibilityLabel,
      value,
      onChangeText,
      editable,
    }: {
      accessibilityLabel: string;
      value: string;
      onChangeText: (text: string) => void;
      editable: boolean;
    }) =>
      createElement("textarea", {
        "aria-label": accessibilityLabel,
        value,
        readOnly: editable === false,
        onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
      }),
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

import { EmailCard } from "../components/EmailCard";
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
  rpc.mockReset().mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
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
