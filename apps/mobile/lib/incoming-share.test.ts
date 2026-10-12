import { ATTACHMENT_MAX_BYTES } from "@rakazo/contracts";
import { expect, it } from "vitest";
import { parseIncomingShare } from "./incoming-share";
import { stageIncomingShare, takeIncomingShare } from "./incoming-share-draft";
import { filterPickedAttachments } from "./pick-attachments-filter";

const roots = ["file:///shared/group/"];
it("retains the validated size through staging and conversation capacity checks", () => {
  const scope = {
    endpoint: "https://example.test",
    userId: "one",
    spaceId: "one",
    conversation: "bot:one",
  };
  const contentBase64 = `${"A".repeat(Math.ceil(ATTACHMENT_MAX_BYTES / 3) * 4 - 2)}==`;
  const picked = filterPickedAttachments(0, [
    {
      name: "limit.txt",
      mimeType: "text/plain",
      size: ATTACHMENT_MAX_BYTES,
      contentBase64,
    },
  ]);
  stageIncomingShare("limit", { scope, text: "", attachments: picked.attachments });
  const incoming = takeIncomingShare("limit", scope)!;
  const imported = filterPickedAttachments(0, incoming.attachments);
  expect(imported.skipped).toEqual([]);
  expect(imported.attachments[0]?.size).toBe(ATTACHMENT_MAX_BYTES);
  expect(
    filterPickedAttachments(0, [
      {
        ...incoming.attachments[0]!,
        size: ATTACHMENT_MAX_BYTES + 1,
      },
    ]).skipped,
  ).toHaveLength(1);
});
it("imports text, links and local files without resolving remote content", () => {
  expect(
    parseIncomingShare(
      [
        { value: "Review this", shareType: "text" },
        { value: "https://example.test/article", shareType: "url" },
        {
          value: "file:///shared/group/report.pdf",
          shareType: "file",
          mimeType: "application/pdf",
        },
      ],
      roots,
    ),
  ).toEqual({
    text: "Review this\n\nhttps://example.test/article",
    files: [
      { uri: "file:///shared/group/report.pdf", name: "report.pdf", mimeType: "application/pdf" },
    ],
  });
});
it.each([
  "file:///private/secret.txt",
  "file:///shared/group/../../secret.txt",
  "file:///shared/group/..%2f..%2fsecret.txt",
  "file:///shared/group/nested%5c..%5csecret.txt",
  "file:///shared/group/%00/report.pdf",
  "https://example.test/file",
  "file://remote/shared/group/report.pdf",
])("rejects unowned file locations: %s", (value) => {
  expect(() => parseIncomingShare([{ value, shareType: "file" }], roots)).toThrow();
});
it.each(["javascript:alert(1)", "https://user:pass@example.test", "rakazo://thread"])(
  "rejects unsafe shared URLs: %s",
  (value) => {
    expect(() => parseIncomingShare([{ value, shareType: "url" }], roots)).toThrow();
  },
);
it("stages only for the selected account, Space and conversation and consumes once", () => {
  const scope = {
    endpoint: "https://example.test",
    userId: "one",
    spaceId: "one",
    conversation: "bot:one",
  };
  stageIncomingShare("share", { scope, text: "Review before sending", attachments: [] });
  expect(takeIncomingShare("share", { ...scope, userId: "two" })).toBeNull();
  stageIncomingShare("share", { scope, text: "Review before sending", attachments: [] });
  expect(takeIncomingShare("share", scope)?.text).toBe("Review before sending");
  expect(takeIncomingShare("share", scope)).toBeNull();
});
