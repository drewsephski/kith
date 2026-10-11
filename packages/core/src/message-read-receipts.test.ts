import { describe, expect, it } from "vitest";
import { applyMessageReadReceipt, latestReadMessageId } from "./message-read-receipts.js";
import { userVisibleMessages } from "./message-visibility.js";

const readAt = "2026-10-11T13:00:00.000Z";

describe("message read receipts", () => {
  it("marks only exact user messages, keeping steering unread and the first read time", () => {
    const messages = [
      { id: "first", role: "user" },
      { id: "steering", role: "user" },
      { id: "bot", role: "bot" },
    ];
    const read = applyMessageReadReceipt(messages, ["first", "bot"], readAt);
    expect(read).toEqual([{ ...messages[0], readAt }, messages[1], messages[2]]);
    expect(latestReadMessageId(read)).toBeUndefined();
    const consumed = applyMessageReadReceipt(read, ["steering"], readAt);
    expect(latestReadMessageId(consumed)).toBe("steering");
    expect(applyMessageReadReceipt(consumed, ["steering"], "2026-10-11T13:01:00.000Z")).toEqual(
      consumed,
    );
  });

  it("ignores malformed evidence and omits read labels for voice turns", () => {
    const messages = [{ id: "voice", role: "user", readAt, callId: "call" }];
    expect(latestReadMessageId(messages)).toBeUndefined();
    expect(applyMessageReadReceipt(messages, ["voice"], "invalid")).toBe(messages);
    expect(applyMessageReadReceipt(messages, undefined, readAt)).toBe(messages);
  });

  it("hides legacy static acceptance bubbles without hiding real progress", () => {
    expect(
      userVisibleMessages([
        { id: "legacy", blocks: [{ kind: "progress", acknowledgment: true, text: "Got it" }] },
        { id: "real", blocks: [{ kind: "progress", text: "Checking your calendar" }] },
      ]).map((message) => message.id),
    ).toEqual(["real"]);
  });
});
