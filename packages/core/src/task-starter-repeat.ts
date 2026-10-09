import type { TaskStarterResult, TaskStarterSpec } from "@rakazo/contracts";

/** Reuse the authorized retrieval definition; only approved reports repeat writes. */
export function taskStarterRepeatPlan(spec: TaskStarterSpec, result: TaskStarterResult) {
  if (spec.starter !== result.kind) throw new Error("Task result does not match its source");
  if (result.kind === "analytics_report") {
    if (!result.report.published || !result.report.spreadsheetId)
      throw new Error("Publish the report before scheduling it");
    return {
      name: "GA4 report",
      prompt: "Update the approved GA4 report in Google Sheets",
      action: "scheduled_publish" as const,
      spec: {
        ...spec,
        spreadsheetId: result.report.spreadsheetId,
        reportRange: result.report.range,
        timezone: result.report.timezone,
      },
    };
  }
  const names = {
    gmail_search: "Email search",
    inbox_todos: "Inbox to-do list",
    meeting_brief: "Next meeting brief",
  };
  const prompts = {
    gmail_search: `Search connected Gmail accounts for ${spec.query}`,
    inbox_todos: "Prepare a prioritized inbox to-do list with verified sources",
    meeting_brief: "Prepare a source-backed brief for my next meeting",
  };
  return {
    name: names[result.kind],
    prompt: prompts[result.kind],
    action: "read" as const,
    // A routine should find the next meeting rather than repeat an old selection.
    spec: { ...spec, meetingId: null, meetingConnectionId: null },
  };
}
