import type {
  AdapterContext,
  CalendarProvider,
  CalendarReader,
  CalendarTokens,
  CalendarWindow,
} from "@rakazo/adapter-kit";
import { CalendarAccessError } from "@rakazo/adapter-kit";
import type { CalendarEvent, CalendarOAuthConfig, CalendarSource } from "@rakazo/contracts";
import { readBoundedResponseBytes } from "@rakazo/core";
import { z } from "zod";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];
const Endpoint = z.object({
  date: z.string().date().optional(),
  dateTime: z.string().datetime({ offset: true }).optional(),
});
const Event = z.object({
  id: z.string(),
  iCalUID: z.string().optional(),
  summary: z.string().optional(),
  status: z.string().optional(),
  start: Endpoint.optional(),
  end: Endpoint.optional(),
  htmlLink: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  recurringEventId: z.string().optional(),
  transparency: z.string().optional(),
  attendees: z
    .array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() }))
    .optional(),
});
const EventPage = z.object({
  items: z.array(Event).default([]),
  nextPageToken: z.string().optional(),
});
const SourcePage = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        timeZone: z.string().optional(),
        accessRole: z.string().optional(),
        deleted: z.boolean().optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
});
const Tokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  authorizationUrl(
    config: CalendarOAuthConfig,
    input: { redirectUri: string; state: string; challenge: string },
  ) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: input.state,
      code_challenge: input.challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.href;
  }
  private async json(url: string, init: RequestInit, context: AdapterContext): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, signal: context.signal });
    } catch {
      throw new Error("Calendar request failed; try again");
    }
    if ([401, 403].includes(response.status)) throw new CalendarAccessError();
    if (!response.ok) throw new Error("Calendar request failed; try again");
    return JSON.parse(
      new TextDecoder().decode(
        await readBoundedResponseBytes(response, {
          maxBytes: 4_000_000,
          tooLargeMessage: "Calendar response too large",
          read: (operation) => operation(),
        }),
      ),
    );
  }
  private async token(
    config: CalendarOAuthConfig,
    params: Record<string, string>,
    context: AdapterContext,
    oldRefresh?: string,
  ): Promise<CalendarTokens> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    });
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      body,
      signal: context.signal,
    });
    if (response.status === 400 || response.status === 401) throw new CalendarAccessError();
    if (!response.ok) throw new Error("Calendar authorization failed; try again");
    const result = Tokens.parse(
      JSON.parse(
        new TextDecoder().decode(
          await readBoundedResponseBytes(response, {
            maxBytes: 64_000,
            tooLargeMessage: "Calendar authorization response too large",
            read: (operation) => operation(),
          }),
        ),
      ),
    );
    // Granular consent may grant only one scope. Never accept a partial/broader grant.
    if (
      result.scope &&
      (GOOGLE_CALENDAR_SCOPES.some((scope) => !result.scope!.split(" ").includes(scope)) ||
        result.scope.split(" ").some((scope) => !GOOGLE_CALENDAR_SCOPES.includes(scope)))
    )
      throw new CalendarAccessError();
    const refreshToken = result.refresh_token ?? oldRefresh;
    if (!refreshToken) throw new CalendarAccessError();
    return {
      accessToken: result.access_token,
      refreshToken,
      expiresAt: Date.now() + result.expires_in * 1000,
    };
  }
  exchange(
    config: CalendarOAuthConfig,
    input: { code: string; verifier: string; redirectUri: string },
    context: AdapterContext,
  ) {
    return this.token(
      config,
      {
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: input.verifier,
        redirect_uri: input.redirectUri,
      },
      context,
    );
  }
  refresh(config: CalendarOAuthConfig, tokens: CalendarTokens, context: AdapterContext) {
    return this.token(
      config,
      { grant_type: "refresh_token", refresh_token: tokens.refreshToken },
      context,
      tokens.refreshToken,
    );
  }
  async revoke(tokens: CalendarTokens, context: AdapterContext) {
    const response = await this.fetcher("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      body: new URLSearchParams({ token: tokens.refreshToken }),
      signal: context.signal,
    });
    if (!response.ok && response.status !== 400)
      throw new Error("Could not revoke Calendar access; try again");
  }
  reader(tokens: CalendarTokens): CalendarReader {
    return new GoogleCalendarReader((url, context) =>
      this.json(url.href, { headers: { Authorization: `Bearer ${tokens.accessToken}` } }, context),
    );
  }
  sources(tokens: CalendarTokens, context: AdapterContext) {
    return this.reader(tokens).sources(context);
  }
  events(
    tokens: CalendarTokens,
    input: CalendarWindow & { sources: CalendarSource[] },
    context: AdapterContext,
  ) {
    return this.reader(tokens).events(input, context);
  }
}

/** Both direct and managed access use the same complete, bounded Google reads. */
export class GoogleCalendarReader implements CalendarReader {
  constructor(private readonly request: (url: URL, context: AdapterContext) => Promise<unknown>) {}
  private async pages<T>(
    path: string,
    context: AdapterContext,
    schema: z.ZodType<{ items: T[]; nextPageToken?: string }>,
    params: Record<string, string> = {},
  ): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
      url.search = new URLSearchParams({
        ...params,
        ...(pageToken ? { pageToken } : {}),
      }).toString();
      const result = schema.parse(await this.request(url, context));
      items.push(...result.items);
      if (!result.nextPageToken) return items;
      pageToken = result.nextPageToken;
    }
    throw new Error("Calendar result limit exceeded; no complete briefing was saved");
  }
  async sources(context: AdapterContext): Promise<CalendarSource[]> {
    const rows = await this.pages("users/me/calendarList", context, SourcePage, {
      maxResults: "250",
    });
    const sources = rows
      .filter((row) => !row.deleted && row.accessRole !== "freeBusyReader")
      .map((row) => ({
        id: row.id,
        name: (row.summary ?? "Calendar").slice(0, 200),
        timezone: row.timeZone ?? null,
      }));
    if (sources.length > 50) throw new Error("Too many calendars for a complete briefing");
    return sources;
  }
  async events(input: CalendarWindow & { sources: CalendarSource[] }, context: AdapterContext) {
    const events: CalendarEvent[] = [];
    const seen = new Set<string>();
    for (const source of input.sources) {
      const rows = await this.pages(
        `calendars/${encodeURIComponent(source.id)}/events`,
        context,
        EventPage,
        {
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          timeZone: input.timezone,
          singleEvents: "true",
          showDeleted: "false",
          orderBy: "startTime",
          maxResults: "250",
        },
      );
      for (const row of rows) {
        if (row.status === "cancelled") continue;
        const start = row.start?.dateTime ?? row.start?.date;
        const end = row.end?.dateTime ?? row.end?.date;
        const allDay = Boolean(row.start?.date);
        if (
          !start ||
          !end ||
          Boolean(row.start?.date) !== Boolean(row.end?.date) ||
          Boolean(row.start?.dateTime) !== Boolean(row.end?.dateTime) ||
          (row.start?.date && row.start?.dateTime) ||
          (allDay ? start >= end : Date.parse(start) >= Date.parse(end))
        )
          throw new Error("Calendar returned an invalid event");
        const key = `${row.iCalUID ?? `${source.id}:${row.id}`}:${start}:${end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const url =
          row.htmlLink && /^https:\/\/calendar\.google\.com\//.test(row.htmlLink)
            ? row.htmlLink
            : null;
        events.push({
          id: `${source.id}:${row.id}`,
          calendarId: source.id,
          title: (row.summary ?? "Untitled event").slice(0, 300),
          start,
          end,
          allDay,
          url,
          location: row.location?.slice(0, 300) ?? null,
          description: row.description?.slice(0, 3000) ?? null,
          recurringEventId: row.recurringEventId ?? null,
          busy: row.transparency !== "transparent",
          response: row.attendees?.find((a) => a.self)?.responseStatus ?? null,
        });
        if (events.length > 500) throw new Error("Too many events for a complete briefing");
      }
    }
    events.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.allDay ? a.start.localeCompare(b.start) : Date.parse(a.start) - Date.parse(b.start);
    });
    return { ...input, retrievedAt: new Date().toISOString(), events };
  }
}
