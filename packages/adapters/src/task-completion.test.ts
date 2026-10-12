import { describe, expect, it } from "vitest";
import {
  isMemorySaveCall,
  isUnfulfilledActionReply,
  memoryReplyIsBlocked,
  needsFreshMemoryWrite,
} from "./task-completion.js";

describe("unfinished action recovery", () => {
  it.each([
    "I'll check the sent conversations, then leave follow-ups as unsent drafts.",
    "I’ll check Gmail against the seven-day cutoff and inspect whether each got a reply.",
    "Sure. I will prepare a draft for each conversation.",
    "I'm going to find the messages now.",
  ])("recognizes an explicit unfinished promise: %s", (text) => {
    expect(isUnfulfilledActionReply(text)).toBe(true);
  });

  it.each([
    "I can help with email and schedules.",
    "I found three threads and saved their drafts. I'll check again tomorrow.",
    "I'll check Gmail once you connect your account.",
    "I'll draft it. Which recipient should I use?",
    "I don't have access to Gmail.",
    "I’ll check Gmail, but I can’t access your account yet.",
    "I'll check it tomorrow.",
    "> I'll check Gmail now.",
    "Here is an example: I'll check Gmail now.",
    "I'll check it if you want.",
    "I will send it after you approve the draft.",
    "Saved the draft.",
    "",
  ])("leaves answers, blockers and hypothetical prose terminal: %s", (text) => {
    expect(isUnfulfilledActionReply(text)).toBe(false);
  });
});

describe("fresh memory receipt boundary", () => {
  it("only requires a write for an explicit fresh durable directive", () => {
    expect(needsFreshMemoryWrite("Remember for future conversations: I prefer cobalt.")).toBe(true);
    expect(needsFreshMemoryWrite("Remember: cobalt.")).toBe(true);
    expect(needsFreshMemoryWrite("Remember that I prefer cobalt notebooks.")).toBe(true);
    expect(needsFreshMemoryWrite("Remember I prefer dark mode.")).toBe(true);
    expect(needsFreshMemoryWrite("Remember my birthday for future conversations.")).toBe(true);
    expect(needsFreshMemoryWrite("Save this to memory.")).toBe(true);
    expect(needsFreshMemoryWrite("Please store my preference in durable memory.")).toBe(true);
    expect(needsFreshMemoryWrite("Could you please remember that I prefer dark mode?")).toBe(true);
    expect(needsFreshMemoryWrite("Would you save this to memory?")).toBe(true);
    expect(needsFreshMemoryWrite("Selected choice choice-1: Remember that I prefer cobalt.")).toBe(
      true,
    );
    expect(
      needsFreshMemoryWrite(
        "Update my preference to cobalt. Remember this for future conversations.",
      ),
    ).toBe(true);
    expect(
      needsFreshMemoryWrite("Update my preference … Remember this for future conversations."),
    ).toBe(true);
    expect(needsFreshMemoryWrite("Do you remember my preference?")).toBe(false);
    expect(needsFreshMemoryWrite("Can you remember what I said yesterday?")).toBe(false);
    expect(needsFreshMemoryWrite("Remember to ask me tomorrow.")).toBe(false);
    expect(needsFreshMemoryWrite("Remember my birthday?")).toBe(false);
    expect(needsFreshMemoryWrite("Save this to memory?")).toBe(false);
    expect(needsFreshMemoryWrite("Explain the phrase 'Remember that I prefer cobalt'.")).toBe(
      false,
    );
    expect(
      needsFreshMemoryWrite("Explain this example:\n```\nRemember that I prefer cobalt.\n```"),
    ).toBe(false);
    expect(
      needsFreshMemoryWrite("Explain this example:\n~~~\nRemember that I prefer cobalt.\n~~~"),
    ).toBe(false);
    expect(
      needsFreshMemoryWrite("Explain this example:\n```\nRemember that I prefer cobalt."),
    ).toBe(false);
    expect(
      needsFreshMemoryWrite("Remember that I prefer cobalt.\n```\nan unrelated example\n```"),
    ).toBe(true);
  });

  it("accepts only supported memory writes, including the lazy catalog", () => {
    expect(isMemorySaveCall("remember", {}, false)).toBe(true);
    expect(isMemorySaveCall("kith_execute_tool", { id: "save_shared_memory" }, false)).toBe(true);
    expect(isMemorySaveCall("remember", {}, true)).toBe(false);
    expect(isMemorySaveCall("kith_execute_tool", { id: "connector:remember" }, false)).toBe(false);
    expect(isMemorySaveCall("read_memory", {}, false)).toBe(false);
  });

  it("leaves an honest permission or failure blocker terminal", () => {
    expect(memoryReplyIsBlocked("I can't save this without permission.")).toBe(true);
    expect(memoryReplyIsBlocked("Memory wasn't saved.")).toBe(true);
    expect(memoryReplyIsBlocked("I don't have permission to save that preference.")).toBe(true);
    expect(memoryReplyIsBlocked("The memory provider rejected the write.")).toBe(true);
    expect(
      memoryReplyIsBlocked(
        "Serenity writes are disabled for this Space. Enable writing in Memory settings to save durable facts.",
      ),
    ).toBe(true);
    expect(memoryReplyIsBlocked("I can't save this. Nothing was saved or stored.")).toBe(true);
    expect(memoryReplyIsBlocked("I can't save this because the note was stored elsewhere.")).toBe(
      true,
    );
    expect(memoryReplyIsBlocked("Remembered for next time.")).toBe(false);
  });

  it.each([
    "Saved it; the previous attempt failed.",
    "Remembered. I need your favorite color next.",
    "The connector is unavailable, but I saved the preference.",
    "I can't save this. Saved it anyway.",
    "The memory provider rejected the write. Remembered it anyway.",
  ])("does not accept incidental or contradictory blockers: %s", (text) => {
    expect(memoryReplyIsBlocked(text)).toBe(false);
  });
});
