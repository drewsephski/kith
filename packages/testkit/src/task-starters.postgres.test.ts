import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentRuntime, ManagedConnectorProvider, TaskPlatform } from "@rakazo/adapter-kit";
import {
  aiRecipient,
  ComposioEmulator,
  createRunExecutor,
  EncryptedSecretStore,
  FakeSandboxProvider,
  IntegrationProviderSettings,
  LocalAgentHomeStore,
} from "@rakazo/adapters";
import type { Actor, TaskStarterSpec } from "@rakazo/contracts";
import { AI_DISCLOSURE_VERSION, TaskStarterSpecSchema } from "@rakazo/contracts";
import { taskSourceId } from "@rakazo/core";
import {
  bootstrapUserSpace,
  cancelRunsInTransaction,
  createDb,
  createThreadEvents,
  Prisma,
} from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chooseFocus, promptFocus } from "../../../apps/api/src/onboarding.js";
import { executeTaskStarter } from "../../adapters/src/task-starter-runner.js";
import { TaskStarterService } from "../../adapters/src/task-starter-service.js";
import { MarkdownMemoryStore } from "../../memory/src/index.js";

const enabled = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const model = { provider: "openai", id: "task-fixture" };

describe.skipIf(!enabled)("task starters through durable PostgreSQL authority", () => {
  let db: ReturnType<typeof createDb>;
  let dataDir: string;

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL!);
    dataDir = await mkdtemp(path.join(tmpdir(), "rakazo-task-starter-fixture-"));
  });
  afterAll(async () => {
    await db?.prisma.$disconnect();
    await db?.pool.end();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  async function fixture() {
    const { prisma } = db;
    const userId = randomUUID();
    const email = `task-${userId}@example.test`;
    await prisma.user.create({ data: { id: userId, email, name: "Task fixture" } });
    const { spaceId } = await bootstrapUserSpace(
      prisma,
      { id: userId },
      { signupsEnabled: "true", signupAllowlist: "" },
      { claimDeploymentOwner: false },
    );
    const actor: Actor = { userId, spaceId, email, isDeploymentOwner: false };
    const bot = await prisma.bot.create({
      data: { spaceId, userId, name: "Task fixture", color: "#3EC5A8", notifyOnFinish: false },
    });
    const thread = await prisma.thread.create({ data: { spaceId, userId, botId: bot.id } });
    const addConnection = async (provider: string) =>
      prisma.connection.create({
        data: {
          spaceId,
          userId,
          provider,
          connectorId: "composio",
          providerRef: `account-${randomUUID()}`,
          displayName: provider,
          status: "connected",
        },
      });
    const personal = await addConnection("gmail");
    const work = await addConnection("gmail");
    const calendar = await addConnection("googlecalendar");
    const hubspot = await addConnection("hubspot");
    const analytics = await addConnection("googleanalytics");
    const sheets = await addConnection("googlesheets");
    const recipient = aiRecipient({ provider: model.provider, modelId: model.id, use: "model" });
    if (!recipient) throw new Error("Missing fixture model consent recipient");
    await prisma.aiDataConsent.create({
      data: { spaceId, userId, recipientKey: recipient.key, version: AI_DISCLOSURE_VERSION },
    });
    let synthesis = "[]";
    const run = vi.fn<AgentRuntime["run"]>(async function* (request) {
      expect(request.tools).toEqual([]);
      expect(request.history).toEqual([]);
      yield { type: "text", text: synthesis };
      yield { type: "done" };
    });
    const runtime = { run, abort: vi.fn(), describe: vi.fn() } as unknown as AgentRuntime;
    const cells = new Map<string, (string | number | null)[][]>();
    const platform = {
      identity: vi.fn(async (connection) => `${connection.id}@example.test`),
      searchMail: vi.fn(async ({ connection }) => ({
        complete: true,
        messages: [
          {
            id: "request",
            threadId: "thread-request",
            connectionId: connection.id,
            accountLabel: connection.displayName,
            subject: "Review proposal",
            from: "client@example.test",
            date: new Date().toISOString(),
            snippet: "Please review the proposal",
            url: `https://mail.google.com/mail/u/${connection.id}@example.test/#all/request`,
            text: "Please review the proposal",
            to: [email],
          },
        ],
      })),
      upcomingMeetings: vi.fn(async ({ connection }) => ({
        complete: true,
        meetings: [
          {
            id: "review",
            connectionId: connection.id,
            title: "Client review",
            start: new Date(Date.now() + 3600_000).toISOString(),
            end: new Date(Date.now() + 7200_000).toISOString(),
            url: "https://calendar.google.com/calendar/event?eid=review",
            description: "Discuss proposal",
            attendees: ["client@example.test"],
          },
        ],
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
      analyticsReport: vi.fn(async (input) => ({
        report: {
          propertyId: input.propertyId,
          startDate: input.startDate,
          endDate: input.endDate,
          timezone: "America/Chicago",
          currency: "USD",
          metrics: [{ name: "sessions" as const, label: "Sessions", value: 12 }],
        },
        warnings: [],
      })),
      sheetInfo: vi.fn(async (_connection, spreadsheetId) => ({
        title: "Fixture report",
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      })),
      findReportSheet: vi.fn(async () => null),
      createReportSheet: vi.fn(async () => "fixture-spreadsheet-id"),
      readSheet: vi.fn(async (connection, spreadsheetId, range) =>
        structuredClone(cells.get(`${connection.providerRef}:${spreadsheetId}:${range}`) ?? []),
      ),
      writeSheet: vi.fn<TaskPlatform["writeSheet"]>(
        async (connection, spreadsheetId, range, values) => {
          expect(values).toHaveLength(12);
          expect(values.every((row) => row.length === 2)).toBe(true);
          cells.set(`${connection.providerRef}:${spreadsheetId}:${range}`, structuredClone(values));
        },
      ),
    } satisfies TaskPlatform;
    const connector: ManagedConnectorProvider = Object.assign(new ComposioEmulator(), {
      taskPlatform: () => platform,
    });
    const secretStore = new EncryptedSecretStore("synthetic-fixture-key");
    const integrationSettings = new IntegrationProviderSettings(
      prisma,
      secretStore,
      "synthetic-fixture-key",
      { composio: connector },
    );
    const jobs = {
      enqueue: vi.fn(async () => {}),
      cancel: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const events = createThreadEvents(prisma);
    const deps = {
      prisma,
      jobs,
      events,
      integrationSettings,
      runtime,
      resolveModel: async () => model,
    };
    const service = new TaskStarterService(deps);
    const executor = createRunExecutor({
      prisma,
      jobs,
      events,
      runtime,
      secretStore,
      secrets: [],
      sandbox: new FakeSandboxProvider(),
      home: new LocalAgentHomeStore(dataDir),
      memory: new MarkdownMemoryStore(prisma),
      memoryProviders: { resolve: async () => null },
    });
    const start = async (
      input: Partial<TaskStarterSpec> & Pick<TaskStarterSpec, "starter">,
      nonce = randomUUID(),
    ) =>
      service.start(actor, {
        botId: bot.id,
        clientNonce: nonce,
        prompt: "Complete the fixture task",
        spec: TaskStarterSpecSchema.parse({ timezone: "UTC", ...input }),
      });
    const finish = async (receipt: { id: string; runId: string }) => {
      await executeTaskStarter(deps, receipt.runId, "fixture-worker");
      return service.receipt(actor, receipt.id);
    };
    return {
      prisma,
      actor,
      bot,
      thread,
      personal,
      work,
      calendar,
      hubspot,
      analytics,
      sheets,
      cells,
      platform,
      runtime,
      synthesisCalls: run,
      jobs,
      events,
      deps,
      service,
      executor,
      start,
      finish,
      setSynthesis: (text: string) => {
        synthesis = text;
      },
    };
  }

  it("atomically starts a multiaccount search once, fences competing workers, and denies another actor", async () => {
    const f = await fixture();
    const input = {
      starter: "gmail_search" as const,
      query: "proposal",
      gmailConnectionIds: [f.personal.id, f.work.id],
    };
    const nonce = randomUUID();
    const [first, second] = await Promise.all([f.start(input, nonce), f.start(input, nonce)]);
    expect(first.id).toBe(second.id);
    expect(await f.prisma.taskStarterExecution.count({ where: { run: { botId: f.bot.id } } })).toBe(
      1,
    );
    expect(await f.prisma.message.count({ where: { threadId: f.thread.id } })).toBe(2);
    await Promise.all([
      executeTaskStarter(f.deps, first.runId, "worker-a"),
      executeTaskStarter(f.deps, first.runId, "worker-b"),
    ]);
    const receipt = await f.service.receipt(f.actor, first.id);
    expect(receipt.status).toBe("completed");
    if (receipt.result?.kind !== "gmail_search") throw new Error("Missing search result");
    expect(receipt.result.coverage.map((coverage) => coverage.connectionId)).toEqual([
      f.personal.id,
      f.work.id,
    ]);
    expect(
      f.platform.searchMail.mock.calls.map(([call]) => call.connection.providerRef).sort(),
    ).toEqual([f.personal.providerRef, f.work.providerRef].sort());
    expect(await f.prisma.attempt.count({ where: { runId: first.runId } })).toBe(1);
    expect(f.runtime.run).not.toHaveBeenCalled();
    const stranger = { ...f.actor, userId: randomUUID() };
    await expect(f.service.receipt(stranger, first.id)).rejects.toThrow();
    await expect(
      f.service.start(stranger, {
        botId: f.bot.id,
        clientNonce: randomUUID(),
        prompt: "Search",
        spec: TaskStarterSpecSchema.parse({ timezone: "UTC", ...input }),
      }),
    ).rejects.toThrow();
  });

  it("accepts edited inbox actions idempotently and preserves completed scratchpad edits", async () => {
    const f = await fixture();
    const sourceId = taskSourceId(f.personal.id, "request");
    f.setSynthesis(
      JSON.stringify([
        {
          title: "Review proposal",
          notes: "Requested by client",
          dueDate: null,
          priority: "high",
          reason: "Explicit request",
          sourceIds: [sourceId],
        },
      ]),
    );
    const initial = await f.finish(
      await f.start({ starter: "inbox_todos", gmailConnectionIds: [f.personal.id] }),
    );
    expect(initial.status).toBe("completed");
    if (initial.result?.kind !== "inbox_todos" || !initial.result.actions[0])
      throw new Error("Missing inbox action");
    const action = initial.result.actions[0];
    const edits = [
      {
        id: action.id,
        title: "Review proposal with team",
        notes: "Ask for feedback",
        dueDate: "2026-10-12",
        priority: "high" as const,
      },
    ];
    const accepted = await f.service.saveTodos(f.actor, initial.id, [action.id], edits);
    if (accepted.result?.kind !== "inbox_todos") throw new Error("Missing accepted action");
    const itemId = accepted.result.actions[0]?.savedItemId;
    if (!itemId) throw new Error("Action was not persisted");
    await f.prisma.scratchpadItem.update({
      where: { id: itemId },
      data: { status: "done", title: "User completed review", notes: "Final user notes" },
    });
    await f.service.saveTodos(
      f.actor,
      initial.id,
      [action.id],
      [{ ...edits[0]!, title: "Another edit" }],
    );
    f.setSynthesis(
      JSON.stringify([
        {
          title: "Check the client's proposal with the team",
          notes: "Same original client commitment",
          dueDate: null,
          priority: "normal",
          reason: "Previously accepted commitment",
          sourceIds: [sourceId],
          existingActionId: action.id,
        },
      ]),
    );
    const rescan = await f.finish(
      await f.start({ starter: "inbox_todos", gmailConnectionIds: [f.personal.id] }),
    );
    if (rescan.result?.kind !== "inbox_todos" || !rescan.result.actions[0])
      throw new Error("Missing rescanned action");
    expect(rescan.result.actions[0].id).toBe(action.id);
    const synthesisRequest = f.synthesisCalls.mock.calls.at(-1)?.[0];
    expect(synthesisRequest?.prompt).toContain(action.id);
    expect(synthesisRequest?.prompt).toContain("Another edit");
    await f.service.saveTodos(f.actor, rescan.id, [rescan.result.actions[0].id]);
    expect(await f.prisma.scratchpadItem.count({ where: { botId: f.bot.id } })).toBe(1);
    expect(
      await f.prisma.scratchpadItem.findUniqueOrThrow({ where: { id: itemId } }),
    ).toMatchObject({ status: "done", title: "User completed review", notes: "Final user notes" });
  });

  it("builds a sourced calendar/email/HubSpot brief with no external mutations", async () => {
    const f = await fixture();
    f.setSynthesis(
      JSON.stringify({
        facts: [
          {
            text: "The client is in proposal stage",
            sourceIds: [taskSourceId(f.hubspot.id, "contact")],
          },
        ],
        suggestions: [
          { text: "Discuss the next step", sourceIds: [taskSourceId(f.calendar.id, "review")] },
        ],
      }),
    );
    const receipt = await f.finish(
      await f.start({
        starter: "meeting_brief",
        calendarConnectionIds: [f.calendar.id],
        gmailConnectionIds: [f.personal.id],
        hubspotConnectionId: f.hubspot.id,
      }),
    );
    expect(receipt.status).toBe("completed");
    if (receipt.result?.kind !== "meeting_brief") throw new Error("Missing brief");
    expect(receipt.result.meeting?.title).toBe("Client review");
    expect(receipt.result.sources.map((source) => source.connectionId)).toEqual(
      expect.arrayContaining([f.calendar.id, f.personal.id, f.hubspot.id]),
    );
    expect(f.platform.hubspotContext).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({ providerRef: f.hubspot.providerRef }),
        emails: ["client@example.test"],
      }),
      expect.anything(),
    );
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
  });

  it("commits one personalized choice and one account suggestion across concurrent tabs and a lost response", async () => {
    const f = await fixture();
    const deps = {
      prisma: f.prisma,
      events: f.events,
      connectors: {
        managedProviders: () => [
          {
            catalog: async () => [
              {
                connectorId: "composio",
                slug: "gmail",
                name: "Gmail",
                connected: true,
                logo: null,
              },
            ],
          },
        ],
      } as never,
    };
    await Promise.all([promptFocus(deps, f.actor, f.bot.id), promptFocus(deps, f.actor, f.bot.id)]);
    const notify = vi
      .spyOn(f.events, "notify")
      .mockRejectedValueOnce(new Error("Lost response after commit"));
    await expect(chooseFocus(deps, f.actor, f.bot.id, "inbox")).rejects.toThrow("Lost response");
    notify.mockRestore();
    await Promise.all([
      chooseFocus(deps, f.actor, f.bot.id, "inbox"),
      chooseFocus(deps, f.actor, f.bot.id, "day"),
    ]);
    const messages = await f.prisma.message.findMany({
      where: { threadId: f.thread.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.blocks).toEqual([
      expect.objectContaining({ kind: "choice", answerId: "inbox" }),
    ]);
    expect(messages[1]?.blocks).toEqual([
      expect.objectContaining({ kind: "app_connect", provider: "gmail", status: "connected" }),
    ]);
    expect(await f.prisma.run.count({ where: { botId: f.bot.id } })).toBe(0);
  });

  it("repeats a confirmed read-only preparation through the worker once and rechecks revoked sources", async () => {
    const f = await fixture();
    const receipt = await f.finish(
      await f.start({ starter: "inbox_todos", gmailConnectionIds: [f.personal.id] }),
    );
    expect(receipt.repeat).toMatchObject({ writes: false, timezone: "UTC" });
    expect(await f.prisma.routine.count({ where: { botId: f.bot.id } })).toBe(0);
    const input = { receiptId: receipt.id, cron: "0 9 * * *", timezone: "America/Chicago" };
    const [saved, duplicate] = await Promise.all([
      f.service.schedule(f.actor, input),
      f.service.schedule(f.actor, input),
    ]);
    expect(saved.routineId).toBe(duplicate.routineId);
    const due = new Date(Date.now() - 1000);
    await f.prisma.routine.update({ where: { id: saved.routineId }, data: { nextRunAt: due } });
    await Promise.all([
      f.executor.wakeRoutine(saved.routineId, due.toISOString()),
      f.executor.wakeRoutine(saved.routineId, due.toISOString()),
    ]);
    const execution = await f.prisma.taskStarterExecution.findFirstOrThrow({
      where: { run: { routineId: saved.routineId } },
    });
    expect(execution).toMatchObject({ starter: "inbox_todos", action: "read" });
    expect(await f.prisma.run.count({ where: { routineId: saved.routineId } })).toBe(1);
    expect((await f.finish(execution)).status).toBe("completed");
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
    await f.prisma.connection.update({ where: { id: f.personal.id }, data: { status: "revoked" } });
    await expect(f.service.schedule(f.actor, input)).rejects.toThrow();
    await expect(
      f.service.receipt({ ...f.actor, userId: randomUUID() }, receipt.id),
    ).rejects.toThrow();
  });

  async function publishedFixture(f: Awaited<ReturnType<typeof fixture>>) {
    const preview = await f.finish(
      await f.start({
        starter: "analytics_report",
        analyticsConnectionId: f.analytics.id,
        sheetsConnectionId: f.sheets.id,
        propertyId: "123",
        metrics: ["sessions"],
        spreadsheetId: "fixture-existing-sheet",
      }),
    );
    expect(preview.status).toBe("completed");
    expect(f.platform.writeSheet).not.toHaveBeenCalled();
    expect(f.platform.createReportSheet).not.toHaveBeenCalled();
    const [publish, duplicate] = await Promise.all([
      f.service.publish(f.actor, preview.id, randomUUID()),
      f.service.publish(f.actor, preview.id, randomUUID()),
    ]);
    expect(publish.id).toBe(duplicate.id);
    const finished = await f.finish(publish);
    expect(finished.status).toBe("completed");
    if (finished.result?.kind !== "analytics_report") throw new Error("Missing published report");
    expect(finished.result.report.published).toBe(true);
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    expect(f.platform.writeSheet).toHaveBeenCalledWith(
      expect.objectContaining({ id: f.sheets.id, providerRef: f.sheets.providerRef }),
      "fixture-existing-sheet",
      finished.result.report.range,
      finished.result.report.values,
      expect.anything(),
    );
    return finished;
  }

  it("publishes only after approval and runs a bound recurring report once per due wakeup", async () => {
    const f = await fixture();
    const published = await publishedFixture(f);
    const input = { receiptId: published.id, cron: "0 8 * * 1", timezone: "America/Chicago" };
    const [schedule, duplicate] = await Promise.all([
      f.service.schedule(f.actor, input),
      f.service.schedule(f.actor, input),
    ]);
    expect(schedule.routineId).toBe(duplicate.routineId);
    const due = new Date(Date.now() - 1000);
    await f.prisma.routine.update({ where: { id: schedule.routineId }, data: { nextRunAt: due } });
    await Promise.all([
      f.executor.wakeRoutine(schedule.routineId, due.toISOString()),
      f.executor.wakeRoutine(schedule.routineId, due.toISOString()),
    ]);
    const execution = await f.prisma.taskStarterExecution.findFirstOrThrow({
      where: { action: "scheduled_publish", run: { routineId: schedule.routineId } },
    });
    expect(await f.prisma.run.count({ where: { routineId: schedule.routineId } })).toBe(1);
    f.platform.analyticsReport.mockImplementationOnce(async (reportInput) => ({
      report: {
        propertyId: reportInput.propertyId,
        startDate: reportInput.startDate,
        endDate: reportInput.endDate,
        timezone: "America/Chicago",
        currency: "USD",
        metrics: [{ name: "sessions", label: "Sessions", value: 23 }],
      },
      warnings: [],
    }));
    const updated = await f.finish(execution);
    expect(updated.status).toBe("completed");
    if (
      updated.result?.kind !== "analytics_report" ||
      published.result?.kind !== "analytics_report"
    )
      throw new Error("Missing recurring report");
    expect(updated.result.report.range).toBe(published.result.report.range);
    expect(updated.result.report.spreadsheetId).toBe(published.result.report.spreadsheetId);
    expect(updated.result.report.metrics[0]?.value).toBe(23);
    expect(f.platform.writeSheet).toHaveBeenCalledTimes(2);
  });

  it("keeps an uncertain write immutable and only reconciles by reading, without replay", async () => {
    const f = await fixture();
    const preview = await f.finish(
      await f.start({
        starter: "analytics_report",
        analyticsConnectionId: f.analytics.id,
        sheetsConnectionId: f.sheets.id,
        propertyId: "123",
        metrics: ["sessions"],
        spreadsheetId: "fixture-existing-sheet",
      }),
    );
    const publish = await f.service.publish(f.actor, preview.id, randomUUID());
    f.platform.writeSheet.mockImplementationOnce(async () => {
      throw new Error("Transport disconnected after dispatch");
    });
    const uncertain = await f.finish(publish);
    expect(uncertain.status).toBe("reconciliation_required");
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    await expect(f.service.retry(f.actor, publish.id)).rejects.toThrow("Check the outcome");
    const firstCheck = await f.service.reconcile(f.actor, publish.id);
    expect((await f.finish(firstCheck)).status).toBe("reconciliation_required");
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    if (preview.result?.kind !== "analytics_report") throw new Error("Missing preview");
    const original = preview.result.report;
    const repeatedCheck = await f.service.reconcile(f.actor, firstCheck.id);
    expect(repeatedCheck.id).toBe(firstCheck.id);
    const read = f.platform.readSheet.getMockImplementation()!;
    f.platform.readSheet.mockImplementationOnce(async (...args) => {
      const result = await read(...args);
      const run = await f.prisma.run.findUniqueOrThrow({ where: { id: repeatedCheck.runId } });
      await f.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM threads WHERE id = ${f.thread.id} FOR UPDATE`;
        await cancelRunsInTransaction(tx, [run], new Date());
      });
      return result;
    });
    expect((await f.finish(repeatedCheck)).status).toBe("reconciliation_required");
    expect(
      await f.prisma.run.findUniqueOrThrow({ where: { id: repeatedCheck.runId } }),
    ).toMatchObject({ status: "cancelled" });
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    f.cells.set(
      `${f.sheets.providerRef}:${original.spreadsheetId}:${original.range}`,
      structuredClone(original.values),
    );
    const secondCheck = await f.service.reconcile(f.actor, repeatedCheck.id);
    expect(secondCheck.id).toBe(firstCheck.id);
    const reconciled = await f.finish(secondCheck);
    expect(reconciled.status).toBe("completed");
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    expect(
      await f.prisma.externalEffect.findFirstOrThrow({ where: { runId: publish.runId } }),
    ).toMatchObject({ status: "completed" });
  });

  it("does not complete when a source is revoked during a provider read", async () => {
    const f = await fixture();
    const original = f.platform.searchMail.getMockImplementation()!;
    f.platform.searchMail.mockImplementationOnce(async (input) => {
      const response = await original(input);
      await f.prisma.connection.update({
        where: { id: input.connection.id },
        data: { status: "revoked" },
      });
      return response;
    });
    const initial = await f.start({
      starter: "gmail_search",
      query: "proposal",
      gmailConnectionIds: [f.personal.id],
    });
    const receipt = await f.finish(initial);
    expect(receipt.status).toBe("failed");
    expect(receipt.result).toBeNull();
    expect(await f.prisma.run.findUniqueOrThrow({ where: { id: initial.runId } })).toMatchObject({
      status: "failed",
    });
  });

  it("checks source revocation in the atomic completion transaction", async () => {
    const f = await fixture();
    const finalize = f.events.finalizeRun.bind(f.events);
    vi.spyOn(f.events, "finalizeRun").mockImplementationOnce(async (input) => {
      expect(input.outcome).toBe("completed");
      await f.prisma.connection.update({
        where: { id: f.personal.id },
        data: { status: "revoked" },
      });
      return finalize(input);
    });
    const initial = await f.start({
      starter: "gmail_search",
      query: "proposal",
      gmailConnectionIds: [f.personal.id],
    });
    const receipt = await f.finish(initial);
    expect(receipt.status).toBe("failed");
    expect(receipt.result).toBeNull();
    const botMessages = await f.prisma.message.findMany({
      where: { runId: initial.runId, role: "bot" },
    });
    expect(botMessages.map((message) => message.blocks)).not.toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "text", text: expect.stringContaining("Review proposal") }),
      ]),
    );
  });

  it("recovers a crashed scheduled write using its original approved snapshot when GA4 changes", async () => {
    const f = await fixture();
    const published = await publishedFixture(f);
    const { routineId } = await f.service.schedule(f.actor, {
      receiptId: published.id,
      cron: "0 8 * * 1",
      timezone: "America/Chicago",
    });
    const due = new Date(Date.now() - 1000);
    await f.prisma.routine.update({ where: { id: routineId }, data: { nextRunAt: due } });
    await f.executor.wakeRoutine(routineId, due.toISOString());
    const execution = await f.prisma.taskStarterExecution.findFirstOrThrow({
      where: { action: "scheduled_publish", run: { routineId } },
    });
    f.platform.analyticsReport.mockImplementationOnce(async (input) => ({
      report: {
        propertyId: input.propertyId,
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: "America/Chicago",
        currency: "USD",
        metrics: [{ name: "sessions", label: "Sessions", value: 23 }],
      },
      warnings: [],
    }));
    f.platform.writeSheet.mockImplementationOnce(async () => {
      throw new Error("Unacknowledged scheduled write");
    });
    expect((await f.finish(execution)).status).toBe("reconciliation_required");
    const frozen = await f.prisma.taskStarterExecution.findUniqueOrThrow({
      where: { id: execution.id },
    });
    const result = frozen.result as unknown as {
      kind: "analytics_report";
      report: { spreadsheetId: string; range: string; values: (string | number | null)[][] };
    };
    f.cells.set(
      `${f.sheets.providerRef}:${result.report.spreadsheetId}:${result.report.range}`,
      structuredClone(result.report.values),
    );
    // Reconstruct an expired worker at the durable effect boundary with its local result lost.
    await f.prisma.taskStarterExecution.update({
      where: { id: execution.id },
      data: { result: Prisma.DbNull, reconciliationRequired: false },
    });
    await f.prisma.run.update({
      where: { id: execution.runId },
      data: { status: "running", completedAt: null, leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    f.platform.analyticsReport.mockImplementationOnce(async (input) => ({
      report: {
        propertyId: input.propertyId,
        startDate: input.startDate,
        endDate: input.endDate,
        timezone: "America/Chicago",
        currency: "USD",
        metrics: [{ name: "sessions", label: "Sessions", value: 99 }],
      },
      warnings: [],
    }));
    const recovered = await f.finish(execution);
    expect(recovered.status).toBe("completed");
    if (recovered.result?.kind !== "analytics_report") throw new Error("Missing recovered report");
    expect(recovered.result.report.metrics[0]?.value).toBe(23);
    expect(f.platform.writeSheet).toHaveBeenCalledTimes(2);
    expect(
      await f.prisma.externalEffect.findFirstOrThrow({ where: { runId: execution.runId } }),
    ).toMatchObject({ status: "completed" });
  });

  it("preserves cancellation and checks an in-flight successful write with a separate read-only run", async () => {
    const f = await fixture();
    const preview = await f.finish(
      await f.start({
        starter: "analytics_report",
        analyticsConnectionId: f.analytics.id,
        sheetsConnectionId: f.sheets.id,
        propertyId: "123",
        metrics: ["sessions"],
        spreadsheetId: "fixture-existing-sheet",
      }),
    );
    const publish = await f.service.publish(f.actor, preview.id, randomUUID());
    const write = f.platform.writeSheet.getMockImplementation()!;
    f.platform.writeSheet.mockImplementationOnce(async (...args) => {
      await write(...args);
      const run = await f.prisma.run.findUniqueOrThrow({ where: { id: publish.runId } });
      await f.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM threads WHERE id = ${f.thread.id} FOR UPDATE`;
        await cancelRunsInTransaction(tx, [run], new Date());
      });
    });
    expect((await f.finish(publish)).status).toBe("reconciliation_required");
    expect(await f.prisma.run.findUniqueOrThrow({ where: { id: publish.runId } })).toMatchObject({
      status: "cancelled",
    });
    const check = await f.service.reconcile(f.actor, publish.id);
    expect(check.runId).not.toBe(publish.runId);
    const checked = await f.finish(check);
    expect(checked.status).toBe("completed");
    expect(await f.prisma.run.findUniqueOrThrow({ where: { id: publish.runId } })).toMatchObject({
      status: "cancelled",
    });
    expect(f.platform.writeSheet).toHaveBeenCalledOnce();
    expect(f.platform.createReportSheet).not.toHaveBeenCalled();
  });
});
