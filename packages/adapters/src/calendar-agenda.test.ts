import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { CalendarService } from "./calendar-service.js";

const actor: Actor = {
  userId: "user",
  spaceId: "space",
  email: "reader@example.test",
  isDeploymentOwner: false,
};
function fixture() {
  const row = {
    id: "account",
    userId: actor.userId,
    spaceId: actor.spaceId,
    connectorId: "composio",
    provider: "googlecalendar",
    providerRef: "provider-account",
    status: "connected",
    updatedAt: new Date(0),
  };
  const snapshot = {
    date: "2026-10-12",
    timezone: "America/Chicago",
    timeMin: "2026-10-12T12:00:00Z",
    timeMax: "2026-10-19T12:00:00Z",
    retrievedAt: "2026-10-12T12:00:00Z",
    sources: [],
    events: [
      {
        id: "meeting",
        calendarId: "primary",
        title: "Planning",
        start: "2026-10-13T16:00:00Z",
        end: "2026-10-13T17:00:00Z",
        allDay: false,
        url: null,
        location: null,
        description: null,
        recurringEventId: null,
        busy: true,
        response: null,
      },
    ],
  };
  const findFirst = vi.fn(async () => row as typeof row | null);
  const sources = vi.fn(async () => [
    { id: "primary", name: "Calendar", timezone: "America/Chicago" },
  ]);
  const events = vi.fn(async (_input: { timeMin: string; timeMax: string }) => snapshot);
  const service = new CalendarService({
    prisma: { connection: { findFirst } },
    managed: { reader: vi.fn(async () => ({ sources, events })) },
  } as unknown as ConstructorParameters<typeof CalendarService>[0]);
  vi.spyOn(service, "status").mockResolvedValue({
    configured: true,
    directConfigured: false,
    managedConnectorId: "composio",
    managedConnectionId: null,
    managedConnections: [{ id: row.id, displayName: "Calendar" }],
    canConfigure: false,
    redirectUri: "https://example.test/callback",
    connectionId: null,
    status: "disconnected",
  });
  return { service, findFirst, sources, events, snapshot };
}
describe("read-only connected calendar agenda", () => {
  it("reads an existing connected account without enabling or reconnecting a briefing", async () => {
    const { service, findFirst, events, snapshot } = fixture();
    expect(await service.agenda(actor, "America/Chicago", new AbortController().signal)).toEqual({
      snapshots: [snapshot],
      unavailable: false,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "account",
        userId: actor.userId,
        spaceId: actor.spaceId,
        status: "connected",
      }),
    });
    const window = events.mock.calls[0]?.[0] as unknown as { timeMin: string; timeMax: string };
    expect(Date.parse(window.timeMax) - Date.parse(window.timeMin)).toBe(7 * 86400_000);
  });
  it("withholds data if the source is revoked while the provider read is in flight", async () => {
    const { service, findFirst } = fixture();
    findFirst.mockResolvedValueOnce(await findFirst()).mockResolvedValueOnce(null);
    expect(await service.agenda(actor, "America/Chicago", new AbortController().signal)).toEqual({
      snapshots: [],
      unavailable: true,
    });
  });
  it("returns a retryable failure instead of claiming the calendar is empty", async () => {
    const { service, events } = fixture();
    events.mockRejectedValueOnce(new Error("provider unavailable"));
    expect(await service.agenda(actor, "America/Chicago", new AbortController().signal)).toEqual({
      snapshots: [],
      unavailable: true,
    });
  });
});
