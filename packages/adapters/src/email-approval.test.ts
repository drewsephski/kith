import { completeEmailApprovalPreview } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { emailApprovalPreview } from "./email-approval.js";
import { gmailEmailPreview } from "./task-platform.js";

const args = { to: "recipient@example.test", subject: "Subject", body: "Hello" };

describe("authoritative email send normalization", () => {
  it("requires an adapter-verified account and never invents one", () => {
    expect(emailApprovalPreview("GMAIL_SEND_EMAIL", args, [])).toBeUndefined();
    expect(emailApprovalPreview("GMAIL_SEND_EMAIL", args, [], "Connected account")).toBeUndefined();
  });
  it("includes every recipient and attachment", () => {
    expect(
      emailApprovalPreview(
        "GMAIL_SEND_EMAIL",
        {
          ...args,
          extra_recipients: ["extra@example.test"],
          cc: "copy@example.test",
          bcc: ["blind@example.test"],
          attachments: ["report.pdf"],
        },
        [],
        "mail@example.test",
        { attachmentsVerified: true },
      ),
    ).toMatchObject({
      account: "mail@example.test",
      to: ["recipient@example.test", "extra@example.test"],
      cc: ["copy@example.test"],
      bcc: ["blind@example.test"],
      attachments: ["report.pdf"],
    });
  });
  it.each([
    { cc: ["copy@example.test", 1] },
    { bcc: { address: "blind@example.test" } },
    { attachments: [{ name: "report.pdf" }] },
    { attachment: 1 },
    { attachment: "/tmp/report.pdf" },
    { attachments: ["https://example.test/report.pdf"] },
    { body: undefined },
    { subject: undefined },
    { to: "invalid" },
    { recipient_email: "other@example.test" },
    { subject: "Subject\r\nBcc: hidden@example.test" },
    { subject: "Subject\0hidden" },
    { from: { address: "hidden@example.test" } },
    { cc: "copy@example.test\r\nBcc: hidden@example.test" },
  ])("rejects incomplete or ambiguous fields %j", (patch) => {
    expect(
      emailApprovalPreview("GMAIL_SEND_EMAIL", { ...args, ...patch }, [], "mail@example.test"),
    ).toBeUndefined();
  });
  it("preserves HTML link destinations in review and removes executable content", () => {
    expect(
      emailApprovalPreview(
        "GMAIL_SEND_EMAIL",
        {
          ...args,
          is_html: true,
          body: '<script>bad()</script><a href="https://example.test/report">Report</a>',
        },
        [],
        "mail@example.test",
      )?.body,
    ).toBe("Report (https://example.test/report)");
  });
  it("does not treat unknown attachment state as a complete review", () => {
    expect(
      completeEmailApprovalPreview({
        account: "mail@example.test",
        to: ["recipient@example.test"],
        cc: [],
        bcc: [],
        subject: "Subject",
        body: "Hello",
      }),
    ).toBe(false);
  });
});

describe("complete Gmail MIME previews", () => {
  const payload = {
    mimeType: "text/plain",
    headers: [
      { name: "To", value: "recipient@example.test" },
      { name: "Subject", value: "Draft" },
    ],
    body: { data: Buffer.from("Body").toString("base64url") },
  };
  it("rejects body parts that still need attachment hydration", () => {
    expect(() =>
      gmailEmailPreview(
        { payload: { ...payload, body: { attachmentId: "body-1", size: 100 } } },
        "mail@example.test",
      ),
    ).toThrow("fetched in full");
  });
  it("rejects duplicated consequential headers", () => {
    expect(() =>
      gmailEmailPreview(
        {
          payload: {
            ...payload,
            headers: [...payload.headers, { name: "To", value: "hidden@example.test" }],
          },
        },
        "mail@example.test",
      ),
    ).toThrow("duplicate headers");
  });
  it("rejects a rich alternative that hides content from the plain-text preview", () => {
    expect(() =>
      gmailEmailPreview(
        {
          payload: {
            ...payload,
            mimeType: "multipart/alternative",
            body: {},
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("Safe text").toString("base64url") },
              },
              {
                mimeType: "text/html",
                body: { data: Buffer.from("<p>Different text</p>").toString("base64url") },
              },
            ],
          },
        },
        "mail@example.test",
      ),
    ).toThrow("differs");
  });
});
