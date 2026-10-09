import * as z from "zod";

export const CalendarTimezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA timezone");

export const CalendarSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string().nullable(),
});
export const CalendarEventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  url: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  recurringEventId: z.string().nullable(),
  busy: z.boolean(),
  response: z.string().nullable(),
});
export const CalendarSnapshotSchema = z.object({
  date: z.string(),
  timezone: CalendarTimezone,
  timeMin: z.string(),
  timeMax: z.string(),
  retrievedAt: z.string(),
  sources: z.array(CalendarSourceSchema),
  events: z.array(CalendarEventSchema),
});
export type CalendarSource = z.infer<typeof CalendarSourceSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type CalendarSnapshot = z.infer<typeof CalendarSnapshotSchema>;
export const CalendarSuggestionsSchema = z
  .array(
    z.object({
      eventIds: z.array(z.string()).max(10),
      text: z.string().min(1).max(500),
    }),
  )
  .max(5);
export type CalendarSuggestion = z.infer<typeof CalendarSuggestionsSchema>[number];
export const CalendarReceiptSchema = z.object({
  id: z.string(),
  runId: z.string(),
  status: z.string(),
  timezone: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  attempts: z.number(),
  error: z.string().nullable(),
  snapshot: CalendarSnapshotSchema.nullable(),
  outcome: z.string().nullable(),
  suggestions: CalendarSuggestionsSchema,
  suggestionStatus: z.enum(["generated", "unavailable", "not_needed"]).nullable(),
  memorySources: z.array(z.object({ id: z.string(), path: z.string(), revision: z.number() })),
});
export type CalendarReceipt = z.infer<typeof CalendarReceiptSchema>;
export const CalendarOAuthConfigSchema = z.object({
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().trim().min(1).max(16384),
});
export type CalendarOAuthConfig = z.infer<typeof CalendarOAuthConfigSchema>;
