import type { AgentRuntime, TaskConnection, TaskPlatform } from "@rakazo/adapter-kit";
import type { TaskStarterResult } from "@rakazo/contracts";
import { TaskStarterSpecSchema } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { IntegrationProviderSettings } from "./integration-provider-settings.js";
import { TaskPlatformRejectedError } from "./task-platform.js";
import { executeTaskStarter, taskStarterRead } from "./task-starter-runner.js";
import type { TaskStarterDependencies } from "./task-starter-service.js";
import { starterContext } from "./task-starter-service.js";

const scope = { id: "run", userId: "user", spaceId: "space", botId: "bot", threadId: "thread" };
const now = new Date("2026-10-09T15:00:00Z");
const connection = (id: string, provider: string): TaskConnection => ({
  id,
  provider,
  connectorId: "composio",
  providerRef: `remote-${id}`,
  displayName: id,
});
const mail = (id: string, connectionId: string) => ({
  id,
  connectionId,
  threadId: id,
  accountLabel: connectionId,
  subject: "Review proposal",
  from: "client@example.test",
  date: now.toISOString(),
  snippet: "Please review",
  url: `https://mail.google.com/mail/u/client@example.test/#all/${id}`,
  text: "Please review the proposal by October 12, 2026",
  to: ["user@example.test"],
});
function fixture(modelText = "[]") {
  const runtime = {
    run: vi.fn(async function* () {
      yield { type: "text", text: modelText };
      yield { type: "done" };
    }),
  } as unknown as AgentRuntime;
  const platform = {
    searchMail: vi.fn(async ({ connection: c }: { connection: TaskConnection }) => ({
      messages: [mail(`message-${c.id}`, c.id)],
      complete: true,
    })),
    upcomingMeetings: vi.fn(async () => ({
      meetings: [
        {
          id: "meeting",
          connectionId: "calendar",
          title: "Client review",
          start: "2026-10-10T15:00:00Z",
          end: "2026-10-10T16:00:00Z",
          description: "Discuss proposal",
          url: "https://calendar.google.com/calendar/event?eid=meeting",
          attendees: ["client@example.test"],
        },
      ],
      complete: true,
    })),
    hubspotContext: vi.fn(async () => ({
      records: [
        {
          id: "contact",
          title: "Client",
          text: "Proposal stage",
          url: "https://app.hubspot.com/contacts/1/contact/2",
        },
      ],
      warnings: [],
    })),
    analyticsProperties: vi.fn(async () => [
      { id: "123", name: "Demo property", timezone: "America/Chicago" },
    ]),
    analyticsReport: vi.fn(async () => ({
      report: {
        propertyId: "123",
        timezone: "America/Chicago",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        currency: "USD",
        metrics: [{ name: "sessions", label: "Sessions", value: 12 }],
      },
      warnings: [],
    })),
    sheetInfo: vi.fn(async () => ({
      title: "Report",
      url: "https://docs.google.com/spreadsheets/d/abcdefghij/edit",
    })),
    findReportSheet: vi.fn(async () => null),
    createReportSheet: vi.fn(async () => "abcdefghij"),
    readSheet: vi.fn(async () => []),
    writeSheet: vi.fn(async () => undefined),
  };
  const prisma = {
    taskStarterExecution: { findMany: vi.fn(async () => []) },
    connection: { findFirst: vi.fn(async () => ({ id: "connected" })) },
    aiDataConsent: { findFirst: vi.fn(async () => ({ id: "consent" })) },
  } as unknown as PrismaClient;
  const deps: TaskStarterDependencies = {
    prisma,
    runtime,
    resolveModel: vi.fn(async () => ({ provider: "openai", id: "demo-model" })),
    integrationSettings: {
      taskPlatform: vi.fn(async () => platform as unknown as TaskPlatform),
    } as unknown as IntegrationProviderSettings,
    jobs: { enqueue: vi.fn(), cancel: vi.fn(), close: vi.fn() },
    events: {
      append: vi.fn(async () => ({})),
      finalizeRun: vi.fn(async () => false),
    } as unknown as TaskStarterDependencies["events"],
  };
  return { deps, platform, runtime };
}
function spec(input: Record<string, unknown>) {
  return TaskStarterSpecSchema.parse({ timezone: "UTC", ...input });
}

describe("task starter deterministic read workflows", () => {
  it("searches every selected Gmail account and preserves account provenance", async () => {
    const f = fixture();
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({
        starter: "gmail_search",
        query: "proposal",
        gmailConnectionIds: ["personal", "work"],
      }),
      [connection("personal", "gmail"), connection("work", "gmail")],
      now,
      starterContext(scope, "run"),
    );
    expect(result.kind).toBe("gmail_search");
    if (result.kind !== "gmail_search") throw new Error("Unexpected result");
    expect(result.coverage.map((c) => c.connectionId)).toEqual(["personal", "work"]);
    expect(result.messages.map((m) => m.connectionId)).toEqual(["personal", "work"]);
    expect(f.platform.searchMail).toHaveBeenCalledTimes(2);
    expect(result.sources.map((s) => s.id)).toEqual([
      "personal:message-personal",
      "work:message-work",
    ]);
    expect(f.runtime.run).not.toHaveBeenCalled();
  });
  it("reports a failed mailbox explicitly while retaining the successful result", async () => {
    const f = fixture();
    f.platform.searchMail.mockRejectedValueOnce(new Error("provider down"));
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({
        starter: "gmail_search",
        query: "proposal",
        gmailConnectionIds: ["personal", "work"],
      }),
      [connection("personal", "gmail"), connection("work", "gmail")],
      now,
      starterContext(scope, "run"),
    );
    if (result.kind !== "gmail_search") throw new Error("Unexpected result");
    expect(result.coverage[0]?.status).toBe("failed");
    expect(result.messages).toHaveLength(1);
    expect(result.warnings).toEqual(["Could not search personal"]);
  });
  it("rejects all-failed Gmail search instead of presenting an empty successful search", async () => {
    const f = fixture();
    f.platform.searchMail.mockRejectedValue(new Error("down"));
    await expect(
      taskStarterRead(
        f.deps,
        scope,
        spec({ starter: "gmail_search", query: "topic", gmailConnectionIds: ["personal"] }),
        [connection("personal", "gmail")],
        now,
        starterContext(scope, "run"),
      ),
    ).rejects.toThrow("Could not read");
  });
  it("refuses revoked accounts before reaching the provider", async () => {
    const f = fixture();
    vi.mocked(f.deps.prisma.connection.findFirst).mockResolvedValue(null);
    await expect(
      taskStarterRead(
        f.deps,
        scope,
        spec({ starter: "gmail_search", query: "topic", gmailConnectionIds: ["personal"] }),
        [connection("personal", "gmail")],
        now,
        starterContext(scope, "run"),
      ),
    ).rejects.toThrow();
    expect(f.platform.searchMail).not.toHaveBeenCalled();
  });
  it("requires model consent before transmitting mailbox data", async () => {
    const f = fixture();
    vi.mocked(f.deps.prisma.aiDataConsent.findFirst).mockResolvedValue(null);
    await expect(
      taskStarterRead(
        f.deps,
        scope,
        spec({ starter: "inbox_todos", gmailConnectionIds: ["personal"] }),
        [connection("personal", "gmail")],
        now,
        starterContext(scope, "run"),
      ),
    ).rejects.toThrow("Allow this model");
    expect(f.runtime.run).not.toHaveBeenCalled();
  });
  it("extracts a grounded action with deterministic identity and no tools", async () => {
    const f = fixture(
      JSON.stringify([
        {
          title: "Review proposal",
          notes: "Client request",
          dueDate: "2026-10-12",
          priority: "normal",
          reason: "Explicit request",
          sourceIds: ["personal:message-personal"],
        },
      ]),
    );
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({ starter: "inbox_todos", gmailConnectionIds: ["personal"] }),
      [connection("personal", "gmail")],
      now,
      starterContext(scope, "run"),
    );
    if (result.kind !== "inbox_todos") throw new Error("Unexpected result");
    expect(result.actions[0]).toMatchObject({
      title: "Review proposal",
      savedItemId: null,
      sourceIds: ["personal:message-personal"],
    });
    expect(f.runtime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [],
        history: [],
        instructions: expect.stringContaining("untrusted data"),
      }),
      expect.anything(),
    );
  });
  it("rejects invented action citations", async () => {
    const f = fixture(
      JSON.stringify([
        {
          title: "Invented",
          notes: "",
          dueDate: null,
          priority: "normal",
          reason: "",
          sourceIds: ["invented"],
        },
      ]),
    );
    await expect(
      taskStarterRead(
        f.deps,
        scope,
        spec({ starter: "inbox_todos", gmailConnectionIds: ["personal"] }),
        [connection("personal", "gmail")],
        now,
        starterContext(scope, "run"),
      ),
    ).rejects.toThrow("unsupported source");
  });
  it("reuses accepted action identity when the model rephrases the same source-bound commitment", async () => {
    const action = {
      id: "accepted-action",
      title: "User edited proposal task",
      notes: "User notes",
      dueDate: null,
      priority: "normal",
      reason: "Explicit request",
      sourceIds: ["personal:message-personal"],
      savedItemId: "existing-item",
    };
    const f = fixture(
      JSON.stringify([
        {
          ...action,
          id: undefined,
          savedItemId: undefined,
          title: "Check the client proposal",
          existingActionId: action.id,
        },
      ]),
    );
    vi.mocked(f.deps.prisma.taskStarterExecution.findMany).mockResolvedValue([
      {
        result: {
          kind: "inbox_todos",
          sources: [],
          warnings: [],
          summary: "Prior actions",
          actions: [action],
        },
      },
    ] as never);
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({ starter: "inbox_todos", gmailConnectionIds: ["personal"] }),
      [connection("personal", "gmail")],
      now,
      starterContext(scope, "run"),
    );
    if (result.kind !== "inbox_todos") throw new Error("Unexpected result");
    expect(result.actions[0]).toMatchObject({
      id: "accepted-action",
      savedItemId: "existing-item",
    });
    expect(
      JSON.parse(vi.mocked(f.runtime.run).mock.calls[0]![0].prompt).acceptedActions[0].title,
    ).toBe(action.title);
  });
  it("rejects invented accepted action identities", async () => {
    const f = fixture(
      JSON.stringify([
        {
          title: "Review proposal",
          notes: "",
          dueDate: null,
          priority: "normal",
          reason: "",
          sourceIds: ["personal:message-personal"],
          existingActionId: "invented-action",
        },
      ]),
    );
    await expect(
      taskStarterRead(
        f.deps,
        scope,
        spec({ starter: "inbox_todos", gmailConnectionIds: ["personal"] }),
        [connection("personal", "gmail")],
        now,
        starterContext(scope, "run"),
      ),
    ).rejects.toThrow("unsupported previous action");
  });
  it("sorts priorities and explicit deadlines deterministically and collapses repeated IDs", async () => {
    const actions = [
      { title: "Low", priority: "low", dueDate: "2026-10-10" },
      { title: "High later", priority: "high", dueDate: "2026-10-13" },
      { title: "High first", priority: "high", dueDate: "2026-10-12" },
      { title: "High first", priority: "high", dueDate: "2026-10-12" },
      { title: "Normal", priority: "normal", dueDate: null },
    ];
    const f = fixture(
      JSON.stringify(
        actions.map((a) => ({
          ...a,
          notes: "",
          reason: "Explicit request",
          sourceIds: ["personal:message-personal"],
        })),
      ),
    );
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({ starter: "inbox_todos", gmailConnectionIds: ["personal"] }),
      [connection("personal", "gmail")],
      now,
      starterContext(scope, "run"),
    );
    if (result.kind !== "inbox_todos") throw new Error("Unexpected result");
    expect(result.actions.map((a) => a.title)).toEqual([
      "High first",
      "High later",
      "Normal",
      "Low",
    ]);
  });
  it("provides verified calendar facts when synthesis is unavailable", async () => {
    const f = fixture("invalid JSON");
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({ starter: "meeting_brief", calendarConnectionIds: ["calendar"] }),
      [connection("calendar", "googlecalendar")],
      now,
      starterContext(scope, "run"),
    );
    if (result.kind !== "meeting_brief") throw new Error("Unexpected result");
    expect(result.meeting?.title).toBe("Client review");
    expect(result.facts).toHaveLength(2);
    expect(result.warnings).toContain(
      "Model synthesis unavailable; showing verified meeting details",
    );
  });
  it("previews GA4 totals with property timezone and a fixed padded report range, without writes", async () => {
    const f = fixture();
    const result = await taskStarterRead(
      f.deps,
      scope,
      spec({
        starter: "analytics_report",
        analyticsConnectionId: "analytics",
        sheetsConnectionId: "sheets",
        propertyId: "123",
        metrics: ["sessions"],
      }),
      [connection("analytics", "googleanalytics"), connection("sheets", "googlesheets")],
      now,
      starterContext(scope, "run"),
    );
    if (result.kind !== "analytics_report") throw new Error("Unexpected result");
    expect(result.report).toMatchObject({
      timezone: "America/Chicago",
      range: expect.stringMatching(/^Rakazo_[a-f0-9]{16}!A1:B12$/),
      published: false,
      provisional: true,
    });
    expect(result.report.values).toHaveLength(12);
    expect(f.platform.analyticsReport).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-10-05", endDate: "2026-10-09" }),
      expect.anything(),
    );
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
    expect(f.platform.createReportSheet).not.toHaveBeenCalled();
  });
});

function publishingFixture(effectStatus = "intended", phase?: string) {
  const f = fixture();
  const result: TaskStarterResult = {
    kind: "analytics_report",
    sources: [],
    warnings: [],
    summary: "Report",
    report: {
      propertyId: "123",
      timezone: "UTC",
      startDate: "2026-10-05",
      endDate: "2026-10-09",
      currency: null,
      metrics: [{ name: "sessions", label: "Sessions", value: 12 }],
      spreadsheetId: "abcdefghij",
      url: null,
      range: "Rakazo!A1:B12",
      values: [["Sessions", 12]],
      provisional: true,
      published: false,
    },
  };
  const run = { ...scope, taskId: "task", status: "queued", leaseFence: 0, startedAt: null };
  const execution = {
    id: "receipt",
    runId: "run",
    run,
    starter: "analytics_report",
    action: "publish",
    input: spec({
      starter: "analytics_report",
      analyticsConnectionId: "analytics",
      sheetsConnectionId: "sheets",
      propertyId: "123",
      metrics: ["sessions"],
    }),
    connections: [connection("analytics", "googleanalytics"), connection("sheets", "googlesheets")],
    result,
    createdAt: now,
    sourceExecutionId: "preview",
  };
  const effect = { id: "effect", status: effectStatus, result: phase ? { phase } : null };
  const p = {
    taskStarterExecution: {
      findUnique: vi.fn(async () => execution),
      update: vi.fn(async () => execution),
    },
    run: { updateMany: vi.fn(async () => ({ count: 1 })), findFirst: vi.fn(async () => run) },
    bot: { findFirst: vi.fn(async () => ({ id: "bot" })) },
    attempt: { create: vi.fn(async () => ({ id: "attempt" })) },
    connection: { findFirst: vi.fn(async () => ({ id: "connected" })) },
    externalEffect: {
      findFirst: vi.fn(async () => (effect.status === "ambiguous" ? effect : null)),
      upsert: vi.fn(async ({ create }: { create: { request: unknown } }) => ({
        ...effect,
        request: create.request,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(effect, data);
        return effect;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $queryRaw: vi.fn(),
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(p),
  };
  f.deps.prisma = p as unknown as PrismaClient;
  return { ...f, p, result, execution, effect };
}
describe("durable approved report writes", () => {
  it("records intent before a write and verifies the exact range before completion", async () => {
    const f = publishingFixture();
    f.platform.readSheet
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        f.result.kind === "analytics_report" ? (f.result.report.values as never[]) : [],
      );
    await executeTaskStarter(f.deps, "run", "worker");
    expect(f.p.externalEffect.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "intended", reviewDecision: "user_approved" }),
      }),
    );
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    expect(f.p.externalEffect.update.mock.invocationCallOrder[0]).toBeLessThan(
      f.platform.writeSheet.mock.invocationCallOrder[0]!,
    );
    expect(f.deps.events.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "completed", taskConnections: expect.any(Array) }),
    );
  });
  it("reconciles a successful but unacknowledged write without replaying it", async () => {
    const f = publishingFixture("ambiguous", "write_dispatched");
    f.platform.readSheet.mockResolvedValue(
      f.result.kind === "analytics_report" ? (f.result.report.values as never[]) : [],
    );
    await executeTaskStarter(f.deps, "run", "worker");
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
    expect(f.deps.events.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "completed" }),
    );
  });
  it("requires reconciliation when a dispatched write differs, without replaying it", async () => {
    const f = publishingFixture("ambiguous", "write_dispatched");
    await executeTaskStarter(f.deps, "run", "worker");
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
    expect(f.p.taskStarterExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reconciliationRequired: true } }),
    );
    expect(f.deps.events.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed",
        error: expect.stringContaining("verify the destination"),
      }),
    );
  });
  it("does no provider work after a competing worker wins the lease", async () => {
    const f = publishingFixture();
    f.p.run.updateMany.mockResolvedValueOnce({ count: 0 });
    await executeTaskStarter(f.deps, "run", "loser");
    expect(f.platform.readSheet).not.toHaveBeenCalled();
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
  });
  it("checks cancellation before any external write", async () => {
    const f = publishingFixture();
    f.p.run.findFirst.mockResolvedValueOnce(null as never);
    await executeTaskStarter(f.deps, "run", "worker");
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
    expect(f.p.externalEffect.upsert).not.toHaveBeenCalled();
  });
  it("restores the durable approved report after a completed effect despite later source revisions", async () => {
    const f = publishingFixture("completed");
    const approved = structuredClone(f.result);
    if (approved.kind !== "analytics_report" || f.result.kind !== "analytics_report")
      throw new Error("Unexpected fixture");
    f.execution.action = "scheduled_publish";
    f.result.report.values = [["Sessions", 99]];
    f.result.report.metrics[0]!.value = 99;
    f.p.externalEffect.upsert.mockResolvedValue({
      ...f.effect,
      result: { spreadsheetId: "abcdefghij" } as never,
      request: { connectionId: "sheets", providerRef: "remote-sheets", report: approved.report },
    });
    await executeTaskStarter(f.deps, "run", "worker");
    const updates = f.p.taskStarterExecution.update.mock.calls as unknown as {
      data: { result?: TaskStarterResult };
    }[][];
    expect(updates.at(-1)?.[0]?.data.result).toMatchObject({
      report: {
        metrics: [{ name: "sessions", value: 12 }],
        values: [["Sessions", 12]],
        published: true,
      },
    });
    expect(f.platform.analyticsReport).not.toHaveBeenCalled();
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
  });
  it("marks cancellation during an in-flight write uncertain without granting replay", async () => {
    const f = publishingFixture();
    f.platform.writeSheet.mockImplementation(async () => {
      f.p.run.findFirst.mockResolvedValue(null as never);
    });
    await executeTaskStarter(f.deps, "run", "worker");
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    expect(f.effect.status).toBe("ambiguous");
    expect(f.p.taskStarterExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reconciliationRequired: true } }),
    );
  });
  it("keeps definitive rejected writes retryable instead of marking them uncertain", async () => {
    const f = publishingFixture();
    f.platform.writeSheet.mockRejectedValue(new TaskPlatformRejectedError("Permission denied"));
    await executeTaskStarter(f.deps, "run", "worker");
    expect(f.effect.status).toBe("intended");
    expect(f.p.taskStarterExecution.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { reconciliationRequired: true } }),
    );
    expect(f.deps.events.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed",
        error: "Could not complete this task. Try again.",
      }),
    );
  });
});
