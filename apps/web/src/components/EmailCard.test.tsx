// @vitest-environment jsdom
import type { EmailCard as EmailBlock, ThreadMessage } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/rpc", () => ({ rpc: { threads: { send } } }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((text, part, index) => `${text}${index ? values[index - 1] : ""}${part}`, ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@rakazo/chat-ui/web", () => ({
  ChatMarkdown: ({ children }: { children: ReactNode }) => children,
}));

import { AskCard } from "./AskCard";
import { EmailCard } from "./EmailCard";

const block: EmailBlock = {
  kind: "email",
  mode: "draft",
  draftId: "draft-1",
  email: {
    account: "mail@example.test",
    to: ["recipient@example.test"],
    cc: ["copy@example.test"],
    bcc: ["hidden@example.test"],
    subject: "Status",
    body: '<img src="https://example.test/track" onerror="steal()">Hello',
  },
};
const message: ThreadMessage = {
  id: "message-1",
  threadId: "thread-1",
  botId: "bot-1",
  seq: 1,
  role: "bot",
  blocks: [block],
  createdAt: "2026-10-09T12:00:00Z",
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  send.mockReset().mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function click() {
  container.querySelector<HTMLButtonElement>("button")!.click();
}
it("renders all recipients and inert content, then requests a single authorized run through the card's parent", async () => {
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  expect(container.textContent).toContain("hidden@example.test");
  expect(container.querySelector("img")).toBeNull();
  await act(async () => {
    click();
    click();
  });
  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith({
    botId: "bot-1",
    replyToMessageId: "message-1",
    emailAction: { messageId: "message-1", blockIndex: 0 },
  });
  expect(container.textContent).toContain("Requested");
  expect(container.textContent).not.toContain("Sent");
});
it("retries a lost response with the same card intent and preserves the email", async () => {
  send.mockRejectedValueOnce(new Error("Offline"));
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  await act(async () => click());
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => click());
  expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0]);
  expect(container.textContent).toContain("Status");
});
it("routes group replies to the group without moving the user's composer draft", async () => {
  act(() =>
    root.render(
      <EmailCard
        block={{ ...block, mode: "received" }}
        message={message}
        blockIndex={0}
        groupId="group-1"
      />,
    ),
  );
  await act(async () => click());
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      groupId: "group-1",
      emailAction: { messageId: "message-1", blockIndex: 0 },
    }),
  );
  expect(send.mock.calls[0]![0]).not.toHaveProperty("botId");
});
it("renders the real send review with Send and Cancel, and never calls approval success sent", async () => {
  const onAnswer = vi.fn().mockResolvedValue(undefined);
  const ask = {
    kind: "ask" as const,
    text: "Review email",
    email: block.email,
    approvalEffectId: "effect-1",
    approvalAction: "email_send" as const,
    status: "pending" as const,
    actions: [
      { id: "allow", label: "Send email" },
      { id: "deny", label: "Cancel" },
    ],
  };
  act(() => root.render(<AskCard block={ask} canAnswer onAnswer={onAnswer} />));
  expect(Array.from(container.querySelectorAll("button"), (button) => button.textContent)).toEqual([
    "Send",
    "Cancel",
  ]);
  await act(async () => click());
  expect(onAnswer).toHaveBeenCalledWith("allow", undefined);
  act(() =>
    root.render(
      <AskCard
        block={{ ...ask, status: "answered", answer: "allow" }}
        canAnswer={false}
        onAnswer={onAnswer}
      />,
    ),
  );
  expect(container.textContent).toContain("Send approved");
  expect(container.textContent).not.toContain("Sent");
});

function change(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
it("edits inline, preserves edits on failure, and sends the revised subject and body", async () => {
  send.mockRejectedValueOnce(new Error("Offline"));
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  const subject = container.querySelector<HTMLInputElement>('input[aria-label="Email subject"]')!;
  const body = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Email body"]')!;
  expect(body.value).toBe(block.email.body);
  expect(body.readOnly).toBe(false);
  expect(container.textContent).not.toContain("Edit");
  act(() => {
    change(subject, "Revised status");
    change(body, "My actual response\n\nThanks!");
  });
  await act(async () => click());
  expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(
    "My actual response\n\nThanks!",
  );
  await act(async () => click());
  expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0]);
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      emailAction: {
        messageId: "message-1",
        blockIndex: 0,
        edits: { subject: "Revised status", body: "My actual response\n\nThanks!" },
      },
    }),
  );
});
it("offers one Send action without a save or edit step", () => {
  act(() => root.render(<EmailCard block={block} message={message} blockIndex={0} />));
  expect(Array.from(container.querySelectorAll("button"), (button) => button.textContent)).toEqual([
    "Send",
  ]);
  expect(container.querySelector<HTMLTextAreaElement>("textarea")!.readOnly).toBe(false);
});
