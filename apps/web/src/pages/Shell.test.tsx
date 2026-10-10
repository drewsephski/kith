// @vitest-environment jsdom

import type { AgentSkillCatalogEntry, ThreadMessage } from "@rakazo/contracts";
import type { ComposerMention } from "@rakazo/core";
import type { ComponentProps, ReactNode } from "react";
import { act, createRef, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

import { Composer } from "./Shell";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let composerProps: ComponentProps<typeof Composer>;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const bob: ComposerMention = { kind: "bot", id: "bot-2", name: "Bob" };
const summarize: AgentSkillCatalogEntry = {
  id: "skill-1",
  name: "summarize",
  description: "Summarize a document",
  source: "user",
  readOnly: false,
};

function renderComposer(
  onSend: ComponentProps<typeof Composer>["onSend"],
  overrides: Partial<ComponentProps<typeof Composer>> = {},
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Reduced motion skips the chip-row resize animation, which jsdom cannot run.
  window.matchMedia ??= () => ({ matches: true }) as MediaQueryList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  composerProps = {
    artifactTarget: { botId: "bot-1" },
    activeName: "Ada",
    running: false,
    pendingAttachments: [],
    attachmentNotice: null,
    sendError: null,
    runError: null,
    runErrorId: null,
    onRunErrorPresented: () => {},
    onDismissError: () => {},
    sending: false,
    fileInputRef: createRef(),
    onAttachmentPick: () => true,
    onRemoveAttachment: () => {},
    onSend,
    onStop: async () => {},
    mentionTargets: [bob],
    agentSkills: [summarize],
    ...overrides,
  };
  rerenderComposer({});
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("composer textarea not found");
  return textarea;
}

function rerenderComposer(overrides: Partial<ComponentProps<typeof Composer>>) {
  composerProps = { ...composerProps, ...overrides };
  act(() =>
    root?.render(<Composer key={composerProps.draftKey ?? "default"} {...composerProps} />),
  );
}

function pickAttachment() {
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("attachment input not found");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["notes"], "notes.txt", { type: "text/plain" })],
  });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}

function type(textarea: HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressEnter(textarea: HTMLTextAreaElement) {
  act(() => {
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("Composer", () => {
  it("never replays a consumed suggestion retained by a real parent across A→B→A", async () => {
    const send = vi.fn<ComponentProps<typeof Composer>["onSend"]>().mockResolvedValue(true);
    renderComposer(send);
    const drafts: NonNullable<ComponentProps<typeof Composer>["drafts"]> = new Map();
    function Parent() {
      const [target, setTarget] = useState("A");
      const [suggestion] = useState({ target: "A", text: "Review the interview", nonce: 1 });
      return <>
        <button type="button" onClick={() => setTarget(target === "A" ? "B" : "A")}>Switch</button>
        <Composer {...composerProps} key={target} draftKey={target} drafts={drafts}
          suggestedDraft={suggestion.target === target ? suggestion : undefined} />
      </>;
    }
    act(() => root?.render(<Parent />));
    const input = () => container!.querySelector("textarea")!;
    expect(input().value).toBe("Review the interview");
    pressEnter(input());
    await act(async () => {});
    expect(input().value).toBe("");
    const navigate = () => act(() => container!.querySelector("button")!.click());
    navigate();
    type(input(), "Unsent B");
    navigate();
    expect(input().value).toBe("");
    navigate();
    expect(input().value).toBe("Unsent B");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("preserves a task starter through edits, thread switches, and cancelled setup", async () => {
    const send = vi.fn<ComponentProps<typeof Composer>["onSend"]>().mockResolvedValue(false);
    const drafts: NonNullable<ComponentProps<typeof Composer>["drafts"]> = new Map();
    const textarea = renderComposer(send, {
      draftKey: "main",
      drafts,
      suggestedDraft: { text: "Search my Gmail", nonce: 1, starter: "gmail_search" },
    });
    type(textarea, "Find the launch plan in Gmail");
    rerenderComposer({ draftKey: "task", suggestedDraft: undefined });
    rerenderComposer({ draftKey: "main" });
    const restored = container?.querySelector("textarea");
    if (!restored) throw new Error("composer textarea not found");
    expect(restored.value).toBe("Find the launch plan in Gmail");
    pressEnter(restored);
    await act(async () => {});
    expect(send).toHaveBeenCalledWith(
      "Find the launch plan in Gmail",
      [],
      expect.any(String),
      "gmail_search",
      "main",
    );
    expect(restored.value).toBe("Find the launch plan in Gmail");
    expect(drafts.get("main")?.starter).toBe("gmail_search");
    expect(container?.textContent).not.toContain("Task starter");
    rerenderComposer({ suggestedDraft: { text: "Review the outline", nonce: 2 } });
    pressEnter(restored);
    await act(async () => {});
    expect(send.mock.calls[1]).toEqual(["Review the outline", [], expect.any(String)]);
    expect(drafts.get("main")?.starter).toBeUndefined();
  });

  it("keeps separate drafts when conversations switch", () => {
    const drafts: NonNullable<ComponentProps<typeof Composer>["drafts"]> = new Map();
    const textarea = renderComposer(vi.fn(), { draftKey: "main", drafts });
    type(textarea, "Plan tomorrow");
    rerenderComposer({ draftKey: "task" });
    const task = container?.querySelector("textarea");
    if (!task) throw new Error("missing task composer");
    expect(task.value).toBe("");
    type(task, "Review the outline");
    rerenderComposer({ draftKey: "main" });
    expect(container?.querySelector("textarea")?.value).toBe("Plan tomorrow");
    rerenderComposer({ draftKey: "task" });
    expect(container?.querySelector("textarea")?.value).toBe("Review the outline");
  });

  it("restores a rejected send after leaving its conversation and retains the retry nonce", async () => {
    const drafts: NonNullable<ComponentProps<typeof Composer>["drafts"]> = new Map();
    let finish = (_accepted: boolean) => {};
    const send = vi.fn<ComponentProps<typeof Composer>["onSend"]>(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const textarea = renderComposer(send, { draftKey: "main", drafts });
    type(textarea, "Prepare the outline");
    pressEnter(textarea);
    const nonce = send.mock.calls[0]?.[2];
    rerenderComposer({ draftKey: "task" });
    await act(async () => finish(false));
    expect(container?.querySelector("textarea")?.value).toBe("");
    rerenderComposer({ draftKey: "main" });
    const restored = container?.querySelector("textarea");
    if (!restored) throw new Error("missing restored composer");
    expect(restored.value).toBe("Prepare the outline");
    pressEnter(restored);
    expect(send.mock.calls[1]?.[2]).toBe(nonce);
    await act(async () => finish(true));
  });

  it("does not overwrite a newer draft if a previous send fails after switching back", async () => {
    const drafts: NonNullable<ComponentProps<typeof Composer>["drafts"]> = new Map();
    let finish = (_accepted: boolean) => {};
    const send = vi.fn<ComponentProps<typeof Composer>["onSend"]>(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const textarea = renderComposer(send, { draftKey: "main", drafts });
    type(textarea, "Old draft");
    pressEnter(textarea);
    rerenderComposer({ draftKey: "task" });
    rerenderComposer({ draftKey: "main" });
    const current = container?.querySelector("textarea");
    if (!current) throw new Error("missing current composer");
    type(current, "New draft");
    await act(async () => finish(false));
    expect(current.value).toBe("New draft");
    expect(drafts.get("main")?.text).toBe("New draft");
  });

  it("clears the draft once the message is sent", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const textarea = renderComposer(onSend);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend).toHaveBeenCalledWith("hello", [], expect.any(String));
    expect(textarea.value).toBe("");
  });

  it("keeps the draft cleared when the send callback rejects", async () => {
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error("unknown outcome"))
      .mockResolvedValue(true);
    const textarea = renderComposer(onSend);
    type(textarea, "@Bo");
    pressEnter(textarea);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(textarea.value).toBe("");
    expect(container?.querySelector("[data-testid='mention-chip']")).toBeNull();
    type(textarea, "another message");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).not.toBe(onSend.mock.calls[0]?.[2]);
  });

  it("restores the draft and its mentions when the send fails", async () => {
    let finishSend = (_sent: boolean) => {};
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const textarea = renderComposer(onSend);
    const mentionChips = () =>
      [...(container?.querySelectorAll("[data-testid='mention-chip']") ?? [])].map(
        (chip) => chip.textContent,
      );
    type(textarea, "@Bo");
    pressEnter(textarea);
    type(textarea, "hello");
    pressEnter(textarea);
    expect(onSend).toHaveBeenCalledWith("@Bob hello", [bob], expect.any(String));
    expect(textarea.value).toBe("");
    expect(mentionChips()).toEqual([]);
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("hello");
    expect(mentionChips()).toEqual(["Bob"]);
  });

  it("restores the chosen skill when the send fails", async () => {
    let finishSend = (_sent: boolean) => {};
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const textarea = renderComposer(onSend);
    const skillChip = () => container?.querySelector("[data-testid='skill-chip']")?.textContent;
    type(textarea, "/sum");
    act(() =>
      container?.querySelector<HTMLButtonElement>("button[aria-label='Skill summarize']")?.click(),
    );
    type(textarea, "the notes");
    pressEnter(textarea);
    expect(onSend).toHaveBeenCalledWith("/summarize\nthe notes", [], expect.any(String));
    expect(skillChip()).toBeUndefined();
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("the notes");
    expect(skillChip()).toBe("summarize");
  });

  it("keeps a newer draft when an earlier send fails", async () => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "hello");
    pressEnter(textarea);
    type(textarea, "newer");
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("newer");
  });

  it("does not restore after a newer draft was typed then cleared while sending", async () => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "hello");
    pressEnter(textarea);
    type(textarea, "newer");
    type(textarea, "");
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("");
  });

  it("reuses the nonce on an unchanged retry but renews it after an edit", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const textarea = renderComposer(onSend);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    pressEnter(textarea);
    await act(async () => {});
    const firstNonce = onSend.mock.calls[0]?.[2];
    expect(firstNonce).toEqual(expect.any(String));
    expect(onSend.mock.calls[1]?.[2]).toBe(firstNonce);
    type(textarea, "hello edited");
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[2]?.[2]).not.toBe(firstNonce);
  });

  it("does not restore after an attachment was picked while sending", async () => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "hello");
    pressEnter(textarea);
    pickAttachment();
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("");
  });

  it("restores after a rejected attachment pick and preserves the nonce on rejected retry picks", async () => {
    let finishSend = (_sent: boolean) => {};
    const onSend = vi.fn<ComponentProps<typeof Composer>["onSend"]>(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const onAttachmentPick = vi.fn(() => false);
    const textarea = renderComposer(onSend, { onAttachmentPick });
    type(textarea, "hello");
    pressEnter(textarea);
    pickAttachment();
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("hello");
    pickAttachment();
    pressEnter(textarea);
    await act(async () => finishSend(false));
    expect(onAttachmentPick).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]?.[2]).toBe(onSend.mock.calls[0]?.[2]);
  });

  const reply: ThreadMessage = {
    id: "message-1",
    threadId: "thread-1",
    seq: 1,
    role: "bot",
    blocks: [{ kind: "text", text: "original reply" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const replyChanges = [
    { name: "cancelled reply", props: { replyTarget: null, replyQuote: null } },
    { name: "different reply", props: { replyTarget: { ...reply, id: "message-2" } } },
    { name: "different quote", props: { replyQuote: "different quote" } },
  ];

  it.each(replyChanges)("renews the retry nonce for a $name", async ({ props }) => {
    const onSend = vi.fn().mockResolvedValue(false);
    const textarea = renderComposer(onSend, { replyTarget: reply, replyQuote: "original" });
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    rerenderComposer(props);
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).not.toBe(onSend.mock.calls[0]?.[2]);
  });

  it.each(replyChanges)("does not restore after a $name while sending", async ({ props }) => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
      { replyTarget: reply, replyQuote: "original" },
    );
    type(textarea, "hello");
    pressEnter(textarea);
    rerenderComposer(props);
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("");
  });

  it("preserves the retry nonce when the reply object refreshes without changing its ID or quote", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const textarea = renderComposer(onSend, { replyTarget: reply, replyQuote: "original" });
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    rerenderComposer({ replyTarget: { ...reply } });
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).toBe(onSend.mock.calls[0]?.[2]);
  });

  it("uses a fresh nonce for another message after a successful retry", async () => {
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const textarea = renderComposer(onSend);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    pressEnter(textarea);
    await act(async () => {});
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).toBe(onSend.mock.calls[0]?.[2]);
    expect(onSend.mock.calls[2]?.[2]).not.toBe(onSend.mock.calls[0]?.[2]);
  });
});
