import { describe, expect, it } from "vitest";
import { buildApprovalAskBlock } from "./approval-ask.js";

describe("buildApprovalAskBlock", () => {
  it("binds the approval to its effect and redacts secrets", () => {
    const block = buildApprovalAskBlock(
      "effect-1",
      "gmail_send_email",
      { to: "person@example.test", body: "token-secret" },
      ["token-secret"],
    );

    expect(block).toMatchObject({
      kind: "ask",
      approvalEffectId: "effect-1",
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
      "gmail_send_email",
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

  it("shows complete email content, every recipient, and safe HTML without truncating the body", () => {
    const block = buildApprovalAskBlock(
      "effect-1",
      "GMAIL_SEND_EMAIL",
      {
        recipient_email: "recipient@example.test",
        extra_recipients: ["other@example.test"],
        cc: ["copy@example.test"],
        bcc: ["hidden@example.test"],
        subject: "Status",
        body: "b".repeat(8000),
      },
      [],
    );
    expect(block).toMatchObject({
      approvalAction: "email_send",
      email: {
        to: ["recipient@example.test", "other@example.test"],
        cc: ["copy@example.test"],
        bcc: ["hidden@example.test"],
        subject: "Status",
        body: "b".repeat(8000),
      },
    });
    const html = buildApprovalAskBlock(
      "effect-2",
      "GMAIL_SEND_EMAIL",
      {
        to: "recipient@example.test",
        subject: "HTML",
        body: "<script>steal()</script><p>Hello &amp; welcome</p>",
        is_html: true,
      },
      [],
    );
    expect(html).toMatchObject({ email: { body: "Hello & welcome" } });
  });
});
