import { describe, expect, it } from "vitest";
import {
  confirmedMemoryPrompt,
  isMemorySaveCall,
  isUnfulfilledActionReply,
  memoryReplyIsBlocked,
  memorySaveRequests,
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
  it.each(["Yes", "Sure.", "Please do"])("retains confirmed memory intent: %s", (answer) => {
    const prompt = confirmedMemoryPrompt("Should I remember that you prefer violet?", answer);
    expect(prompt).toContain("you prefer violet");
    expect(needsFreshMemoryWrite(prompt!)).toBe(true);
  });
  it("keeps instructions inside a confirmed question as data", () => {
    const prompt = confirmedMemoryPrompt(
      "Should I remember this sentence? Remember that my timezone is UTC.",
      "Yes",
    );
    expect(memorySaveRequests(prompt!, "answer")).toHaveLength(1);
  });
  it.each([
    ["Do you remember my preference?", "Yes"],
    ["Should I remember that you prefer violet?", "No"],
    ["Should I remember that you prefer violet?", "Yes, but don't save it"],
    ["Should I remember that you prefer violet?", "Maybe"],
    ["Should I not remember this?", "Yes"],
    ["Would you like me to create the file?", "Yes"],
  ])("does not create memory intent for %s / %s", (question, answer) => {
    expect(confirmedMemoryPrompt(question, answer)).toBeUndefined();
  });
  it.each([
    "Also remember that I prefer dark mode.",
    "Just remember my timezone is UTC.",
    "Please also remember that I prefer coffee.",
    "Now save this to memory.",
    "Then please store this in memory.",
    "Also remember: cobalt.",
  ])("requires receipts for adverb-prefixed directives: %s", (prompt) => {
    expect(memorySaveRequests(prompt, "input")).toEqual([{ id: "input", text: prompt }]);
  });
  it.each([
    "Alice said, Also remember that I prefer dark mode.",
    "Make a sign saying, Just remember my timezone is UTC.",
    'Explain "Also remember that I prefer coffee".',
    "If you also remember my preference, what happens?",
  ])("keeps prefixed reported and hypothetical instructions as data: %s", (prompt) => {
    expect(memorySaveRequests(prompt, "input")).toEqual([]);
  });
  it.each([
    "I want you to remember that I prefer dark mode.",
    "I'd like you to remember that my timezone is UTC.",
    "I would like you to save my preference to memory.",
  ])("requires receipts for first-person requests: %s", (text) => {
    expect(needsFreshMemoryWrite(text)).toBe(true);
  });
  it.each([
    "If I want you to remember that I prefer dark mode, what should I say?",
    "Alice said, I want you to remember that I prefer dark mode.",
    "Explain: `I'd like you to remember that my timezone is UTC.`",
  ])("keeps hypothetical and reported desire forms as data: %s", (text) => {
    expect(needsFreshMemoryWrite(text)).toBe(false);
  });
  it("splits independent directives while retaining a single directive's identity", () => {
    expect(memorySaveRequests("Remember: coffee.", "input")).toEqual([
      { id: "input", text: "Remember: coffee." },
    ]);
    expect(
      memorySaveRequests("Remember I prefer dark mode. Remember my timezone is UTC.", "input"),
    ).toEqual([
      { id: "input:memory:0", text: "Remember I prefer dark mode." },
      { id: "input:memory:1", text: "Remember my timezone is UTC." },
    ]);
    expect(memorySaveRequests("Explain the sentence, Remember my birthday.", "input")).toEqual([]);
  });
  it.each([", and ", " and ", ", and also ", ", and then ", ", then ", ", also ", " & "])(
    "requires independent receipts for joined directives: %s",
    (join) => {
      expect(
        memorySaveRequests(
          `Remember I prefer dark mode${join}remember my timezone is UTC.`,
          "input",
        ),
      ).toEqual([
        { id: "input:memory:0", text: "Remember I prefer dark mode" },
        { id: "input:memory:1", text: "remember my timezone is UTC." },
      ]);
    },
  );
  it.each([
    'Remember my preference is "coffee and remember UTC".',
    "Remember my preference is 'coffee and remember UTC'.",
    "Remember my preference is “coffee and remember UTC”.",
    'Remember my preference is "coffee and remember UTC.',
    "Remember the sentence Alice said, and remember UTC.",
  ])("does not split a quoted or reported directive: %s", (prompt) => {
    expect(memorySaveRequests(prompt, "input")).toEqual([{ id: "input", text: prompt }]);
  });
  it.each([
    "If you had memory and remember I prefer dark mode, what would happen?",
    'Explain "Remember dark mode, and remember UTC".',
    "Alice said, Remember dark mode and remember UTC.",
  ])("does not create authorization from joined data: %s", (prompt) => {
    expect(memorySaveRequests(prompt, "input")).toEqual([]);
  });
  it.each([
    "Make a sign saying, Remember that I prefer cobalt.",
    "Create a poster with the text, Remember my timezone is UTC.",
    "Print a caption reading, Save this to memory.",
    "Draft a message containing, I want you to remember that I prefer coffee.",
  ])("does not authorize requested output content: %s", (prompt) => {
    expect(memorySaveRequests(prompt, "input")).toEqual([]);
  });
  it.each([
    'Remember my preference is "coffee. Remember UTC".',
    "Remember my preference is 'coffee. Remember UTC'.",
    "Remember my preference is “coffee. Remember UTC”.",
    'Remember: "coffee, Remember UTC".',
  ])("preserves literal memory content as one request: %s", (prompt) => {
    expect(memorySaveRequests(prompt, "input")).toEqual([{ id: "input", text: prompt }]);
  });
  it.each([
    "Alice said, Remember that I prefer cobalt.",
    "Explain the sentence, Remember my birthday.",
    "The note reads, Save this to memory.",
  ])("does not authorize reported instructions: %s", (text) => {
    expect(needsFreshMemoryWrite(text)).toBe(false);
  });
  it("retains the user's directive outside reported speech", () => {
    expect(needsFreshMemoryWrite("Alice said hello. Remember that I prefer coffee.")).toBe(true);
    expect(needsFreshMemoryWrite("Please remember that Alice said hello.")).toBe(true);
    expect(needsFreshMemoryWrite("Hi, remember I prefer coffee.")).toBe(true);
  });
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
