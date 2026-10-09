import { describe, expect, it } from "vitest";
import { isAssistantResponding } from "./assistant-response.js";

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
