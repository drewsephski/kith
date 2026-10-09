import type { AdapterContext, CalendarTokens } from "@rakazo/adapter-kit";
import { CalendarAccessError } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { GOOGLE_CALENDAR_SCOPES, GoogleCalendarProvider } from "./google-calendar.js";

const config = { clientId: "fake-client", clientSecret: "fake-secret" };
const tokens: CalendarTokens = {
  accessToken: "fake-access",
  refreshToken: "fake-refresh",
  expiresAt: 1,
};
const context: AdapterContext = {
  spaceId: "space",
  userId: "user",
  operationId: "test",
  traceId: "test",
  signal: new AbortController().signal,
};
const source = { id: "primary", name: "Work", timezone: "America/Chicago" };
const window = {
  date: "2026-10-10",
  timezone: "America/Chicago",
  timeMin: "2026-10-10T05:00:00Z",
  timeMax: "2026-10-11T05:00:00Z",
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const rawEvent = {
  id: "a",
  iCalUID: "shared",
  summary: "Planning",
  start: { dateTime: "2026-10-10T09:00:00-05:00" },
  end: { dateTime: "2026-10-10T10:00:00-05:00" },
};

describe("Google Calendar read-only adapter", () => {
  it("orders timed events by actual instant across offsets", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        items: [
          {
            ...rawEvent,
            id: "later",
            iCalUID: "later",
            start: { dateTime: "2026-10-10T09:00:00-05:00" },
            end: { dateTime: "2026-10-10T10:00:00-05:00" },
          },
          {
            ...rawEvent,
            id: "earlier",
            iCalUID: "earlier",
            start: { dateTime: "2026-10-10T12:00:00Z" },
            end: { dateTime: "2026-10-10T13:00:00Z" },
          },
        ],
      }),
    );
    const result = await new GoogleCalendarProvider(fetcher).events(
      tokens,
      { ...window, sources: [source] },
      context,
    );
    expect(result.events.map((event) => event.id)).toEqual(["primary:earlier", "primary:later"]);
  });
  it.each([
    { start: { date: "2026-02-30" }, end: { date: "2026-03-01" } },
    { start: rawEvent.start, end: { date: "2026-10-11" } },
    {
      start: { ...rawEvent.start, date: "2026-10-10" },
      end: { ...rawEvent.end, date: "2026-10-11" },
    },
  ])("rejects invalid or mixed endpoint kinds", async (times) => {
    const provider = new GoogleCalendarProvider(
      vi.fn<typeof fetch>().mockResolvedValue(json({ items: [{ ...rawEvent, ...times }] })),
    );
    await expect(
      provider.events(tokens, { ...window, sources: [source] }, context),
    ).rejects.toThrow();
  });
  it("requests exact read scopes, offline access and PKCE", () => {
    const url = new URL(
      new GoogleCalendarProvider().authorizationUrl(config, {
        redirectUri: "https://app.example.test/api/calendar/oauth/callback",
        state: "state",
        challenge: "challenge",
      }),
    );
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPES.join(" "));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("include_granted_scopes")).toBeNull();
  });
  it("exchanges a code with the verifier and rejects partial or broader grants", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        access_token: "fake-access",
        refresh_token: "fake-refresh",
        expires_in: 3600,
        scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      }),
    );
    const provider = new GoogleCalendarProvider(fetcher);
    await expect(
      provider.exchange(
        config,
        {
          code: "fake-code",
          verifier: "verifier",
          redirectUri: "https://app.example.test/callback",
        },
        context,
      ),
    ).resolves.toMatchObject({ refreshToken: "fake-refresh" });
    expect(String(fetcher.mock.calls[0]![1]!.body)).toContain("code_verifier=verifier");
    for (const scope of [
      GOOGLE_CALENDAR_SCOPES[0],
      `${GOOGLE_CALENDAR_SCOPES.join(" ")} https://www.googleapis.com/auth/calendar`,
    ]) {
      fetcher.mockResolvedValueOnce(
        json({
          access_token: "fake-access",
          refresh_token: "fake-refresh",
          expires_in: 3600,
          scope,
        }),
      );
      await expect(
        provider.exchange(
          config,
          { code: "fake-code", verifier: "v", redirectUri: "https://app.example.test/callback" },
          context,
        ),
      ).rejects.toBeInstanceOf(CalendarAccessError);
    }
  });
  it("preserves a refresh token omitted by refresh and sanitizes provider failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ access_token: "fresh-access", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("private provider data fake-secret", { status: 500 }));
    const provider = new GoogleCalendarProvider(fetcher);
    expect((await provider.refresh(config, tokens, context)).refreshToken).toBe(
      tokens.refreshToken,
    );
    await expect(provider.sources(tokens, context)).rejects.toThrow(
      "Calendar request failed; try again",
    );
  });
  it("paginates all readable calendars and normalizes recurring/all-day events without duplicates", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [{ id: "primary", summary: "Work", timeZone: "America/Chicago" }],
          nextPageToken: "page2",
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [
            { id: "other", summary: "Personal" },
            { id: "busy-only", accessRole: "freeBusyReader" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [rawEvent, { id: "deleted", status: "cancelled" }],
          nextPageToken: "events2",
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [
            {
              id: "day",
              start: { date: "2026-10-10" },
              end: { date: "2026-10-11" },
              transparency: "transparent",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ items: [{ ...rawEvent, id: "copy" }] }));
    const provider = new GoogleCalendarProvider(fetcher);
    const sources = await provider.sources(tokens, context);
    const result = await provider.events(tokens, { ...window, sources }, context);
    expect(sources).toHaveLength(2);
    expect(result.events).toHaveLength(2);
    expect(result.events.find((e) => e.id === "primary:day")).toMatchObject({
      allDay: true,
      busy: false,
    });
    const eventUrl = new URL(String(fetcher.mock.calls[2]![0]));
    expect(eventUrl.searchParams.get("singleEvents")).toBe("true");
    expect(eventUrl.searchParams.get("timeZone")).toBe(window.timezone);
    expect(
      fetcher.mock.calls.every(
        ([url, init]) =>
          String(url).startsWith("https://www.googleapis.com/") && init?.method !== "POST",
      ),
    ).toBe(true);
  });
  it("never treats a failed calendar or truncated pagination as an empty schedule", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [] }))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    await expect(
      new GoogleCalendarProvider(fetcher).events(
        tokens,
        { ...window, sources: [source, { ...source, id: "other" }] },
        context,
      ),
    ).rejects.toBeInstanceOf(CalendarAccessError);
    fetcher.mockImplementation(async () => json({ items: [], nextPageToken: "again" }));
    await expect(new GoogleCalendarProvider(fetcher).sources(tokens, context)).rejects.toThrow(
      "result limit exceeded",
    );
  });
  it("rejects malformed event times and strips unsafe event links", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [{ ...rawEvent, htmlLink: "https://evil.test/" }] }))
      .mockResolvedValueOnce(json({ items: [{ ...rawEvent, end: rawEvent.start }] }));
    const provider = new GoogleCalendarProvider(fetcher);
    expect(
      (await provider.events(tokens, { ...window, sources: [source] }, context)).events[0]!.url,
    ).toBeNull();
    await expect(
      provider.events(tokens, { ...window, sources: [source] }, context),
    ).rejects.toThrow("invalid event");
  });
});
