import { describe, expect, it } from "vitest";
import { ComposioAuthConfigsSchema } from "./integration-settings.js";
import { TaskSourceSchema, TaskStarterSpecSchema } from "./task-starters.js";

describe("task starter external inputs", () => {
  it("requires selected mailboxes and a topic instead of treating an empty search as all mail", () => {
    expect(
      TaskStarterSpecSchema.safeParse({ starter: "gmail_search", timezone: "UTC" }).success,
    ).toBe(false);
    expect(
      TaskStarterSpecSchema.safeParse({
        starter: "gmail_search",
        timezone: "UTC",
        query: "contract",
        gmailConnectionIds: ["work"],
      }).success,
    ).toBe(true);
  });
  it("rejects duplicate accounts and unknown report metrics", () => {
    expect(
      TaskStarterSpecSchema.safeParse({
        starter: "inbox_todos",
        timezone: "UTC",
        gmailConnectionIds: ["work", "work"],
      }).success,
    ).toBe(false);
    expect(
      TaskStarterSpecSchema.safeParse({
        starter: "analytics_report",
        timezone: "UTC",
        metrics: ["made_up_revenue"],
        analyticsConnectionId: "ga",
        sheetsConnectionId: "sheet",
        propertyId: "123",
      }).success,
    ).toBe(false);
  });
  it("requires concrete analytics source and rejects invalid sheet identifiers", () => {
    const input = {
      starter: "analytics_report",
      timezone: "UTC",
      analyticsConnectionId: "ga",
      sheetsConnectionId: "sheet",
      propertyId: "123",
    };
    expect(TaskStarterSpecSchema.safeParse(input).success).toBe(true);
    expect(TaskStarterSpecSchema.safeParse({ ...input, propertyId: null }).success).toBe(false);
    expect(
      TaskStarterSpecSchema.safeParse({ ...input, spreadsheetId: "../../other" }).success,
    ).toBe(false);
  });
  it("requires HTTPS provenance links", () => {
    const source = {
      id: "source",
      connectionId: "gmail",
      title: "Email",
      retrievedAt: "2026-10-09",
    };
    expect(TaskSourceSchema.safeParse({ ...source, url: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(TaskSourceSchema.safeParse({ ...source, url: "https://mail.google.com" }).success).toBe(
      true,
    );
  });
  it("accepts owned OAuth configuration IDs without accepting arbitrary credentials", () => {
    expect(ComposioAuthConfigsSchema.safeParse({ gmail: "ac_fake_config" }).success).toBe(true);
    expect(ComposioAuthConfigsSchema.safeParse({ gmail: "fake-api-key" }).success).toBe(false);
  });
});
