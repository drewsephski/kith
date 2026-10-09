import * as z from "zod";
import { CalendarTimezone } from "./calendar.js";
import { Id } from "./ids.js";

const HttpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Use an HTTPS source URL");

export const TaskStarterIdSchema = z.enum([
  "gmail_search",
  "meeting_brief",
  "inbox_todos",
  "analytics_report",
]);
export type TaskStarterId = z.infer<typeof TaskStarterIdSchema>;
export const TaskMetricSchema = z.enum([
  "sessions",
  "activeUsers",
  "screenPageViews",
  "keyEvents",
  "totalRevenue",
]);
export const TaskStarterSpecSchema = z
  .object({
    starter: TaskStarterIdSchema,
    meetingId: Id.nullable().default(null),
    meetingConnectionId: Id.nullable().default(null),
    query: z.string().trim().max(1000).default(""),
    gmailConnectionIds: z.array(Id).max(10).default([]),
    calendarConnectionIds: z.array(Id).max(10).default([]),
    hubspotConnectionId: Id.nullable().default(null),
    analyticsConnectionId: Id.nullable().default(null),
    sheetsConnectionId: Id.nullable().default(null),
    propertyId: z
      .string()
      .regex(/^\d{1,30}$/)
      .nullable()
      .default(null),
    spreadsheetId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{10,200}$/)
      .nullable()
      .default(null),
    reportRange: z
      .string()
      .regex(/^Rakazo_[a-f0-9]{16}!A1:B12$/)
      .nullable()
      .default(null),
    metrics: z
      .array(TaskMetricSchema)
      .min(1)
      .max(5)
      .default(["sessions", "activeUsers", "screenPageViews"]),
    period: z.enum(["this_week", "last_week"]).default("this_week"),
    timezone: CalendarTimezone,
    lookbackDays: z.number().int().min(1).max(30).default(7),
  })
  .superRefine((spec, ctx) => {
    for (const key of ["gmailConnectionIds", "calendarConnectionIds", "metrics"] as const)
      if (new Set(spec[key]).size !== spec[key].length)
        ctx.addIssue({ code: "custom", path: [key], message: "Choose each item once" });
    if (["gmail_search", "inbox_todos"].includes(spec.starter) && !spec.gmailConnectionIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["gmailConnectionIds"],
        message: "Choose a Gmail account",
      });
    if (spec.starter === "gmail_search" && !spec.query)
      ctx.addIssue({ code: "custom", path: ["query"], message: "Enter a search topic" });
    if (spec.starter === "meeting_brief" && !spec.calendarConnectionIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["calendarConnectionIds"],
        message: "Choose a Calendar account",
      });
    if (spec.starter === "analytics_report")
      for (const key of ["analyticsConnectionId", "sheetsConnectionId", "propertyId"] as const)
        if (!spec[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Choose a report source and destination",
          });
  });
export type TaskStarterSpec = z.infer<typeof TaskStarterSpecSchema>;
export const TaskStarterStartSchema = z.object({
  botId: Id,
  clientNonce: z.string().min(1).max(100),
  prompt: z.string().trim().min(1).max(4000),
  spec: TaskStarterSpecSchema,
});
export type TaskStarterStart = z.infer<typeof TaskStarterStartSchema>;
export const TaskSourceSchema = z.object({
  id: Id,
  connectionId: Id,
  title: z.string().max(500),
  url: HttpsUrl.nullable(),
  retrievedAt: z.string(),
});
export type TaskSource = z.infer<typeof TaskSourceSchema>;
export const TaskMailSchema = z.object({
  id: Id,
  threadId: Id,
  connectionId: Id,
  accountLabel: z.string(),
  subject: z.string().max(500),
  from: z.string().max(500),
  date: z.string(),
  snippet: z.string().max(1000),
  url: HttpsUrl,
});
export type TaskMail = z.infer<typeof TaskMailSchema>;
export const TaskTodoSchema = z.object({
  id: Id,
  title: z.string().min(1).max(200),
  notes: z.string().max(2000),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) =>
        Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
      "Use a valid calendar date",
    )
    .nullable(),
  priority: z.enum(["high", "normal", "low"]),
  reason: z.string().max(300),
  sourceIds: z.array(Id).min(1).max(10),
  savedItemId: Id.nullable().default(null),
});
export type TaskTodo = z.infer<typeof TaskTodoSchema>;
export const TaskReportSchema = z.object({
  propertyId: z.string(),
  timezone: CalendarTimezone,
  startDate: z.string(),
  endDate: z.string(),
  currency: z.string().nullable(),
  metrics: z.array(
    z.object({ name: TaskMetricSchema, label: z.string(), value: z.number().finite() }),
  ),
  spreadsheetId: z.string().nullable(),
  url: HttpsUrl.nullable(),
  range: z.string(),
  values: z.array(z.array(z.union([z.string(), z.number().finite(), z.null()]))).max(100),
  provisional: z.boolean(),
  published: z.boolean(),
});
export type TaskReport = z.infer<typeof TaskReportSchema>;
const commonResult = {
  sources: z.array(TaskSourceSchema).max(300),
  warnings: z.array(z.string().max(500)).max(30),
  summary: z.string().max(20000),
};
export const TaskStarterResultSchema = z.discriminatedUnion("kind", [
  z.object({
    ...commonResult,
    kind: z.literal("gmail_search"),
    messages: z.array(TaskMailSchema).max(200),
    coverage: z.array(
      z.object({
        connectionId: Id,
        label: z.string(),
        status: z.enum(["complete", "limited", "failed"]),
        count: z.number().int().nonnegative(),
      }),
    ),
  }),
  z.object({
    ...commonResult,
    kind: z.literal("meeting_brief"),
    meeting: z
      .object({
        id: Id,
        title: z.string(),
        start: z.string(),
        end: z.string(),
        url: HttpsUrl.nullable(),
      })
      .nullable(),
    choices: z
      .array(
        z.object({
          id: Id,
          connectionId: Id,
          title: z.string(),
          start: z.string(),
          end: z.string(),
          url: HttpsUrl.nullable(),
        }),
      )
      .max(20)
      .default([]),
    facts: z.array(z.object({ text: z.string().max(1000), sourceIds: z.array(Id) })).max(30),
    suggestions: z.array(z.object({ text: z.string().max(1000), sourceIds: z.array(Id) })).max(10),
  }),
  z.object({
    ...commonResult,
    kind: z.literal("inbox_todos"),
    actions: z.array(TaskTodoSchema).max(50),
  }),
  z.object({ ...commonResult, kind: z.literal("analytics_report"), report: TaskReportSchema }),
]);
export type TaskStarterResult = z.infer<typeof TaskStarterResultSchema>;
export const TaskStarterReceiptSchema = z.object({
  id: Id,
  runId: Id,
  starter: TaskStarterIdSchema,
  status: z.enum([
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "reconciliation_required",
  ]),
  result: TaskStarterResultSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  repeat: z
    .object({
      timezone: CalendarTimezone,
      name: z.string(),
      sources: z.array(z.string()),
      writes: z.boolean(),
    })
    .nullable()
    .optional(),
});
export type TaskStarterReceipt = z.infer<typeof TaskStarterReceiptSchema>;
export const TaskStarterOptionsSchema = z.object({
  configured: z.boolean(),
  connections: z.array(
    z.object({
      id: Id,
      connectorId: z.string(),
      app: z.enum(["gmail", "calendar", "hubspot", "analytics", "sheets"]),
      name: z.string(),
      identity: z.string().nullable(),
      status: z.enum(["connected", "pending", "error", "revoked"]),
    }),
  ),
});
export type TaskStarterOptions = z.infer<typeof TaskStarterOptionsSchema>;
export const TaskAnalyticsPropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: CalendarTimezone,
});
export type TaskAnalyticsProperty = z.infer<typeof TaskAnalyticsPropertySchema>;
