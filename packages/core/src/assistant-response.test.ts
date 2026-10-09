import type { ThreadMessage } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { hasRunResponseText, isAssistantResponding } from "./assistant-response.js";

describe("run response text", () => {
  const response: Pick<ThreadMessage, "role" | "runId" | "blocks"> = {
    role: "bot",
    runId: "current-run",
    blocks: [{ kind: "text", text: "Got it." }],
  };

  it("recognizes both the first streamed text and the committed reply", () => {
    expect(
      hasRunResponseText(
        [{ ...response, blocks: [{ kind: "progress", text: "G" }] }],
        "current-run",
      ),
    ).toBe(true);
    expect(hasRunResponseText([response], "current-run")).toBe(true);
  });

  it("keeps waiting for a new run and for other group members", () => {
    expect(hasRunResponseText([response], "next-run")).toBe(false);
    expect(hasRunResponseText([response], "other-bot-run")).toBe(false);
    expect(hasRunResponseText([response], undefined)).toBe(false);
    expect(hasRunResponseText([{ ...response, runId: undefined }], "current-run")).toBe(false);
    expect(hasRunResponseText([{ ...response, role: "user" }], "current-run")).toBe(false);
  });

  it.each<ThreadMessage["blocks"]>([
    [],
    [{ kind: "text", text: "   " }],
    [{ kind: "progress", text: "" }],
    [{ kind: "progress", text: "Using a tool", activity: true }],
    [{ kind: "steps", steps: [{ label: "Tool", count: 1 }] }],
  ])("keeps waiting through empty output and tool activity: %j", (...blocks) => {
    expect(hasRunResponseText([{ ...response, blocks }], "current-run")).toBe(false);
  });
});

describe("assistant response animation", () => {
  it.each(["queued", "leased", "running"])("includes %s assistant turns", (status) => {
    expect(isAssistantResponding("first", [{ botId: "first", status }])).toBe(true);
  });

  it.each(["waiting_input", "waiting_takeover", "completed", "cancelled", "failed", undefined])(
    "does not animate %s turns",
    (status) => {
      expect(isAssistantResponding("first", [{ botId: "first", status }])).toBe(false);
    },
  );

  it("does not infer the assistant from another bot or a missing binding", () => {
    const others = [{ botId: "second", status: "running" }];
    expect(isAssistantResponding("first", others)).toBe(false);
    expect(isAssistantResponding(null, others)).toBe(false);
    expect(isAssistantResponding("first", [])).toBe(false);
  });

  it("follows the assistant's own run in mixed group activity", () => {
    const others = [{ botId: "second", status: "running" }];
    expect(isAssistantResponding("first", [...others, { botId: "first", status: "running" }])).toBe(
      true,
    );
    expect(
      isAssistantResponding("first", [...others, { botId: "first", status: "waiting_input" }]),
    ).toBe(false);
  });
});
