import { EmailCardSchema, MessageBlock } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { emailCardFromTool } from "./email-card.js";

const args = {
  mode: "draft",
  account: "mail@example.test",
  to: ["recipient@example.test"],
  cc: ["copy@example.test"],
  bcc: [],
  subject: "Review",
  body: "Hello",
  draftId: "draft-123",
};
describe("email cards", () => {
  it("validates persisted cards and preserves real service references", () => {
    const card = emailCardFromTool(args, []);
    expect(MessageBlock.parse(card)).toEqual(card);
    expect(EmailCardSchema.parse(card)).toEqual(card);
    expect(card.draftId).toBe("draft-123");
    expect(card.provenance).toBe("unverified");
  });
  it("does not let a model claim provider-confirmed provenance", () => {
    expect(emailCardFromTool({ ...args, provenance: "provider" }, []).provenance).toBe(
      "unverified",
    );
  });
  it("rejects missing recipients and unbounded content", () => {
    expect(() => emailCardFromTool({ ...args, to: [] }, [])).toThrow();
    expect(() => emailCardFromTool({ ...args, body: "x".repeat(50001) }, [])).toThrow();
  });
  it("redacts secrets in headers and content", () => {
    const card = emailCardFromTool(
      {
        ...args,
        account: "private-token",
        to: ["private-token"],
        subject: "private-token",
        body: "private-token",
      },
      ["private-token"],
    );
    expect(JSON.stringify(card)).not.toContain("private-token");
  });
});
