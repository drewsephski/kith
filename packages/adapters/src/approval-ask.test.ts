import { describe, expect, it } from "vitest";
import { buildApprovalAskBlock } from "./approval-ask.js";

describe("buildApprovalAskBlock", () => {
  it("rejects an incomplete send rather than offering an allow action", () => {
    expect(() =>
      buildApprovalAskBlock(
        "effect-1",
        "gmail_send_email",
        { to: "person@example.test", body: "token-secret" },
        ["token-secret"],
      ),
    ).toThrow("Could not verify the complete email");
  });

  it("requires an authoritative preview, even when model arguments look complete", () => {
    expect(() =>
      buildApprovalAskBlock(
        "effect-1",
        "GMAIL_SEND_EMAIL",
        { user_id: "me", to: "person@example.test", subject: "Hi", body: "Hello" },
        [],
      ),
    ).toThrow("Could not verify the complete email");
  });

  it("binds the approval to its effect and redacts a complete verified preview", () => {
    const block = buildApprovalAskBlock(
      "effect-1",
      "GMAIL_SEND_DRAFT",
      { draft_id: "draft-1" },
      ["token-secret"],
      {
        email: {
          account: "mail@example.test",
          to: ["person@example.test"],
          cc: [],
          bcc: [],
          subject: "Hi",
          body: "token-secret",
          attachments: [],
        },
        emailRevision: "revision-1",
      },
    );
    expect(block).toMatchObject({
      kind: "ask",
      approvalEffectId: "effect-1",
      emailRevision: "revision-1",
      actions: [
        { id: "allow", label: "Send email" },
        { id: "deny", label: "Cancel" },
      ],
    });
    expect(JSON.stringify(block)).not.toContain("token-secret");
  });

  it("bounds model-controlled summaries and details", () => {
    const block = buildApprovalAskBlock(
      "effect-1",
      "destination.write",
      { title: "t".repeat(1_000), body: "b".repeat(10_000) },
      [],
    );

    expect(block.kind).toBe("ask");
    if (block.kind !== "ask") throw new Error("expected ask block");
    expect(block.text.length).toBeLessThanOrEqual(501);
    expect(block.detail?.length).toBeLessThanOrEqual(4_001);
  });

  it("includes an optional review reason as the first detail line", () => {
    const block = buildApprovalAskBlock(
      "effect-1",
      "destination.write",
      { to: "person@example.test", subject: "Hi" },
      [],
      { reviewReason: "Sends email outside the draft-only task." },
    );

    expect(block.kind).toBe("ask");
    if (block.kind !== "ask") throw new Error("expected ask block");
    expect(block.detail?.startsWith("Sends email outside the draft-only task.")).toBe(true);
    expect(block.detail).toContain("to: person@example.test");
  });

  it("uses a one-time create or cancel choice for a new security boundary", () => {
    const block = buildApprovalAskBlock(
      "effect-1",
      "create_space",
      { name: "Customer support" },
      [],
    );

    expect(block).toMatchObject({
      kind: "ask",
      text: "Create space “Customer support”?",
      actions: [
        { id: "allow", label: "Create space", outcome: "created" },
        { id: "deny", label: "Cancel", outcome: "cancelled" },
      ],
    });
    if (block.kind !== "ask") throw new Error("expected ask block");
    expect(block.detail).toContain("stay separate from other spaces");
  });

  it("does not truncate a verified email body or omit Cc and Bcc", () => {
    const email = {
      account: "mail@example.test",
      to: ["recipient@example.test", "other@example.test"],
      cc: ["copy@example.test"],
      bcc: ["hidden@example.test"],
      subject: "Status",
      body: "b".repeat(8000),
      attachments: ["report.pdf"],
    };
    const block = buildApprovalAskBlock(
      "effect-1",
      "GMAIL_SEND_DRAFT",
      { draft_id: "draft-1" },
      [],
      { email },
    );
    expect(block).toMatchObject({ approvalAction: "email_send", email });
  });
});
