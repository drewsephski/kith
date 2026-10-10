import { describe, expect, it } from "vitest";
import { isUnfulfilledActionReply } from "./task-completion.js";

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
