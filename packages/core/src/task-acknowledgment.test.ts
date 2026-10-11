import { MessageBlock } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { blocksToAgentHistoryText } from "./attachments.js";
import { taskAcknowledgmentBlocks } from "./task-acknowledgment.js";

describe("task acknowledgments", () => {
  it("echoes accepted input without becoming model history", () => {
    const blocks = taskAcknowledgmentBlocks([{ kind: "text", text: "Plan\n my week" }]);
    expect(blocks).toEqual([
      {
        kind: "progress",
        acknowledgment: true,
        text: "Got it — I’ll look into your request:\n\n> Plan my week",
      },
    ]);
    expect(MessageBlock.array().parse(blocks)).toEqual(blocks);
    expect(blocksToAgentHistoryText(blocks)).toBe("");
  });

  it("quotes markdown and HTML as literal text and bounds long input", () => {
    const blocks = taskAcknowledgmentBlocks([
      { kind: "text", text: "![image](https://example.test) <img src=x> " + "😀".repeat(200) },
    ]);
    const block = blocks[0];
    expect(block?.kind).toBe("progress");
    if (block?.kind !== "progress") throw new Error("Missing receipt");
    expect(block.text).toContain("\\!\\[image\\]\\(https://example.test\\) \\<img src=x\\>");
    expect(block.text).toMatch(/…$/u);
    expect(block.text).not.toContain("\uFFFD");
    expect(Array.from(block.text).length).toBeLessThan(230);
  });

  it("acknowledges attachment-only input without inventing a task", () => {
    expect(
      taskAcknowledgmentBlocks([
        {
          kind: "file",
          artifactId: "file-1",
          name: "report.pdf",
          mimeType: "application/pdf",
          size: 20,
        },
      ]),
    ).toEqual([
      { kind: "progress", acknowledgment: true, text: "Got it — I’ll look at your attachments." },
    ]);
  });
});
