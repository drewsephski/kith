import { TaskStarterResultSchema, TaskStarterSpecSchema } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { taskStarterRepeatPlan } from "./task-starter-repeat.js";

describe("repeatable task plans", () => {
  it("retains selected read sources and uses the next meeting rather than a stale event", () => {
    const spec = TaskStarterSpecSchema.parse({
      starter: "meeting_brief",
      timezone: "UTC",
      calendarConnectionIds: ["calendar"],
      meetingId: "old-meeting",
      meetingConnectionId: "calendar",
    });
    const result = TaskStarterResultSchema.parse({
      kind: "meeting_brief",
      sources: [],
      warnings: [],
      summary: "No events",
      meeting: null,
      facts: [],
      suggestions: [],
    });
    expect(taskStarterRepeatPlan(spec, result)).toMatchObject({
      action: "read",
      spec: { calendarConnectionIds: ["calendar"], meetingId: null, meetingConnectionId: null },
    });
    expect(() => taskStarterRepeatPlan({ ...spec, starter: "inbox_todos" }, result)).toThrow(
      "does not match",
    );
  });
  it("cannot turn a report preview into an approved recurring write", () => {
    const spec = TaskStarterSpecSchema.parse({
      starter: "analytics_report",
      timezone: "UTC",
      analyticsConnectionId: "analytics",
      sheetsConnectionId: "sheets",
      propertyId: "123",
    });
    const result = TaskStarterResultSchema.parse({
      kind: "analytics_report",
      sources: [],
      warnings: [],
      summary: "Preview",
      report: {
        propertyId: "123",
        timezone: "UTC",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        currency: null,
        metrics: [],
        spreadsheetId: "fixture-spreadsheet",
        url: null,
        range: "Rakazo_0123456789abcdef!A1:B12",
        values: [],
        provisional: false,
        published: false,
      },
    });
    expect(() => taskStarterRepeatPlan(spec, result)).toThrow("Publish");
    if (result.kind !== "analytics_report") throw new Error("Invalid fixture");
    result.report.published = true;
    expect(taskStarterRepeatPlan(spec, result)).toMatchObject({
      action: "scheduled_publish",
      spec: { spreadsheetId: "fixture-spreadsheet", reportRange: "Rakazo_0123456789abcdef!A1:B12" },
    });
  });
});
