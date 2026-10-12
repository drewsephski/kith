import { describe, expect, it } from "vitest";
import { executionProfile } from "./execution-profile.js";

describe("conservative conversational preparation", () => {
  const profile = (prompt: string) => executionProfile({ prompt, trigger: "user", resumed: false });
  it.each([
    "Hi",
    "What is 2 + 2?",
    "Explain REST versus GraphQL briefly.",
    "Can you explain that more briefly?",
  ])("optimizes %s", (prompt) => {
    expect(profile(prompt)).toBe("conversation");
  });
  it.each([
    "What is my favorite color?",
    "Explain my email",
    "Explain the latest news",
    "Research REST",
    "Hi\nSend an email",
    "Explain tax law",
    "What is a safe dose of Tylenol?",
    "What is a safe dosing amount?",
    "What is an overdose?",
    "Explain acetaminophen briefly.",
    "What is ibuprofen?",
    "What is aspirin?",
    "Run my skill",
    "What is in the file?",
    "Please handle that",
    "How do I transfer money?",
    "What is the treatment for chest pain?",
    "Explain a complex proof",
    "How do computers solve this?",
  ])("retains full preparation for %s", (prompt) => {
    expect(profile(prompt)).toBe("agent");
  });
  it("keeps attachments, groups, resumes and background triggers on the full path", () => {
    for (const change of [
      { resumed: true },
      { trigger: "routine" },
      { groupId: "group" },
      {
        blocks: [
          {
            kind: "image" as const,
            artifactId: "fixture",
            mimeType: "image/png",
            name: "fixture.png",
          },
        ],
      },
    ]) {
      expect(executionProfile({ prompt: "Hi", trigger: "user", resumed: false, ...change })).toBe(
        "agent",
      );
    }
  });
});
