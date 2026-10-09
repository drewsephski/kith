import type { TaskStarterId, TaskStarterResult } from "@rakazo/contracts";

export const TASK_STARTERS: readonly { id: TaskStarterId; title: string; prompt: string }[] = [
  {
    id: "gmail_search",
    title: "Search all my Gmail accounts",
    prompt: "Search all my connected Gmail accounts for…",
  },
  {
    id: "meeting_brief",
    title: "Build a brief for my next meeting",
    prompt: "Prepare me for my next meeting using my calendar, relevant emails, and HubSpot.",
  },
  {
    id: "inbox_todos",
    title: "Turn my inbox into a to-do list",
    prompt:
      "Turn emails from the past seven days into a prioritized to-do list, with links to each source.",
  },
  {
    id: "analytics_report",
    title: "Pull this week's numbers into a Sheet",
    prompt: "Pull this week's GA4 numbers into a Google Sheet.",
  },
];

export function taskStarterSearchQuery(prompt: string): string {
  const starter = TASK_STARTERS.find((value) => value.id === "gmail_search");
  const prefix = starter?.prompt.replace(/(?:…|\.{3})$/, "") ?? "";
  const trimmed = prompt.trim();
  if (!prefix || !trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return trimmed;
  return trimmed
    .slice(prefix.length)
    .replace(/^(?:…|\.{3})\s*/, "")
    .trim();
}

export type TaskStarterApp = "gmail" | "calendar" | "hubspot" | "analytics" | "sheets";
export function taskStarterApp(provider: string): TaskStarterApp | null {
  const key = provider.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["gmail", "googlemail"].includes(key)) return "gmail";
  if (["googlecalendar", "calendargoogle", "gcal"].includes(key)) return "calendar";
  if (key === "hubspot") return "hubspot";
  if (["googleanalytics", "googleanalytics4", "ga4"].includes(key)) return "analytics";
  if (["googlesheets", "googlesheet"].includes(key)) return "sheets";
  return null;
}

export function taskSourceId(connectionId: string, resourceId: string): string {
  return `${encodeURIComponent(connectionId)}:${encodeURIComponent(resourceId)}`;
}

/** Civil dates in the property's timezone; never use the machine's timezone. */
export function taskStarterPeriod(now: Date, timezone: string, period: "this_week" | "last_week") {
  if (!Number.isFinite(now.getTime())) throw new Error("Use a valid report date");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  const today = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const day = 86_400_000;
  const start = new Date(today.getTime() - (mondayOffset + (period === "last_week" ? 7 : 0)) * day);
  const end = period === "last_week" ? new Date(start.getTime() + 6 * day) : today;
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    provisional: period === "this_week" || today.getTime() - end.getTime() <= 2 * day,
  };
}

function plain(text: string) {
  return text.replace(/[\r\n]+/g, " ").replace(/[\\`*_[\]<>]/g, (character) => `\\${character}`);
}
function link(title: string, url: string | null) {
  if (!url) return plain(title);
  const parsed = new URL(url);
  return parsed.protocol === "https:" ? `[${plain(title)}](<${parsed.href}>)` : plain(title);
}

/** The receipt retains structured evidence; the conversation stays concise. */
export function renderTaskStarterResult(result: TaskStarterResult): string {
  const lines: string[] = [];
  if (result.kind === "gmail_search") {
    lines.push(
      result.messages.length
        ? `${result.messages.length} matching conversations.`
        : "No matches in the searched accounts.",
    );
    for (const message of result.messages.slice(0, 30))
      lines.push(
        `- ${link(message.subject || "Untitled email", message.url)} · ${plain(message.accountLabel)} · ${plain(message.from)}`,
      );
    for (const account of result.coverage)
      if (account.status !== "complete")
        lines.push(
          `${plain(account.label)}: ${account.status === "failed" ? "could not be searched" : "results limited"}.`,
        );
  } else if (result.kind === "meeting_brief") {
    if (result.meeting)
      lines.push(
        `**${link(result.meeting.title, result.meeting.url)}**`,
        plain(result.meeting.start),
      );
    else if (result.choices.length) {
      lines.push("Choose the meeting you want to prepare for.");
      for (const meeting of result.choices)
        lines.push(`- ${link(meeting.title, meeting.url)} · ${plain(meeting.start)}`);
    } else lines.push("No upcoming meeting found in the selected calendars.");
    const cite = (ids: string[]) =>
      ids
        .map((id) => result.sources.find((source) => source.id === id))
        .filter((source) => source !== undefined)
        .map((source) => link(source.title, source.url))
        .join(" · ");
    for (const fact of result.facts)
      lines.push(
        `- ${plain(fact.text)}${fact.sourceIds.length ? ` (${cite(fact.sourceIds)})` : ""}`,
      );
    if (result.suggestions.length) lines.push("", "Preparation suggestions");
    for (const suggestion of result.suggestions)
      lines.push(
        `- ${plain(suggestion.text)}${suggestion.sourceIds.length ? ` (${cite(suggestion.sourceIds)})` : ""}`,
      );
  } else if (result.kind === "inbox_todos") {
    lines.push(
      result.actions.length
        ? `${result.actions.length} suggested action items. Review them before saving.`
        : "No outstanding action items found in the searched messages.",
    );
    for (const action of result.actions)
      lines.push(
        `- ${plain(action.title)} · ${action.priority}${action.dueDate ? ` · ${plain(action.dueDate)}` : ""} — ${plain(action.reason)}`,
      );
  } else {
    const report = result.report;
    lines.push(
      `${report.startDate} – ${report.endDate} · ${plain(report.timezone)}${report.provisional ? " · Provisional" : ""}`,
    );
    for (const metric of report.metrics)
      lines.push(
        `- ${plain(metric.label)}: ${metric.value}${metric.name === "totalRevenue" && report.currency ? ` ${plain(report.currency)}` : ""}`,
      );
    lines.push(
      report.published
        ? link("Open report", report.url)
        : "Review the report before writing to Sheets.",
    );
  }
  if (result.warnings.length)
    lines.push("", ...result.warnings.map((warning) => `- ${plain(warning)}`));
  return lines.join("\n").slice(0, 20000);
}
