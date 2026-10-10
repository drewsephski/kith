import { describe, expect, it } from "vitest";
import { appContract, MessageBlock, validateThreadsSendInput } from "./index.js";

describe("attachment contracts", () => {
  it("parses image and file message blocks", () => {
    expect(
      MessageBlock.parse({
        kind: "image",
        artifactId: "art_1",
        mimeType: "image/png",
        name: "shot.png",
      }),
    ).toMatchObject({ kind: "image", name: "shot.png" });
    expect(
      MessageBlock.parse({
        kind: "file",
        artifactId: "art_2",
        mimeType: "application/pdf",
        name: "brief.pdf",
        size: 1234,
      }),
    ).toMatchObject({ kind: "file", size: 1234 });
  });

  it("requires text or attachments for threads.send", () => {
    expect(validateThreadsSendInput({ text: "hello" })).toBe(true);
    expect(validateThreadsSendInput({ artifactIds: ["art_1"] })).toBe(true);
    expect(validateThreadsSendInput({})).toBe(false);
    expect(validateThreadsSendInput({ artifactIds: ["a", "b", "c", "d", "e"] })).toBe(true);
  });
});

it("accepts an inline email Send while rejecting removed Save actions from old clients", () => {
  const input = appContract.threads.send["~orpc"].inputSchema!;
  const action = {
    messageId: "message-1",
    blockIndex: 0,
    edits: { subject: "Subject", body: "Edited reply" },
  };
  expect(input.safeParse({ botId: "bot-1", emailAction: action }).success).toBe(true);
  expect(
    input.safeParse({ botId: "bot-1", emailAction: { ...action, action: "save" } }).success,
  ).toBe(false);
});
