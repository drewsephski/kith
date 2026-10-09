import type {
  TaskAnalyticsProperty,
  TaskMail,
  TaskMetricSchema,
  TaskReport,
} from "@rakazo/contracts";
import type { z } from "zod";
import type { AdapterContext } from "./types.js";

export type TaskConnection = {
  id: string;
  connectorId: string;
  provider: string;
  providerRef: string;
  displayName: string;
};
export type TaskMailContent = TaskMail & { text: string; to: string[] };
export type TaskMeeting = {
  id: string;
  connectionId: string;
  title: string;
  start: string;
  end: string;
  url: string | null;
  description: string;
  attendees: string[];
};
export type TaskContextRecord = { id: string; title: string; text: string; url: string | null };
export type TaskMetric = z.infer<typeof TaskMetricSchema>;
export interface TaskPlatform {
  identity(connection: TaskConnection, context: AdapterContext): Promise<string>;
  searchMail(
    input: {
      connection: TaskConnection;
      query: string;
      maxMessages: number;
      includeThreadContext?: boolean;
    },
    context: AdapterContext,
  ): Promise<{ messages: TaskMailContent[]; complete: boolean }>;
  upcomingMeetings(
    input: { connection: TaskConnection; timeMin: string; timeMax: string },
    context: AdapterContext,
  ): Promise<{ meetings: TaskMeeting[]; complete: boolean }>;
  hubspotContext(
    input: { connection: TaskConnection; emails: string[] },
    context: AdapterContext,
  ): Promise<{ records: TaskContextRecord[]; warnings: string[] }>;
  analyticsProperties(
    connection: TaskConnection,
    context: AdapterContext,
  ): Promise<TaskAnalyticsProperty[]>;
  analyticsReport(
    input: {
      connection: TaskConnection;
      propertyId: string;
      metrics: TaskMetric[];
      startDate: string;
      endDate: string;
    },
    context: AdapterContext,
  ): Promise<{
    report: Pick<
      TaskReport,
      "propertyId" | "timezone" | "startDate" | "endDate" | "currency" | "metrics"
    >;
    warnings: string[];
  }>;
  sheetInfo(
    connection: TaskConnection,
    spreadsheetId: string,
    context: AdapterContext,
  ): Promise<{ title: string; url: string }>;
  findReportSheet(
    connection: TaskConnection,
    operationKey: string,
    context: AdapterContext,
  ): Promise<string | null>;
  createReportSheet(
    connection: TaskConnection,
    title: string,
    operationKey: string,
    context: AdapterContext,
  ): Promise<string>;
  readSheet(
    connection: TaskConnection,
    spreadsheetId: string,
    range: string,
    context: AdapterContext,
  ): Promise<(string | number | null)[][]>;
  writeSheet(
    connection: TaskConnection,
    spreadsheetId: string,
    range: string,
    values: (string | number | null)[][],
    context: AdapterContext,
  ): Promise<void>;
}
