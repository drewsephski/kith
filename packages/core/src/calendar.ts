import type { CalendarEvent, CalendarSnapshot, CalendarSuggestion } from "@rakazo/contracts";

export const CALENDAR_PREFERENCES_PATH = "calendar/preferences.md";

export function localCalendarDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Find the first instant on a local date, including DST changes at midnight. */
function startOfLocalDate(date: string, timezone: string): Date {
  const center = Date.parse(`${date}T00:00:00Z`);
  let lo = center - 36 * 3_600_000;
  let hi = center + 36 * 3_600_000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2000) * 1000;
    if (localCalendarDate(new Date(mid), timezone) < date) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

export function tomorrowWindow(now: Date, timezone: string) {
  const date = nextDate(localCalendarDate(now, timezone));
  return {
    date,
    timezone,
    timeMin: startOfLocalDate(date, timezone).toISOString(),
    timeMax: startOfLocalDate(nextDate(date), timezone).toISOString(),
  };
}

export function calendarConflicts(events: CalendarEvent[]): Array<[CalendarEvent, CalendarEvent]> {
  const timed = events
    .filter((e) => !e.allDay && e.busy && e.response !== "declined")
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const conflicts: Array<[CalendarEvent, CalendarEvent]> = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (Date.parse(timed[j]!.start) >= Date.parse(timed[i]!.end)) break;
      conflicts.push([timed[i]!, timed[j]!]);
    }
  }
  return conflicts;
}

function plain(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}[\]<>#|!]/g, "\\$&");
}

export function calendarTime(event: CalendarEvent, timezone: string): string {
  if (event.allDay) return "All day";
  const format = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (localCalendarDate(start, timezone) === localCalendarDate(end, timezone))
    return `${format.format(start)}–${format.format(end)}`;
  const date = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  });
  return `${date.format(start)}, ${format.format(start)}–${date.format(end)}, ${format.format(end)}`;
}

/** Facts are rendered exclusively from the persisted snapshot, never model prose. */
export function renderCalendarBriefing(
  snapshot: CalendarSnapshot,
  suggestions: CalendarSuggestion[],
  suggestionStatus: string,
): string {
  const events = snapshot.events.filter((e) => e.response !== "declined");
  const lines = [`## Tomorrow · ${snapshot.date}`, `*${snapshot.timezone}*`, ""];
  if (!snapshot.sources.length) lines.push("No readable calendars were returned.");
  else if (!events.length) lines.push("No events tomorrow in your connected calendars.");
  else {
    lines.push("### Schedule");
    for (const event of events.slice(0, 12)) {
      const title = plain(event.title);
      const url =
        event.url && /^https:\/\/[^\s]+$/.test(event.url)
          ? encodeURI(event.url).replace(/[()]/g, (char) => (char === "(" ? "%28" : "%29"))
          : null;
      const name = url ? `[${title}](${url})` : title;
      lines.push(
        `- **${calendarTime(event, snapshot.timezone)}** · ${name}${event.response === "tentative" ? " (tentative)" : ""}${event.location ? ` · ${plain(event.location)}` : ""}`,
      );
    }
    if (events.length > 12) lines.push(`- ${events.length - 12} more events in the receipt.`);
    const conflicts = calendarConflicts(events);
    if (conflicts.length) {
      lines.push("", "### Conflicts");
      for (const [a, b] of conflicts.slice(0, 10))
        lines.push(`- ${plain(a.title)} overlaps ${plain(b.title)}.`);
      if (conflicts.length > 10)
        lines.push(`- ${conflicts.length - 10} more overlaps in the receipt.`);
    }
    lines.push("", "### Preparation · AI suggestions");
    if (suggestions.length)
      for (const suggestion of suggestions) {
        const titles = events
          .filter((event) => suggestion.eventIds.includes(event.id))
          .map((event) => plain(event.title));
        lines.push(`- **${titles.join(" · ")}** · ${plain(suggestion.text)}`);
      }
    else if (suggestionStatus === "unavailable")
      lines.push("Personalized suggestions are unavailable. Your schedule is saved.");
  }
  return lines.join("\n");
}

export function managedConnectionId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("managedConnectionId" in metadata))
    return null;
  return typeof metadata.managedConnectionId === "string" ? metadata.managedConnectionId : null;
}
export function managedProviderRef(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("managedProviderRef" in metadata)) return null;
  return typeof metadata.managedProviderRef === "string" ? metadata.managedProviderRef : null;
}
