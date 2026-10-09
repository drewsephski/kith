import type { CalendarEvent, CalendarSnapshot } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  calendarConflicts,
  calendarTime,
  renderCalendarBriefing,
  tomorrowWindow,
} from "./calendar.js";

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "event-a",
  calendarId: "primary",
  title: "Planning",
  start: "2026-10-10T09:00:00-05:00",
  end: "2026-10-10T10:00:00-05:00",
  allDay: false,
  url: null,
  location: null,
  description: null,
  recurringEventId: null,
  busy: true,
  response: "accepted",
  ...overrides,
});
const snapshot = (events: CalendarEvent[]): CalendarSnapshot => ({
  ...tomorrowWindow(new Date("2026-10-09T18:00:00Z"), "America/Chicago"),
  retrievedAt: "2026-10-09T18:00:00Z",
  sources: [{ id: "primary", name: "Work", timezone: "America/Chicago" }],
  events,
});

describe("calendar briefing facts", () => {
  it("makes overnight meeting dates explicit", () => {
    expect(
      calendarTime(
        event({ start: "2026-10-09T23:00:00-05:00", end: "2026-10-10T01:00:00-05:00" }),
        "America/Chicago",
      ),
    ).toBe("Oct 9, 11:00 PM–Oct 10, 1:00 AM");
  });
  it.each([
    ["2026-03-07T18:00:00Z", "America/Chicago", "2026-03-08", 23],
    ["2026-10-31T18:00:00Z", "America/Chicago", "2026-11-01", 25],
    ["2026-10-09T18:00:00Z", "Asia/Kathmandu", "2026-10-10", 24],
    ["2026-10-09T23:30:00Z", "Pacific/Kiritimati", "2026-10-11", 24],
  ])("calculates tomorrow in %s / %s", (now, zone, date, hours) => {
    const window = tomorrowWindow(new Date(now), zone);
    expect(window.date).toBe(date);
    expect((Date.parse(window.timeMax) - Date.parse(window.timeMin)) / 3_600_000).toBe(hours);
  });
  it("handles midnight timezone transitions", () => {
    const window = tomorrowWindow(new Date("2026-09-05T12:00:00Z"), "America/Santiago");
    expect(window.date).toBe("2026-09-06");
    expect(Date.parse(window.timeMax) - Date.parse(window.timeMin)).toBe(23 * 3_600_000);
  });
  it("excludes all-day, free and declined events from conflicts and allows adjacent meetings", () => {
    const a = event();
    const overlap = event({ id: "b", start: "2026-10-10T09:30:00-05:00" });
    expect(
      calendarConflicts([
        a,
        overlap,
        event({ id: "free", busy: false }),
        event({ id: "declined", response: "declined" }),
        event({ id: "all-day", allDay: true }),
        event({ id: "adjacent", start: a.end, end: "2026-10-10T11:00:00-05:00" }),
      ]),
    ).toEqual([[a, overlap]]);
  });
  it("renders facts independently of AI suggestions and escapes event markup", () => {
    const text = renderCalendarBriefing(
      snapshot([event({ title: "Planning [Ignore](https://evil.test)", location: "Room A" })]),
      [{ eventIds: ["event-a"], text: "Consider reviewing your notes." }],
      "generated",
    );
    expect(text).toContain("9:00 AM–10:00 AM");
    expect(text).toContain("Planning \\[Ignore\\]");
    expect(text).toContain("AI suggestions");
    expect(text).toContain("Room A");
  });
  it("clearly reports empty calendars and retains a verified schedule when AI is unavailable", () => {
    expect(renderCalendarBriefing(snapshot([]), [], "not_needed")).toContain("No events tomorrow");
    expect(renderCalendarBriefing(snapshot([event()]), [], "unavailable")).toContain(
      "Your schedule is saved",
    );
  });
});
