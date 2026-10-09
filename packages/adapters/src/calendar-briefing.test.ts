import type { AdapterContext, AgentRuntime } from "@rakazo/adapter-kit";
import type { CalendarSnapshot } from "@rakazo/contracts";
import { AI_DISCLOSURE_VERSION } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { aiRecipient } from "./ai-consent.js";
import { calendarSuggestions } from "./calendar-briefing.js";

const snapshot: CalendarSnapshot = {
  date: "2026-10-10",
  timezone: "UTC",
  timeMin: "2026-10-10T00:00:00Z",
  timeMax: "2026-10-11T00:00:00Z",
  retrievedAt: "2026-10-09T12:00:00Z",
  sources: [],
  events: [
    {
      id: "e1",
      calendarId: "primary",
      title: "Planning",
      start: "2026-10-10T09:00:00Z",
      end: "2026-10-10T10:00:00Z",
      allDay: false,
      url: null,
      location: null,
      description: "Discuss roadmap",
      recurringEventId: null,
      busy: true,
      response: "accepted",
    },
  ],
};
const scope = { id: "run", userId: "user", spaceId: "space", botId: "bot", threadId: "thread" };
const context: AdapterContext = {
  ...scope,
  operationId: "run",
  traceId: "run",
  signal: new AbortController().signal,
};
function fixture(text: string, allowed = true) {
  const run = vi.fn<AgentRuntime["run"]>(async function* () {
    yield { type: "text" as const, text };
    yield { type: "done" as const };
  });
  const runtime = { run } as unknown as AgentRuntime;
  const consent = vi.fn(async () => (allowed ? { version: AI_DISCLOSURE_VERSION } : null));
  const prisma = { aiDataConsent: { findFirst: consent } } as unknown as PrismaClient;
  return {
    deps: {
      runtime,
      prisma,
      resolveModel: vi.fn(async () => ({ provider: "openai", id: "fake-model" })),
    },
    run,
    consent,
  };
}

describe("personalized calendar suggestions", () => {
  it("uses only actual events and user preferences with no tools, and checks recipient consent", async () => {
    const f = fixture('[{"eventIds":["e1"],"text":"Consider reviewing roadmap notes."}]');
    const result = await calendarSuggestions(
      f.deps,
      scope,
      snapshot,
      "I prefer concise briefings.",
      context,
    );
    expect(result.status).toBe("generated");
    expect(f.consent).toHaveBeenCalledWith({
      where: {
        userId: scope.userId,
        spaceId: scope.spaceId,
        recipientKey: aiRecipient({ provider: "openai", modelId: "fake-model", use: "model" })!.key,
        version: AI_DISCLOSURE_VERSION,
      },
    });
    expect(f.run).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [],
        history: [],
        prompt: expect.stringContaining("I prefer concise briefings."),
      }),
      context,
    );
    expect(JSON.parse(f.run.mock.calls[0]![0].prompt).events).toEqual(snapshot.events);
  });
  it.each([
    '[{"eventIds":["invented"],"text":"Review notes."}]',
    '[{"eventIds":[],"text":"Review notes."}]',
    "not JSON",
    "[] trailing data",
  ])("rejects ungrounded or invalid outputs: %s", async (text) => {
    expect(
      (await calendarSuggestions(fixture(text).deps, scope, snapshot, "", context)).status,
    ).toBe("unavailable");
  });
  it("does not send calendar data when consent was revoked or the calendar is empty", async () => {
    const f = fixture("[]", false);
    expect((await calendarSuggestions(f.deps, scope, snapshot, "", context)).status).toBe(
      "unavailable",
    );
    expect(f.run).not.toHaveBeenCalled();
    expect(
      (await calendarSuggestions(f.deps, scope, { ...snapshot, events: [] }, "", context)).status,
    ).toBe("not_needed");
    expect(f.run).not.toHaveBeenCalled();
  });
  it("saves no synthetic model output from the deterministic scripted runtime", async () => {
    const f = fixture("synthetic");
    f.deps.resolveModel.mockResolvedValue({ provider: "scripted", id: "scripted" });
    expect((await calendarSuggestions(f.deps, scope, snapshot, "", context)).status).toBe(
      "unavailable",
    );
    expect(f.run).not.toHaveBeenCalled();
  });
});
