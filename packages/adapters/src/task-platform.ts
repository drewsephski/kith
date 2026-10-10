import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type {
  AdapterContext,
  TaskConnection,
  TaskContextRecord,
  TaskMailContent,
  TaskMeeting,
  TaskMetric,
  TaskPlatform,
} from "@rakazo/adapter-kit";
import {
  EmailContentSchema,
  TaskAnalyticsPropertySchema,
  TaskMetricSchema,
} from "@rakazo/contracts";
import * as z from "zod";
import { emailHtmlText } from "./email-approval.js";

/** Internal authenticated transport. Credentials never cross this boundary. */
export type TaskProxyRequest = {
  connection: TaskConnection;
  url: string;
  method: "GET" | "POST" | "PUT";
  body?: Record<string, unknown>;
};
export type TaskProxy = (
  request: TaskProxyRequest,
  context: AdapterContext,
) => Promise<{ status: number; data: unknown; headers?: Record<string, string> }>;

/** Authoritative rejection before the requested external write could take effect. */
export class TaskPlatformRejectedError extends Error {
  readonly knownNoEffect = true;
  constructor(message: string) {
    super(message);
    this.name = "TaskPlatformRejectedError";
  }
}

function validatedInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new TaskPlatformRejectedError("Invalid task integration input");
  return parsed.data;
}

export class TaskPlatformReconciliationError extends Error {
  constructor(
    message = "The spreadsheet creation may have completed. Reconcile before trying again.",
  ) {
    super(message);
    this.name = "TaskPlatformReconciliationError";
  }
}

const object = z.record(z.string(), z.unknown());
const list = z.array(object);
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_MAIL = 200;
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const obj = (value: unknown): Record<string, unknown> => object.parse(value);
const items = (value: unknown): Record<string, unknown>[] =>
  value === undefined ? [] : list.parse(value);
const id = (value: unknown): string =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,200}$/)
    .parse(value);
const propertyId = (value: string): string =>
  z
    .string()
    .regex(/^\d{1,30}$/)
    .parse(value);
const sheetId = (value: string): string =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{10,200}$/)
    .parse(value);
const email = (value: string): string => z.email().max(320).parse(value).toLowerCase();
const operationMarker = (value: string): string =>
  createHash("sha256").update(z.string().min(1).max(1000).parse(value)).digest("hex");

/** Restrict authenticated proxies to the exact upstream endpoints used by starters. */
export function validateTaskProxyRequest(request: TaskProxyRequest): void {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash)
    throw new TaskPlatformRejectedError("Invalid task integration endpoint");
  const paths: Record<string, Partial<Record<TaskProxyRequest["method"], RegExp>>> = {
    "gmail.googleapis.com": {
      GET: /^\/gmail\/v1\/users\/me\/(profile|messages(?:\/[A-Za-z0-9_-]+(?:\/attachments\/[A-Za-z0-9_-]+)?)?|threads\/[A-Za-z0-9_-]+)$/,
    },
    "www.googleapis.com": {
      GET: /^(?:\/calendar\/v3\/users\/me\/calendarList|\/calendar\/v3\/calendars\/[^/]+\/events|\/drive\/v3\/files)$/,
      POST: /^\/drive\/v3\/files$/,
    },
    "api.hubapi.com": {
      GET: /^\/(?:crm\/v3\/objects\/(?:contacts|deals|notes)\/[A-Za-z0-9_-]+|crm\/v4\/objects\/contacts\/[A-Za-z0-9_-]+\/associations\/(?:deals|notes)|account-info\/v3\/details)$/,
      POST: /^\/crm\/v3\/objects\/contacts\/search$/,
    },
    "analyticsadmin.googleapis.com": { GET: /^\/v1beta\/(?:accountSummaries|properties\/\d+)$/ },
    "analyticsdata.googleapis.com": {
      GET: /^\/v1beta\/properties\/\d+\/metadata$/,
      POST: /^\/v1beta\/properties\/\d+:(?:checkCompatibility|runReport)$/,
    },
    "sheets.googleapis.com": {
      GET: /^\/v4\/spreadsheets\/[A-Za-z0-9_-]+(?:\/values\/[^/]+)?$/,
      PUT: /^\/v4\/spreadsheets\/[A-Za-z0-9_-]+\/values\/[^/]+$/,
      POST: /^\/v4\/spreadsheets\/[A-Za-z0-9_-]+:batchUpdate$/,
    },
  };
  if (!paths[url.hostname]?.[request.method]?.test(url.pathname))
    throw new TaskPlatformRejectedError("Unsupported task integration endpoint");
  if (
    !request.connection.providerRef ||
    request.connection.providerRef === request.connection.provider
  )
    throw new TaskPlatformRejectedError("Reconnect this account to select it explicitly");
}

function url(base: string, path: string, query: Record<string, string> = {}): string {
  const target = new URL(path, base);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return target.toString();
}

function safeUrl(value: unknown): string | null {
  try {
    const parsed = new URL(str(value));
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function htmlText(html: string): string {
  return emailHtmlText(html).replace(/\s+/g, " ").trim();
}

function mailText(payload: Record<string, unknown>, depth = 0, maxChars = 30_000): string {
  if (depth > 10) throw new Error("Email MIME nesting exceeds the supported limit");
  const mimeType = str(payload.mimeType).toLowerCase();
  if (str(payload.filename)) return "";
  if (mimeType === "text/plain" || mimeType === "text/html") {
    const data = str(obj(payload.body ?? {}).data);
    if (!data) return "";
    const contentType = items(payload.headers).find(
      (header) => str(header.name).toLowerCase() === "content-type",
    );
    const charset = str(contentType?.value).match(/charset=["']?([^;\s"']+)/i)?.[1] ?? "utf-8";
    let decoded: string;
    try {
      decoded = new TextDecoder(charset).decode(Buffer.from(data.slice(0, 100_000), "base64url"));
    } catch {
      throw new Error("Email text encoding is not supported");
    }
    return (mimeType === "text/html" ? htmlText(decoded) : decoded).slice(0, maxChars);
  }
  const parts = items(payload.parts);
  if (parts.length > 50) throw new Error("Email has too many MIME parts");
  const plain = parts.filter((part) => str(part.mimeType).toLowerCase() === "text/plain");
  // Multipart alternatives prefer plain text so the same content is not counted twice.
  const chosen = mimeType === "multipart/alternative" && plain.length ? plain : parts;
  return chosen
    .map((part) => mailText(part, depth + 1, maxChars))
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);
}

/** Shared Gmail MIME decoding for task reads and authoritative send previews. */
export function gmailEmailPreview(message: unknown, account: string) {
  const payload = obj(obj(message).payload);
  const headers = items(payload.headers);
  const header = (name: string) => {
    const matches = headers.filter((item) => str(item.name).toLowerCase() === name);
    if (matches.length > 1) throw new Error("Email has ambiguous duplicate headers");
    return str(matches[0]?.value);
  };
  if (!headers.some((item) => str(item.name).toLowerCase() === "subject"))
    throw new Error("The email subject is missing from the complete preview");
  const body = mailText(payload, 0, 50_001);
  const attachments: string[] = [];
  const collect = (part: Record<string, unknown>, depth = 0) => {
    if (str(obj(part.body ?? {}).data).length > 100_000)
      throw new Error("This email exceeds the complete preview size limit.");
    if (depth > 10) throw new Error("Email MIME nesting exceeds the supported limit");
    if (str(part.filename)) attachments.push(str(part.filename));
    if (
      !str(part.filename) &&
      (typeof obj(part.body ?? {}).attachmentId === "string" ||
        (Number(obj(part.body ?? {}).size) > 0 && !str(obj(part.body ?? {}).data)))
    )
      throw new Error("The email body must be fetched in full before approval");
    if (Array.isArray(part.parts) && part.parts.length > 50)
      throw new Error("Email has too many MIME parts");
    if (str(part.mimeType).toLowerCase() === "multipart/alternative") {
      const alternatives = items(part.parts)
        .map((child) =>
          mailText(child, depth + 1, 50_001)
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean);
      if (new Set(alternatives).size > 1)
        throw new Error(
          "The email's rich content differs from its plain-text preview. Prepare a plain-text draft for review.",
        );
    }
    for (const child of items(part.parts)) collect(child, depth + 1);
  };
  collect(payload);
  if (body.length > 50_000) throw new Error("This email is too long for a complete send preview.");
  return EmailContentSchema.parse({
    account,
    from: header("from") || undefined,
    to: [header("to")],
    cc: header("cc") ? [header("cc")] : [],
    bcc: header("bcc") ? [header("bcc")] : [],
    subject: header("subject"),
    body,
    attachments,
  });
}

/** Deterministic REST operations shared by managed integration adapters. */
export class RestTaskPlatform implements TaskPlatform {
  constructor(private readonly proxy: TaskProxy) {}

  private async request(
    connection: TaskConnection,
    target: string,
    context: AdapterContext,
    method: TaskProxyRequest["method"] = "GET",
    body?: Record<string, unknown>,
    readOnly = method === "GET",
  ): Promise<Record<string, unknown>> {
    const request = { connection, url: target, method, body };
    validateTaskProxyRequest(request);
    for (let attempt = 0; ; attempt++) {
      context.signal.throwIfAborted();
      const result = await this.proxy(request, context);
      context.signal.throwIfAborted();
      if (readOnly && attempt < 2 && [429, 502, 503, 504].includes(result.status)) {
        const retryAfter = result.headers?.["retry-after"] ?? result.headers?.["Retry-After"];
        const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
        const requested = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter
            ? Date.parse(retryAfter) - Date.now()
            : 0;
        await sleep(
          Math.min(5000, Math.max(300 * 2 ** attempt, Number.isFinite(requested) ? requested : 0)),
          undefined,
          { signal: context.signal },
        );
        continue;
      }
      if (result.status < 200 || result.status >= 300) {
        if (result.status === 401 || result.status === 403)
          throw new TaskPlatformRejectedError(
            "Reconnect this account with permissions for this task",
          );
        if ([400, 404].includes(result.status))
          throw new TaskPlatformRejectedError(
            `The integration rejected this task (HTTP ${result.status})`,
          );
        throw new Error(`The integration request failed (HTTP ${result.status})`);
      }
      if (Buffer.byteLength(JSON.stringify(result.data) ?? "") > MAX_BYTES)
        throw new Error("The integration response exceeded the size limit");
      return obj(result.data ?? {});
    }
  }

  async identity(connection: TaskConnection, context: AdapterContext): Promise<string> {
    const profile = await this.request(
      connection,
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      context,
    );
    return email(str(profile.emailAddress));
  }

  async searchMail(
    input: {
      connection: TaskConnection;
      query: string;
      maxMessages: number;
      includeThreadContext?: boolean;
    },
    context: AdapterContext,
  ): Promise<{ messages: TaskMailContent[]; complete: boolean }> {
    const query = z.string().trim().min(1).max(1000).parse(input.query);
    const limit = z.number().int().min(1).max(MAX_MAIL).parse(input.maxMessages);
    const account = await this.identity(input.connection, context);
    const messageIds = new Set<string>();
    let cursor = "";
    let complete = false;
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.request(
        input.connection,
        url("https://gmail.googleapis.com", "/gmail/v1/users/me/messages", {
          q: query,
          maxResults: String(Math.min(100, limit - messageIds.size)),
          ...(cursor ? { pageToken: cursor } : {}),
        }),
        context,
      );
      for (const message of items(response.messages)) {
        if (messageIds.size === limit) break;
        messageIds.add(id(message.id));
      }
      cursor = str(response.nextPageToken);
      if (!cursor) {
        complete = true;
        break;
      }
      if (messageIds.size >= limit || seen.has(cursor)) break;
      seen.add(cursor);
    }
    const messages: TaskMailContent[] = [];
    const threads = new Map<string, Promise<{ text: string; complete: boolean }>>();
    // Limit concurrency independently from user-selected mailbox fanout.
    const ids = [...messageIds];
    for (let offset = 0; offset < ids.length; offset += 5) {
      const batch = await Promise.all(
        ids.slice(offset, offset + 5).map(async (messageId) => {
          const message = await this.request(
            input.connection,
            url("https://gmail.googleapis.com", `/gmail/v1/users/me/messages/${messageId}`, {
              format: "full",
            }),
            context,
          );
          const payload = await this.hydrateMailPayload(
            input.connection,
            messageId,
            obj(message.payload ?? {}),
            context,
          );
          if (this.mailPayloadTruncated(payload)) complete = false;
          const headers = items(payload.headers);
          const header = (name: string) =>
            str(headers.find((item) => str(item.name).toLowerCase() === name)?.value);
          const timestamp = Number(message.internalDate);
          if (!Number.isFinite(timestamp)) throw new Error("Email has an invalid timestamp");
          const threadId = id(message.threadId);
          let text = mailText(payload);
          if (input.includeThreadContext) {
            let thread = threads.get(threadId);
            if (!thread) {
              thread = this.mailThread(input.connection, threadId, context);
              threads.set(threadId, thread);
            }
            const history = await thread;
            text =
              `Matched message:\n${text.slice(0, 4000)}\n\nRecent thread context:\n${history.text}`.slice(
                0,
                30_000,
              );
            if (!history.complete) complete = false;
          }
          const addresses = [
            ...header("to").matchAll(
              /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
            ),
          ].map((match) => match[0].toLowerCase());
          return {
            id: id(message.id),
            threadId,
            connectionId: input.connection.id,
            accountLabel: account,
            subject: header("subject").slice(0, 500),
            from: header("from").slice(0, 500),
            date: new Date(timestamp).toISOString(),
            snippet: str(message.snippet).slice(0, 1000),
            url: `https://mail.google.com/mail/u/${encodeURIComponent(account)}/#all/${threadId}`,
            text,
            to: [...new Set(addresses)],
          };
        }),
      );
      messages.push(...batch);
    }
    return { messages, complete };
  }

  private async mailThread(
    connection: TaskConnection,
    threadId: string,
    context: AdapterContext,
  ): Promise<{ text: string; complete: boolean }> {
    const response = await this.request(
      connection,
      url("https://gmail.googleapis.com", `/gmail/v1/users/me/threads/${threadId}`, {
        format: "full",
      }),
      context,
    );
    const messages = items(response.messages);
    let complete = messages.length <= 10;
    const texts = [];
    for (const message of messages.slice(-10)) {
      const payload = await this.hydrateMailPayload(
        connection,
        id(message.id),
        obj(message.payload ?? {}),
        context,
      );
      if (this.mailPayloadTruncated(payload)) complete = false;
      const headers = items(payload.headers);
      const header = (key: string) =>
        str(headers.find((value) => str(value.name).toLowerCase() === key)?.value);
      const timestamp = z.coerce.number().finite().parse(message.internalDate);
      texts.push(
        `[${id(message.id)}] ${new Date(timestamp).toISOString()} From: ${header("from").slice(0, 500)} To: ${header("to").slice(0, 500)}\n${mailText(payload)}`,
      );
    }
    const text = texts.join("\n\n");
    if (text.length > 25_000) complete = false;
    // Keep newest replies, which carry completion/reply evidence.
    return { text: text.slice(-25_000), complete };
  }

  private mailPayloadTruncated(payload: Record<string, unknown>): boolean {
    if (str(payload.filename)) return false;
    if (str(obj(payload.body ?? {}).data).length > 40_000) return true;
    return items(payload.parts).some((part) => this.mailPayloadTruncated(part));
  }

  private async hydrateMailPayload(
    connection: TaskConnection,
    messageId: string,
    payload: Record<string, unknown>,
    context: AdapterContext,
    depth = 0,
  ): Promise<Record<string, unknown>> {
    if (depth > 10) throw new Error("Email MIME nesting exceeds the supported limit");
    if (str(payload.filename)) return payload;
    const body = obj(payload.body ?? {});
    if (
      ["text/plain", "text/html"].includes(str(payload.mimeType).toLowerCase()) &&
      body.attachmentId &&
      !body.data
    ) {
      const attachmentId = z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,2000}$/)
        .parse(body.attachmentId);
      const attachment = await this.request(
        connection,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
        context,
      );
      return { ...payload, body: attachment };
    }
    const parts = items(payload.parts);
    if (parts.length > 50) throw new Error("Email has too many MIME parts");
    const hydrated = [];
    for (const part of parts)
      hydrated.push(await this.hydrateMailPayload(connection, messageId, part, context, depth + 1));
    return { ...payload, ...(parts.length ? { parts: hydrated } : {}) };
  }

  async upcomingMeetings(
    input: {
      connection: TaskConnection;
      timeMin: string;
      timeMax: string;
      maxMeetings?: number;
      maxCalendars?: number;
    },
    context: AdapterContext,
  ): Promise<{ meetings: TaskMeeting[]; complete: boolean }> {
    const start = z.iso.datetime({ offset: true }).parse(input.timeMin);
    const end = z.iso.datetime({ offset: true }).parse(input.timeMax);
    if (Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 8 * 86400_000)
      throw new Error("Choose a meeting window of at most eight days");
<<<<<<< Updated upstream
    const maxMeetings = z
      .number()
      .int()
      .min(1)
      .max(300)
      .parse(input.maxMeetings ?? 300);
    const maxCalendars = z
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(input.maxCalendars ?? 100);
=======
    const maxMeetings = z.number().int().min(1).max(300).parse(input.maxMeetings ?? 300);
    const maxCalendars = z.number().int().min(1).max(100).parse(input.maxCalendars ?? 100);
    const maxPages = z.number().int().min(1).max(MAX_PAGES).parse(input.maxPages ?? MAX_PAGES);
>>>>>>> Stashed changes
    const calendars: Record<string, unknown>[] = [];
    let cursor = "";
    let complete = false;
    for (let page = 0; page < maxPages; page++) {
      const response = await this.request(
        input.connection,
        url("https://www.googleapis.com", "/calendar/v3/users/me/calendarList", {
          maxResults: String(maxCalendars),
          ...(cursor ? { pageToken: cursor } : {}),
        }),
        context,
      );
      calendars.push(...items(response.items));
      cursor = str(response.nextPageToken);
      if (!cursor) {
        complete = true;
        break;
      }
      if (calendars.length >= maxCalendars) break;
    }
    const meetings: TaskMeeting[] = [];
    for (const calendar of calendars.slice(0, maxCalendars)) {
      cursor = "";
      let calendarComplete = false;
      for (let page = 0; page < maxPages; page++) {
        const response = await this.request(
          input.connection,
          url(
            "https://www.googleapis.com",
            `/calendar/v3/calendars/${encodeURIComponent(z.string().min(1).max(500).parse(calendar.id))}/events`,
            {
              timeMin: start,
              timeMax: end,
              singleEvents: "true",
              orderBy: "startTime",
              maxResults: String(Math.min(100, maxMeetings)),
              ...(cursor ? { pageToken: cursor } : {}),
            },
          ),
          context,
        );
        for (const event of items(response.items)) {
          if (
            event.status === "cancelled" ||
            event.eventType === "workingLocation" ||
            event.eventType === "outOfOffice"
          )
            continue;
          if (
            items(event.attendees).some(
              (attendee) => attendee.self === true && attendee.responseStatus === "declined",
            )
          )
            continue;
          const eventStart = obj(event.start ?? {});
          const eventEnd = obj(event.end ?? {});
          // Meeting briefs concern timed meetings; all-day reminders are not meetings.
          if (!eventStart.dateTime || !eventEnd.dateTime) continue;
          meetings.push({
            id: `${str(calendar.id)}:${id(event.id)}`,
            connectionId: input.connection.id,
            title: str(event.summary).slice(0, 500),
            start: z.iso.datetime({ offset: true }).parse(eventStart.dateTime),
            end: z.iso.datetime({ offset: true }).parse(eventEnd.dateTime),
            url: safeUrl(event.htmlLink),
            description: htmlText(str(event.description).slice(0, 30_000)),
            attendees: [
              ...new Set(
                items(event.attendees)
                  .filter((attendee) => attendee.responseStatus !== "declined")
                  .map((attendee) => str(attendee.email).toLowerCase())
                  .filter((value) => z.email().safeParse(value).success),
              ),
            ],
          });
        }
        cursor = str(response.nextPageToken);
        if (!cursor) {
          calendarComplete = true;
          break;
        }
        if (meetings.length >= maxMeetings) break;
      }
      complete &&= calendarComplete;
      if (meetings.length >= maxMeetings) {
        complete = false;
        break;
      }
    }
    return {
      meetings: meetings
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
        .slice(0, maxMeetings),
      complete,
    };
  }

  async hubspotContext(
    input: { connection: TaskConnection; emails: string[] },
    context: AdapterContext,
  ): Promise<{ records: TaskContextRecord[]; warnings: string[] }> {
    const emails = [...new Set(z.array(z.string()).max(30).parse(input.emails).map(email))];
    const records = new Map<string, TaskContextRecord>();
    const warnings: string[] = [];
    const account = await this.request(
      input.connection,
      "https://api.hubapi.com/account-info/v3/details",
      context,
    );
    const portalId = z
      .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
      .parse(account.portalId);
    for (const address of emails) {
      const search = await this.request(
        input.connection,
        "https://api.hubapi.com/crm/v3/objects/contacts/search",
        context,
        "POST",
        {
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: address }] }],
          properties: ["email", "firstname", "lastname", "jobtitle", "company", "hs_object_id"],
          limit: 10,
        },
        true,
      );
      if (search.paging) warnings.push("HubSpot contact matches exceeded the retrieval limit.");
      for (const contact of items(search.results)) {
        const properties = obj(contact.properties ?? {});
        if (str(properties.email).toLowerCase() !== address) continue;
        const contactId = id(contact.id);
        const title =
          [str(properties.firstname), str(properties.lastname)].filter(Boolean).join(" ") ||
          address;
        records.set(`contact:${contactId}`, {
          id: `contact:${contactId}`,
          title,
          text: JSON.stringify(properties).slice(0, 6000),
          url: `https://app.hubspot.com/contacts/${portalId}/record/0-1/${contactId}`,
        });
        for (const kind of ["deals", "notes"] as const) {
          let cursor = "";
          let finished = false;
          for (let page = 0; page < 3; page++) {
            const associations = await this.request(
              input.connection,
              url(
                "https://api.hubapi.com",
                `/crm/v4/objects/contacts/${contactId}/associations/${kind}`,
                { limit: "20", ...(cursor ? { after: cursor } : {}) },
              ),
              context,
            );
            for (const association of items(associations.results)) {
              const recordId = id(String(association.toObjectId ?? ""));
              if (records.has(`${kind}:${recordId}`)) continue;
              const fields =
                kind === "deals"
                  ? "dealname,dealstage,amount,closedate,description"
                  : "hs_note_body,hs_timestamp";
              const record = await this.request(
                input.connection,
                url("https://api.hubapi.com", `/crm/v3/objects/${kind}/${recordId}`, {
                  properties: fields,
                }),
                context,
              );
              const values = obj(record.properties ?? {});
              records.set(`${kind}:${recordId}`, {
                id: `${kind}:${recordId}`,
                title: kind === "deals" ? str(values.dealname) : `Note for ${title}`,
                text:
                  kind === "notes"
                    ? `${str(values.hs_timestamp)}\n${htmlText(str(values.hs_note_body))}`.slice(
                        0,
                        6000,
                      )
                    : JSON.stringify(values).slice(0, 6000),
                url: `https://app.hubspot.com/contacts/${portalId}/record/${kind === "deals" ? "0-3" : "0-46"}/${recordId}`,
              });
              if (records.size >= 200) break;
            }
            const paging = associations.paging === undefined ? {} : obj(associations.paging);
            cursor = paging.next === undefined ? "" : String(obj(paging.next).after ?? "");
            if (!cursor) {
              finished = true;
              break;
            }
            if (records.size >= 200) break;
          }
          if (!finished) warnings.push("HubSpot associations exceeded the retrieval limit.");
          if (records.size >= 200) break;
        }
        if (records.size >= 200) break;
      }
      if (records.size >= 200) {
        warnings.push("HubSpot context exceeded the retrieval limit.");
        break;
      }
    }
    return { records: [...records.values()], warnings: [...new Set(warnings)] };
  }

  async analyticsProperties(connection: TaskConnection, context: AdapterContext) {
    const properties = new Map<string, string>();
    let cursor = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.request(
        connection,
        url("https://analyticsadmin.googleapis.com", "/v1beta/accountSummaries", {
          pageSize: "200",
          ...(cursor ? { pageToken: cursor } : {}),
        }),
        context,
      );
      for (const account of items(response.accountSummaries))
        for (const property of items(account.propertySummaries)) {
          const match = str(property.property).match(/^properties\/(\d{1,30})$/);
          if (match?.[1]) properties.set(match[1], str(property.displayName));
          if (properties.size > 100)
            throw new Error(
              "Analytics has more than 100 properties; narrow account access for this starter",
            );
        }
      cursor = str(response.nextPageToken);
      if (!cursor) break;
      if (page === MAX_PAGES - 1)
        throw new Error("Analytics property retrieval exceeded its page limit");
    }
    const result = [];
    for (const [key, name] of properties) {
      const details = await this.request(
        connection,
        `https://analyticsadmin.googleapis.com/v1beta/properties/${key}`,
        context,
      );
      result.push(TaskAnalyticsPropertySchema.parse({ id: key, name, timezone: details.timeZone }));
    }
    return result;
  }

  async analyticsReport(
    input: {
      connection: TaskConnection;
      propertyId: string;
      metrics: TaskMetric[];
      startDate: string;
      endDate: string;
    },
    context: AdapterContext,
  ) {
    const property = propertyId(input.propertyId);
    const metrics = z.array(TaskMetricSchema).min(1).max(5).parse(input.metrics);
    if (new Set(metrics).size !== metrics.length) throw new Error("Choose each metric once");
    const startDate = z.iso.date().parse(input.startDate);
    const endDate = z.iso.date().parse(input.endDate);
    if (startDate > endDate) throw new Error("The report end date precedes its start date");
    const details = await this.request(
      input.connection,
      `https://analyticsadmin.googleapis.com/v1beta/properties/${property}`,
      context,
    );
    const propertyInfo = TaskAnalyticsPropertySchema.parse({
      id: property,
      name: details.displayName,
      timezone: details.timeZone,
    });
    const metadata = await this.request(
      input.connection,
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}/metadata`,
      context,
    );
    const available = new Map(
      items(metadata.metrics).map((metric) => [str(metric.apiName), str(metric.uiName)]),
    );
    for (const metric of metrics)
      if (!available.has(metric)) throw new Error(`Analytics metric is unavailable: ${metric}`);
    const compatibility = await this.request(
      input.connection,
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}:checkCompatibility`,
      context,
      "POST",
      { metrics: metrics.map((name) => ({ name })) },
      true,
    );
    const compatible = new Set(
      items(compatibility.metricCompatibilities)
        .filter((metric) => metric.compatibility === "COMPATIBLE")
        .map((metric) => str(obj(metric.metricMetadata).apiName)),
    );
    for (const metric of metrics)
      if (!compatible.has(metric))
        throw new Error(`Analytics metrics cannot be reported together: ${metric}`);
    const response = await this.request(
      input.connection,
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
      context,
      "POST",
      {
        metrics: metrics.map((name) => ({ name })),
        dateRanges: [{ startDate, endDate }],
        limit: "1",
        returnPropertyQuota: true,
        keepEmptyRows: true,
      },
      true,
    );
    const headers = items(response.metricHeaders).map((header) => str(header.name));
    if (headers.length !== metrics.length || metrics.some((metric) => !headers.includes(metric)))
      throw new Error("Analytics returned unexpected metric columns");
    const info = obj(response.metadata ?? {});
    if (info.emptyReason)
      throw new Error("Google Analytics has no reportable data for this period");
    const restricted = items(info.activeMetricRestrictions).map((restriction) =>
      str(restriction.metricName),
    );
    if (metrics.some((metric) => restricted.includes(metric)))
      throw new Error("This account cannot access the selected Analytics metrics");
    const rows = items(response.rows);
    if (!rows.length)
      throw new Error("Google Analytics returned no data; a zero total could not be verified");
    if (rows.length > 1) throw new Error("Analytics returned unexpected report rows");
    const values = items(rows[0]?.metricValues).map((value) =>
      z
        .string()
        .regex(/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/)
        .parse(value.value),
    );
    if (values.length !== metrics.length)
      throw new Error("Analytics returned incomplete metric values");
    const timezone = str(info.timeZone) || propertyInfo.timezone;
    if (timezone !== propertyInfo.timezone)
      throw new Error("Analytics property timezone changed; refresh the report");
    const warnings: string[] = [];
    if (info.subjectToThresholding)
      warnings.push("Google Analytics applied privacy thresholds to this report.");
    if (info.dataLossFromOtherRow)
      warnings.push("Google Analytics grouped some data into the other row.");
    if (Array.isArray(info.samplingMetadatas) && info.samplingMetadatas.length)
      warnings.push("Google Analytics sampled this report.");
    return {
      report: {
        propertyId: property,
        timezone: propertyInfo.timezone,
        startDate,
        endDate,
        currency: str(info.currencyCode) || str(details.currencyCode) || null,
        metrics: metrics.map((name) => ({
          name,
          label: available.get(name) || name,
          value: z
            .number()
            .finite()
            .parse(Number(values[headers.indexOf(name)])),
        })),
      },
      warnings,
    };
  }

  async sheetInfo(connection: TaskConnection, spreadsheetId: string, context: AdapterContext) {
    const key = sheetId(spreadsheetId);
    const response = await this.request(
      connection,
      url("https://sheets.googleapis.com", `/v4/spreadsheets/${key}`, {
        fields: "spreadsheetId,properties(title),spreadsheetUrl",
      }),
      context,
    );
    if (response.spreadsheetId !== key) throw new Error("The spreadsheet identity did not match");
    return {
      title: z.string().parse(obj(response.properties).title),
      url: `https://docs.google.com/spreadsheets/d/${key}/edit`,
    };
  }

  async findReportSheet(
    connection: TaskConnection,
    operationKey: string,
    context: AdapterContext,
  ): Promise<string | null> {
    const marker = operationMarker(operationKey);
    const response = await this.request(
      connection,
      url("https://www.googleapis.com", "/drive/v3/files", {
        q: `trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and appProperties has { key='rakazoReport' and value='${marker}' }`,
        fields: "files(id),nextPageToken",
        pageSize: "2",
      }),
      context,
    );
    const files = items(response.files);
    if (files.length > 1 || response.nextPageToken)
      throw new TaskPlatformReconciliationError(
        "Multiple spreadsheets match this report. Select its destination explicitly.",
      );
    return files[0] ? sheetId(str(files[0].id)) : null;
  }

  async createReportSheet(
    connection: TaskConnection,
    title: string,
    operationKey: string,
    context: AdapterContext,
  ): Promise<string> {
    const name = validatedInput(z.string().min(1).max(200), title);
    let existing: string | null;
    try {
      existing = await this.findReportSheet(connection, operationKey, context);
    } catch {
      throw new TaskPlatformRejectedError(
        "Could not inspect the report destination before creation",
      );
    }
    if (existing) return existing;
    try {
      const response = await this.request(
        connection,
        url("https://www.googleapis.com", "/drive/v3/files", { fields: "id" }),
        context,
        "POST",
        {
          name,
          mimeType: "application/vnd.google-apps.spreadsheet",
          appProperties: { rakazoReport: operationMarker(operationKey) },
        },
      );
      return sheetId(str(response.id));
    } catch (error) {
      if (error instanceof TaskPlatformRejectedError) throw error;
      if (!context.signal.aborted) {
        try {
          const found = await this.findReportSheet(connection, operationKey, context);
          if (found) return found;
        } catch {
          /* Keep uncertain creation classified as requiring reconciliation. */
        }
      }
      throw new TaskPlatformReconciliationError(
        error instanceof Error &&
          error.message === "Reconnect this account with permissions for this task"
          ? error.message
          : undefined,
      );
    }
  }

  private tabName(range: string): string | null {
    const parts = range.split("!");
    return parts.length === 2 ? (parts[0] ?? "").replace(/^'|'$/g, "").replace(/''/g, "'") : null;
  }

  private async reportTab(
    connection: TaskConnection,
    spreadsheetId: string,
    range: string,
    context: AdapterContext,
  ): Promise<boolean> {
    const title = this.tabName(range);
    if (!title) return true;
    const response = await this.request(
      connection,
      url("https://sheets.googleapis.com", `/v4/spreadsheets/${spreadsheetId}`, {
        fields: "sheets(properties(title))",
      }),
      context,
    );
    return items(response.sheets).some((sheet) => obj(sheet.properties).title === title);
  }

  async readSheet(
    connection: TaskConnection,
    spreadsheetId: string,
    range: string,
    context: AdapterContext,
  ): Promise<(string | number | null)[][]> {
    const key = sheetId(spreadsheetId);
    const address = z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_ '!:]+$/)
      .parse(range);
    if (!(await this.reportTab(connection, key, address, context))) return [];
    const response = await this.request(
      connection,
      url(
        "https://sheets.googleapis.com",
        `/v4/spreadsheets/${key}/values/${encodeURIComponent(address)}`,
        { valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" },
      ),
      context,
    );
    return z
      .array(z.array(z.union([z.string().max(20_000), z.number().finite(), z.null()])).max(30))
      .max(100)
      .parse(response.values ?? []);
  }

  async writeSheet(
    connection: TaskConnection,
    spreadsheetId: string,
    range: string,
    values: (string | number | null)[][],
    context: AdapterContext,
  ): Promise<void> {
    const key = validatedInput(z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), spreadsheetId);
    const address = validatedInput(
      z
        .string()
        .min(1)
        .max(200)
        .regex(/^[A-Za-z0-9_ '!:]+$/),
      range,
    );
    const cells = validatedInput(
      z
        .array(
          z
            .array(z.union([z.string().max(20_000), z.number().finite(), z.null()]))
            .min(1)
            .max(30),
        )
        .min(1)
        .max(100),
      values,
    );
    if (cells.some((row) => row.length !== cells[0]?.length))
      throw new TaskPlatformRejectedError("Report rows must have equal widths");
    let hasTab: boolean;
    try {
      hasTab = await this.reportTab(connection, key, address, context);
    } catch {
      throw new TaskPlatformRejectedError("Could not inspect the report tab before writing");
    }
    if (!hasTab) {
      const title = this.tabName(address);
      try {
        await this.request(
          connection,
          `https://sheets.googleapis.com/v4/spreadsheets/${key}:batchUpdate`,
          context,
          "POST",
          { requests: [{ addSheet: { properties: { title } } }] },
        );
      } catch (error) {
        if (context.signal.aborted || !(await this.reportTab(connection, key, address, context)))
          throw error;
      }
    }
    await this.request(
      connection,
      url(
        "https://sheets.googleapis.com",
        `/v4/spreadsheets/${key}/values/${encodeURIComponent(address)}`,
        { valueInputOption: "RAW" },
      ),
      context,
      "PUT",
      {
        range: address,
        majorDimension: "ROWS",
        values: cells.map((row) => row.map((value) => value ?? "")),
      },
    );
    const observed = await this.readSheet(connection, key, address, context);
    if (cells.some((row, r) => row.some((value, c) => (observed[r]?.[c] ?? "") !== (value ?? ""))))
      throw new Error(
        "The spreadsheet write could not be verified; reconcile the destination before trying again",
      );
  }
}
