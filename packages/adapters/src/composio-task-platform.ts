import { createHash } from "node:crypto";
import type { AdapterContext, TaskConnection } from "@rakazo/adapter-kit";
import * as z from "zod";
import type { TaskProxy, TaskProxyRequest } from "./task-platform.js";
import {
  RestTaskPlatform,
  TaskPlatformReconciliationError,
  TaskPlatformRejectedError,
} from "./task-platform.js";

export type ComposioTaskAction = {
  tool: string;
  version: string;
  args: Record<string, unknown>;
};
export type ComposioTaskExecute = (
  action: ComposioTaskAction,
  connection: TaskConnection,
  context: AdapterContext,
) => Promise<Record<string, unknown>>;
const ANALYTICS_VERSION = "20260924_00";
const SHEETS_VERSION = "20261001_00";
const record = z.record(z.string(), z.unknown());
const sheetId = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/);
const marker = (key: string) =>
  createHash("sha256").update(z.string().min(1).max(1000).parse(key)).digest("hex").slice(0, 24);

/** Native actions can reach both Google API families without bypassing proxy domain policy. */
export function composioAnalyticsAction(request: TaskProxyRequest): ComposioTaskAction | null {
  const target = new URL(request.url);
  if (!["analyticsadmin.googleapis.com", "analyticsdata.googleapis.com"].includes(target.hostname))
    return null;
  if (target.pathname === "/v1beta/accountSummaries")
    return {
      tool: "GOOGLE_ANALYTICS_LIST_ACCOUNT_SUMMARIES",
      version: ANALYTICS_VERSION,
      args: {
        pageSize: Number(target.searchParams.get("pageSize") ?? 200),
        ...(target.searchParams.get("pageToken")
          ? { pageToken: target.searchParams.get("pageToken") }
          : {}),
      },
    };
  const name = target.pathname.replace(/^\/v1beta\//, "");
  if (target.pathname.endsWith("/metadata"))
    return { tool: "GOOGLE_ANALYTICS_GET_METADATA", version: ANALYTICS_VERSION, args: { name } };
  if (target.pathname.endsWith(":checkCompatibility"))
    return {
      tool: "GOOGLE_ANALYTICS_CHECK_COMPATIBILITY",
      version: ANALYTICS_VERSION,
      args: { property: name.replace(/:checkCompatibility$/, ""), ...request.body },
    };
  if (target.pathname.endsWith(":runReport"))
    return {
      tool: "GOOGLE_ANALYTICS_RUN_REPORT",
      version: ANALYTICS_VERSION,
      args: {
        property: name.replace(/:runReport$/, ""),
        ...request.body,
        limit: Number(request.body?.limit ?? 1),
      },
    };
  return { tool: "GOOGLE_ANALYTICS_GET_PROPERTY", version: ANALYTICS_VERSION, args: { name } };
}

/** Translate documented action wrappers into the upstream JSON consumed by TaskPlatform. */
export function composioTaskActionData(value: unknown): Record<string, unknown> {
  if (Buffer.byteLength(JSON.stringify(value) ?? "") > 2 * 1024 * 1024)
    throw new Error("The integration response exceeded the size limit");
  let parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  for (let depth = 0; depth < 3; depth++) {
    const data = record.parse(parsed);
    if (typeof data.response === "string") {
      parsed = JSON.parse(data.response) as unknown;
      continue;
    }
    if (data.response && typeof data.response === "object" && !Array.isArray(data.response)) {
      parsed = data.response;
      continue;
    }
    return data;
  }
  throw new Error("The integration returned an unsupported action response");
}

export class ComposioTaskPlatform extends RestTaskPlatform {
  constructor(
    proxy: TaskProxy,
    private readonly execute: ComposioTaskExecute,
  ) {
    super(async (request, context) => {
      const action = composioAnalyticsAction(request);
      return action
        ? { status: 200, data: await execute(action, request.connection, context) }
        : proxy(request, context);
    });
  }

  override async findReportSheet(
    connection: TaskConnection,
    operationKey: string,
    context: AdapterContext,
  ): Promise<string | null> {
    context.signal.throwIfAborted();
    const tag = marker(operationKey);
    const result = await this.execute(
      {
        tool: "GOOGLESHEETS_SEARCH_SPREADSHEETS",
        version: SHEETS_VERSION,
        args: {
          // Documented content search also searches names; simple tokens avoid
          // the name mode's prefix-only matching and advanced-query rewriting.
          query: tag,
          search_type: "content",
          max_results: 2,
          include_trashed: false,
        },
      },
      connection,
      context,
    );
    if (!Array.isArray(result.files) && !Array.isArray(result.spreadsheets))
      throw new Error("The integration returned an unsupported spreadsheet search response");
    const rows = z.array(record).parse(result.files ?? result.spreadsheets);
    // A returned continuation is also ambiguous, even if a provider gives fewer than two records.
    if (rows.length > 1 || result.nextPageToken || result.next_page_token)
      throw new TaskPlatformReconciliationError(
        "Multiple spreadsheets match this report. Select its destination explicitly.",
      );
    const found = rows[0];
    if (!found) return null;
    const name = z.string().parse(found.name ?? found.title);
    if (!name.endsWith(` · ${tag}`))
      throw new TaskPlatformReconciliationError(
        "The spreadsheet marker did not match. Select its destination explicitly.",
      );
    return sheetId.parse(found.id ?? found.spreadsheetId ?? found.spreadsheet_id);
  }

  override async createReportSheet(
    connection: TaskConnection,
    title: string,
    operationKey: string,
    context: AdapterContext,
  ): Promise<string> {
    const parsedTitle = z.string().min(1).max(170).safeParse(title);
    if (!parsedTitle.success) throw new TaskPlatformRejectedError("Invalid report title");
    let existing: string | null;
    try {
      existing = await this.findReportSheet(connection, operationKey, context);
    } catch {
      throw new TaskPlatformRejectedError(
        "Could not inspect the report destination before creation",
      );
    }
    if (existing) return existing;
    const name = `${parsedTitle.data} · ${marker(operationKey)}`;
    try {
      const result = await this.execute(
        {
          tool: "GOOGLESHEETS_CREATE_GOOGLE_SHEET1",
          version: SHEETS_VERSION,
          args: { title: name },
        },
        connection,
        context,
      );
      const nested = result.spreadsheet ? record.parse(result.spreadsheet) : result;
      return sheetId.parse(nested.spreadsheetId ?? nested.spreadsheet_id ?? nested.id);
    } catch (error) {
      if (error instanceof TaskPlatformRejectedError) throw error;
      if (!context.signal.aborted) {
        try {
          const found = await this.findReportSheet(connection, operationKey, context);
          if (found) return found;
        } catch {
          /* Do not replay a create whose response was lost. */
        }
      }
      throw new TaskPlatformReconciliationError();
    }
  }
}
