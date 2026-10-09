import { randomUUID } from "node:crypto";
import type { AgentRuntime, CalendarProvider, JobPublisher } from "@rakazo/adapter-kit";
import { CalendarAccessError } from "@rakazo/adapter-kit";
import {
  aiRecipient,
  CalendarService,
  createJobReconciler,
  EncryptedSecretStore,
  executeCalendarBriefing,
  InMemoryRealtimeFanout,
  withSecretPersistence,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { AI_DISCLOSURE_VERSION } from "@rakazo/contracts";
import { CALENDAR_PREFERENCES_PATH } from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { createDb, createThreadEvents } from "@rakazo/db";
import { MarkdownMemoryStore } from "@rakazo/memory";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const describeDatabase =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;

describeDatabase("calendar OAuth → durable briefing (PostgreSQL, offline providers)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let actor: Actor;
  let botId: string;
  let threadId: string;
  let service: CalendarService;
  let provider: CalendarProvider;
  let events: ThreadEvents;
  let jobs: JobPublisher;
  let memory: MarkdownMemoryStore;
  const secrets = new EncryptedSecretStore("calendar-offline-test-key");
  const realtime = new InMemoryRealtimeFanout();
  const runtime: AgentRuntime = {
    describe: () => ({
      id: "offline",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: { streaming: true, tools: false, resumable: false, compaction: false },
    }),
    async *run() {
      yield { type: "done", text: "[]" };
    },
    async abort() {},
  };

  beforeAll(() => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = withSecretPersistence(db.prisma, secrets);
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const id = `calendar-test-${randomUUID()}`;
    actor = {
      spaceId: id,
      userId: `${id}-user`,
      email: "calendar@example.test",
      isDeploymentOwner: true,
    };
    botId = `${id}-bot`;
    threadId = `${id}-thread`;
    await prisma.user.create({
      data: { id: actor.userId, email: actor.email, name: "Calendar Test" },
    });
    await prisma.organization.create({
      data: {
        id,
        name: "Calendar Test",
        slug: id,
        createdAt: new Date(),
        spaces: {
          create: {
            id,
            name: "Calendar Test",
            bots: {
              create: {
                id: botId,
                userId: actor.userId,
                name: "Assistant",
                color: "ink",
                thread: { create: { id: threadId, spaceId: id, userId: actor.userId } },
              },
            },
          },
        },
      },
    });
    events = createThreadEvents(prisma, realtime);
    memory = new MarkdownMemoryStore(prisma);
    jobs = {
      enqueue: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    provider = {
      authorizationUrl: vi.fn(
        (_config, input) =>
          `https://calendar.example.test/authorize?state=${input.state}&code_challenge=${input.challenge}`,
      ),
      exchange: vi.fn(async () => ({
        accessToken: "fake-access",
        refreshToken: "fake-refresh",
        expiresAt: Date.now() + 3_600_000,
      })),
      refresh: vi.fn(async (_config, tokens) => ({ ...tokens, expiresAt: Date.now() + 3_600_000 })),
      revoke: vi.fn(async () => undefined),
      sources: vi.fn(async () => [
        { id: "primary", name: "Test calendar", timezone: "America/Chicago" },
      ]),
      events: vi.fn(async (_tokens, input) => ({
        ...input,
        retrievedAt: new Date().toISOString(),
        events: [],
      })),
    };
    service = new CalendarService({
      prisma,
      secrets,
      provider,
      jobs,
      events,
      memory,
      redirectUri: "https://app.example.test/api/calendar/oauth/callback",
    });
    await service.configure({ clientId: "fake-client", clientSecret: "fake-secret" }, actor);
  });
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: actor.spaceId } });
    await prisma.user.deleteMany({ where: { id: actor.userId } });
    await prisma.integrationProviderConfig.deleteMany({ where: { id: "calendar-google" } });
  });
  afterAll(async () => {
    await realtime.close();
    await secrets.close();
    await close();
  });

  async function begin() {
    const result = await service.begin(actor, { botId, timezone: "America/Chicago" });
    return new URL(result.authorizationUrl).searchParams.get("state")!;
  }
  async function connected() {
    await service.callback({ state: await begin(), code: "fake-code" });
    return prisma.calendarBriefing.findFirstOrThrow({
      where: { run: { userId: actor.userId } },
      orderBy: { createdAt: "desc" },
      include: { run: true },
    });
  }
  async function execute(runId: string, workerId = "test-worker") {
    await executeCalendarBriefing(
      {
        prisma,
        events,
        jobs,
        calendar: service,
        runtime,
        resolveModel: async () => ({ provider: "scripted", id: "scripted" }),
      },
      runId,
      workerId,
    );
  }

  async function managedAccount() {
    const source = await prisma.connection.create({
      data: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        connectorId: "managed-test",
        provider: "googlecalendar",
        displayName: "Work Calendar",
        providerRef: "fake-account",
        status: "connected",
      },
    });
    const reader = {
      sources: vi.fn(async () => [{ id: "primary", name: "Work", timezone: "America/Chicago" }]),
      events: vi.fn(async (input: Parameters<CalendarProvider["events"]>[1]) => ({
        ...input,
        retrievedAt: new Date().toISOString(),
        events: [],
      })),
    };
    service = new CalendarService({
      ...service.deps,
      managed: {
        configured: async () => "managed-test",
        reader: async () => reader,
      },
    });
    return { source, reader };
  }
  it("reuses a managed account without token export and queues only one briefing on concurrent clicks", async () => {
    const { source } = await managedAccount();
    await Promise.all(
      [1, 2].map(() =>
        service.connectAccount(actor, {
          connectionId: source.id,
          botId,
          timezone: "America/Chicago",
        }),
      ),
    );
    const receipt = await prisma.calendarBriefing.findFirstOrThrow({
      where: { run: { userId: actor.userId } },
    });
    expect(await prisma.calendarBriefing.count({ where: { run: { userId: actor.userId } } })).toBe(
      1,
    );
    expect(await prisma.secret.count({ where: { userId: actor.userId } })).toBe(0);
    expect((await service.status(actor)).managedConnections).toEqual([
      { id: source.id, displayName: "Work Calendar" },
    ]);
    await execute(receipt.runId);
    expect((await service.receipt(actor, receipt.id)).status).toBe("completed");
    expect(provider.exchange).not.toHaveBeenCalled();
    await service.disconnect(actor);
    expect((await prisma.connection.findUniqueOrThrow({ where: { id: source.id } })).status).toBe(
      "connected",
    );
    expect(provider.revoke).not.toHaveBeenCalled();
  });
  it("rejects managed accounts outside the actor scope before provider reads", async () => {
    const { source, reader } = await managedAccount();
    await expect(
      service.connectAccount(
        { ...actor, userId: "other" },
        { connectionId: source.id, botId, timezone: "UTC" },
      ),
    ).rejects.toThrow();
    await expect(
      service.connectAccount(
        { ...actor, spaceId: "other" },
        { connectionId: source.id, botId, timezone: "UTC" },
      ),
    ).rejects.toThrow();
    expect(reader.sources).not.toHaveBeenCalled();
  });
  it("does not attach a managed account without event permissions", async () => {
    const { source, reader } = await managedAccount();
    reader.events.mockRejectedValueOnce(new CalendarAccessError());
    await expect(
      service.connectAccount(actor, { connectionId: source.id, botId, timezone: "UTC" }),
    ).rejects.toThrow();
    expect(await prisma.calendarBriefing.count({ where: { run: { userId: actor.userId } } })).toBe(
      0,
    );
  });
  it("fences revoked managed accounts during retrieval and before final publication", async () => {
    const { source, reader } = await managedAccount();
    await service.connectAccount(actor, { connectionId: source.id, botId, timezone: "UTC" });
    const receipt = await prisma.calendarBriefing.findFirstOrThrow({
      where: { run: { userId: actor.userId } },
    });
    reader.events.mockImplementationOnce(async (input) => {
      await prisma.connection.update({ where: { id: source.id }, data: { status: "revoked" } });
      return { ...input, retrievedAt: new Date().toISOString(), events: [] };
    });
    await execute(receipt.runId);
    expect((await service.receipt(actor, receipt.id)).snapshot).toBeNull();
    expect((await service.status(actor)).status).toBe("error");
    await expect(service.retry(actor, receipt.id)).rejects.toThrow();
  });
  it("invalidates a managed briefing when another app account is selected during retrieval", async () => {
    const { source, reader } = await managedAccount();
    await service.connectAccount(actor, { connectionId: source.id, botId, timezone: "UTC" });
    const receipt = await prisma.calendarBriefing.findFirstOrThrow({
      where: { run: { userId: actor.userId } },
    });
    const next = await prisma.connection.create({
      data: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        connectorId: source.connectorId,
        provider: source.provider,
        displayName: "Home Calendar",
        providerRef: "fake-home-account",
        status: "connected",
      },
    });
    reader.events.mockImplementationOnce(async (input) => {
      await service.connectAccount(actor, { connectionId: next.id, botId, timezone: "UTC" });
      return { ...input, retrievedAt: new Date().toISOString(), events: [] };
    });
    await execute(receipt.runId);
    expect((await service.receipt(actor, receipt.id)).status).toBe("failed");
    expect((await service.status(actor)).managedConnectionId).toBe(next.id);
    expect(await prisma.calendarBriefing.count({ where: { run: { userId: actor.userId } } })).toBe(
      2,
    );
  });
  it("switching from direct pending authorization removes its verifier and rejects its callback", async () => {
    const state = await begin();
    const { source } = await managedAccount();
    await service.connectAccount(actor, { connectionId: source.id, botId, timezone: "UTC" });
    expect(
      await prisma.secret.count({
        where: { userId: actor.userId, kind: "calendar-oauth-pending" },
      }),
    ).toBe(0);
    await expect(service.callback({ state, code: "fake-code" })).rejects.toThrow();
    expect(provider.exchange).not.toHaveBeenCalled();
  });
  it("does not publish a saved outcome when the linked managed account is revoked", async () => {
    const { source } = await managedAccount();
    await service.connectAccount(actor, { connectionId: source.id, botId, timezone: "UTC" });
    const receipt = await prisma.calendarBriefing.findFirstOrThrow({
      where: { run: { userId: actor.userId } },
    });
    const finalize = events.finalizeRun.bind(events);
    vi.spyOn(events, "finalizeRun").mockImplementationOnce(async (input) => {
      await prisma.connection.update({ where: { id: source.id }, data: { status: "revoked" } });
      return finalize(input);
    });
    await execute(receipt.runId);
    const saved = await service.receipt(actor, receipt.id);
    expect(saved.status).toBe("failed");
    expect(await prisma.message.count({ where: { runId: receipt.runId, role: "assistant" } })).toBe(
      0,
    );
  });

  it("automatically queues after OAuth, persists encrypted credentials and saves one verified empty-calendar outcome", async () => {
    const receipt = await connected();
    expect(receipt.run.status).toBe("queued");
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "run.continue", payload: { runId: receipt.runId } }),
    );
    expect(
      await prisma.secret.count({
        where: { userId: actor.userId, kind: "calendar-oauth-pending" },
      }),
    ).toBe(0);
    const secret = await prisma.secret.findFirstOrThrow({
      where: { userId: actor.userId, kind: "calendar-oauth" },
    });
    expect(secret.ciphertext).not.toContain("fake-refresh");
    expect(JSON.parse(await secrets.load(secret.ciphertext, secret.id)).tokens.refreshToken).toBe(
      "fake-refresh",
    );
    await Promise.all([execute(receipt.runId, "a"), execute(receipt.runId, "b")]);
    await execute(receipt.runId);
    const saved = await service.receipt(actor, receipt.id);
    expect(saved.status).toBe("completed");
    expect(saved.startedAt).toBeTruthy();
    expect(saved.completedAt).toBeTruthy();
    expect(saved.snapshot?.sources).toHaveLength(1);
    expect(saved.snapshot?.events).toEqual([]);
    expect(saved.outcome).toContain("No events tomorrow");
    expect(saved.suggestionStatus).toBe("not_needed");
    expect(provider.events).toHaveBeenCalledTimes(1);
    const messages = await prisma.message.findMany({ where: { runId: receipt.runId } });
    expect(
      messages.filter((m) => JSON.stringify(m.blocks).includes("No events tomorrow")),
    ).toHaveLength(1);
    expect(
      await prisma.event.count({ where: { runId: receipt.runId, type: "thread.progress" } }),
    ).toBe(0);
  });
  it("spends OAuth state once across concurrent callbacks and survives service restart", async () => {
    const state = await begin();
    service = new CalendarService(service.deps);
    const results = await Promise.allSettled([
      service.callback({ state, code: "fake-code" }),
      service.callback({ state, code: "fake-code" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(provider.exchange).toHaveBeenCalledTimes(1);
    expect(await prisma.calendarBriefing.count({ where: { run: { userId: actor.userId } } })).toBe(
      1,
    );
    await expect(service.callback({ state, code: "fake-code" })).rejects.toThrow("expired");
  });
  it("persists a factual nonempty briefing with personalized suggestions and preference provenance", async () => {
    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: actor.spaceId,
        userId: actor.userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: randomUUID(),
        organizationId: actor.spaceId,
        spaceId: actor.spaceId,
        userId: actor.userId,
        role: "owner",
        createdAt: new Date(),
      },
    });
    await prisma.aiDataConsent.create({
      data: {
        userId: actor.userId,
        spaceId: actor.spaceId,
        version: AI_DISCLOSURE_VERSION,
        recipientKey: aiRecipient({ provider: "openai", modelId: "fake-model", use: "model" })!.key,
      },
    });
    await service.preferences(actor, {
      botId,
      content: "Keep roadmap preparation concise.",
      expectedRevision: 0,
    });
    vi.mocked(provider.events).mockImplementation(async (_tokens, input) => ({
      ...input,
      retrievedAt: new Date().toISOString(),
      events: [
        {
          id: "primary:planning",
          calendarId: "primary",
          title: "Roadmap planning",
          start: `${input.date}T09:00:00-05:00`,
          end: `${input.date}T10:00:00-05:00`,
          allDay: false,
          url: null,
          location: "Room A",
          description: "Review roadmap",
          recurringEventId: "recurring-planning",
          busy: true,
          response: "accepted",
        },
      ],
    }));
    const model = {
      ...runtime,
      run: vi.fn<AgentRuntime["run"]>(async function* () {
        yield {
          type: "done",
          text: '[{"eventIds":["primary:planning"],"text":"Consider reviewing your roadmap notes."}]',
        };
      }),
    };
    const receipt = await connected();
    await executeCalendarBriefing(
      {
        prisma,
        events,
        jobs,
        calendar: service,
        runtime: model,
        resolveModel: async () => ({ provider: "openai", id: "fake-model" }),
      },
      receipt.runId,
      "personalized-worker",
    );
    const saved = await service.receipt(actor, receipt.id);
    expect(saved.status).toBe("completed");
    expect(saved.suggestionStatus).toBe("generated");
    expect(saved.snapshot?.events).toHaveLength(1);
    expect(saved.outcome).toContain("9:00 AM–10:00 AM");
    expect(saved.outcome).toContain("Consider reviewing your roadmap notes.");
    expect(saved.memorySources[0]?.revision).toBe(1);
    expect(model.run.mock.calls[0]?.[0].prompt).toContain("Keep roadmap preparation concise.");
    expect(await prisma.memoryDocument.count({ where: { userId: actor.userId } })).toBe(1);
  });
  it("does not let an exchanged stale callback revoke a newer Google grant", async () => {
    let release!: () => void;
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const exchanging = new Promise<void>((resolve) => {
      reached = resolve;
    });
    vi.mocked(provider.exchange).mockImplementationOnce(async () => {
      reached();
      await paused;
      return {
        accessToken: "retired-access",
        refreshToken: "retired-refresh",
        expiresAt: Date.now() + 3_600_000,
      };
    });
    const oldState = await begin();
    const oldCallback = service
      .callback({ state: oldState, code: "old-code" })
      .catch((error: unknown) => error);
    await exchanging;
    const next = await connected();
    release();
    expect(await oldCallback).toBeInstanceOf(Error);
    expect(provider.revoke).not.toHaveBeenCalled();
    expect(
      await prisma.secret.count({ where: { userId: actor.userId, kind: "calendar-oauth" } }),
    ).toBe(2);
    await execute(next.runId);
    expect((await service.receipt(actor, next.id)).status).toBe("completed");
    await service.disconnect(actor);
    expect(provider.revoke).toHaveBeenCalledTimes(2);
  });
  it("blocks reconnect while grant revocation is unconfirmed and permits cleanup retry", async () => {
    await connected();
    vi.mocked(provider.revoke).mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(service.disconnect(actor)).rejects.toThrow();
    await expect(begin()).rejects.toThrow("Finish disconnecting");
    expect(
      await prisma.secret.count({ where: { userId: actor.userId, kind: "calendar-oauth" } }),
    ).toBe(1);
    await service.disconnect(actor);
    expect(
      await prisma.secret.count({ where: { userId: actor.userId, kind: "calendar-oauth" } }),
    ).toBe(0);
    await expect(begin()).resolves.toBeTruthy();
  });
  it("serializes concurrent disconnects and reconnects across a remote revocation", async () => {
    await connected();
    let release!: () => void;
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const revoking = new Promise<void>((resolve) => {
      reached = resolve;
    });
    vi.mocked(provider.revoke).mockImplementationOnce(async () => {
      reached();
      await paused;
    });
    const disconnect = service.disconnect(actor);
    await revoking;
    await expect(service.disconnect(actor)).rejects.toThrow("in progress");
    await expect(begin()).rejects.toThrow("Finish disconnecting");
    release();
    await disconnect;
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    await expect(begin()).resolves.toBeTruthy();
  });
  it("refreshes expired encrypted credentials and obeys conversation cancellation", async () => {
    const receipt = await connected();
    const secret = await prisma.secret.findFirstOrThrow({
      where: { userId: actor.userId, kind: "calendar-oauth" },
    });
    const parsed = JSON.parse(await secrets.load(secret.ciphertext, secret.id));
    parsed.tokens.expiresAt = 0;
    const stored = await secrets.put(
      JSON.stringify(parsed),
      {
        userId: actor.userId,
        spaceId: actor.spaceId,
        operationId: "test-expiry",
        traceId: "test-expiry",
        signal: new AbortController().signal,
      },
      { recordId: secret.id },
    );
    await prisma.secret.update({
      where: { id: secret.id },
      data: { ciphertext: stored.ciphertext },
    });
    vi.mocked(provider.events).mockImplementationOnce(async (_tokens, input) => {
      await events.clearThread({ spaceId: actor.spaceId, threadId, botId });
      return { ...input, retrievedAt: new Date().toISOString(), events: [] };
    });
    await execute(receipt.runId);
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    const saved = await service.receipt(actor, receipt.id);
    expect(saved.status).toBe("cancelled");
    expect(saved.snapshot).toBeNull();
    expect(saved.outcome).toBeNull();
    expect(await prisma.message.count({ where: { runId: receipt.runId } })).toBe(0);
  });
  it("prevents a disconnect at final publication from producing a success receipt", async () => {
    const receipt = await connected();
    const finalize = events.finalizeRun.bind(events);
    vi.spyOn(events, "finalizeRun").mockImplementationOnce(async (input) => {
      await service.disconnect(actor);
      return finalize(input);
    });
    await execute(receipt.runId);
    const saved = await service.receipt(actor, receipt.id);
    expect(saved.status).toBe("failed");
    expect(saved.snapshot).not.toBeNull();
    expect(saved.outcome).toBeNull();
    const messages = await prisma.message.findMany({ where: { runId: receipt.runId } });
    expect(
      messages.filter((message) => JSON.stringify(message.blocks).includes("No events tomorrow")),
    ).toHaveLength(0);
  });
  it("rejects unknown/expired/denied state without reading calendar or creating a task", async () => {
    await expect(service.callback({ state: "unknown", code: "fake-code" })).rejects.toThrow(
      "expired",
    );
    const state = await begin();
    await expect(service.callback({ state, denied: true })).rejects.toThrow("cancelled");
    expect(provider.exchange).not.toHaveBeenCalled();
    const expired = await begin();
    await prisma.calendarAuthorization.updateMany({
      where: { connection: { userId: actor.userId } },
      data: { expiresAt: new Date(0) },
    });
    await expect(service.callback({ state: expired, code: "fake-code" })).rejects.toThrow(
      "expired",
    );
    expect(await prisma.task.count({ where: { userId: actor.userId } })).toBe(0);
  });
  it("repairs a missed immediate wake from the durable run", async () => {
    vi.mocked(jobs.enqueue).mockRejectedValueOnce(new Error("queue offline"));
    const receipt = await connected();
    const reconciler = createJobReconciler({ prisma, jobs });
    await reconciler.reconcileOnce();
    expect(jobs.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "run.continue", payload: { runId: receipt.runId } }),
    );
  });
  it("reuses verified snapshot and cached outcome if final publication fails", async () => {
    const receipt = await connected();
    const finalize = vi
      .spyOn(events, "finalizeRun")
      .mockRejectedValueOnce(new Error("database unavailable"));
    await execute(receipt.runId);
    expect((await service.receipt(actor, receipt.id)).status).toBe("queued");
    await execute(receipt.runId);
    expect(provider.events).toHaveBeenCalledTimes(1);
    expect((await service.receipt(actor, receipt.id)).status).toBe("completed");
    expect(finalize).toHaveBeenCalledTimes(2);
  });
  it("bounds transient retries and allows a safe manual retry", async () => {
    const receipt = await connected();
    vi.mocked(provider.events).mockRejectedValue(new Error("private provider error fake-access"));
    for (let i = 0; i < 3; i++) await execute(receipt.runId);
    const failed = await service.receipt(actor, receipt.id);
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(3);
    expect(failed.error).not.toContain("fake-access");
    expect(failed.outcome).toBeNull();
    vi.mocked(provider.events).mockImplementation(async (_tokens, input) => ({
      ...input,
      retrievedAt: new Date().toISOString(),
      events: [],
    }));
    await Promise.all([service.retry(actor, receipt.id), service.retry(actor, receipt.id)]);
    await execute(receipt.runId);
    expect((await service.receipt(actor, receipt.id)).status).toBe("completed");
  });
  it("does not retry revoked credentials or publish after disconnect during retrieval", async () => {
    const receipt = await connected();
    vi.mocked(provider.events).mockImplementationOnce(async (_tokens, input) => {
      await service.disconnect(actor);
      return { ...input, retrievedAt: new Date().toISOString(), events: [] };
    });
    await execute(receipt.runId);
    const failed = await service.receipt(actor, receipt.id);
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(1);
    expect(failed.snapshot).toBeNull();
    await expect(service.retry(actor, receipt.id)).rejects.toThrow();
    expect((await service.status(actor)).status).toBe("disconnected");
  });
  it("a reconnect invalidates an older pending callback and independently briefs the new connection", async () => {
    const oldState = await begin();
    const newState = await begin();
    await expect(service.callback({ state: oldState, code: "fake-code" })).rejects.toThrow(
      "expired",
    );
    await service.callback({ state: newState, code: "fake-code" });
    const oldReceipt = await prisma.calendarBriefing.findFirstOrThrow({
      where: { run: { userId: actor.userId } },
    });
    const next = await connected();
    await execute(oldReceipt.runId);
    expect((await service.receipt(actor, oldReceipt.id)).status).toBe("failed");
    await execute(next.runId);
    expect((await service.receipt(actor, next.id)).status).toBe("completed");
  });
  it("isolates connection, receipt, preferences and configuration by account and space", async () => {
    const receipt = await connected();
    const other = { ...actor, userId: "other-user", isDeploymentOwner: false };
    await expect(service.begin(other, { botId, timezone: "UTC" })).rejects.toThrow();
    await expect(service.receipt(other, receipt.id)).rejects.toThrow();
    await expect(
      service.receipt({ ...actor, spaceId: "other-space" }, receipt.id),
    ).rejects.toThrow();
    await expect(service.retry(other, receipt.id)).rejects.toThrow();
    await expect(
      service.preferences(other, { botId, content: "Wrong scope", expectedRevision: 0 }),
    ).rejects.toThrow();
    await expect(
      service.configure({ clientId: "fake", clientSecret: "fake" }, other),
    ).rejects.toThrow();
    expect(await service.status(other)).toMatchObject({
      status: "disconnected",
      canConfigure: false,
    });
  });
  it("retains only explicit, source-linked preferences with edit conflicts and removable revisions", async () => {
    await service.preferences(actor, {
      botId,
      content: "I prefer a 15-minute preparation buffer.",
      expectedRevision: 0,
    });
    const doc = await prisma.memoryDocument.findFirstOrThrow({
      where: { userId: actor.userId, path: CALENDAR_PREFERENCES_PATH },
      include: { revisions: true },
    });
    expect(doc.scope).toBe("user");
    expect(doc.revisions[0]!.sourceThreadId).toBe(threadId);
    await expect(
      service.preferences(actor, { botId, content: "Stale edit", expectedRevision: 0 }),
    ).rejects.toThrow();
    await service.preferences(actor, {
      botId,
      content: "I prefer a 10-minute buffer.",
      expectedRevision: 1,
    });
    const receipt = await connected();
    await execute(receipt.runId);
    expect(await prisma.memoryDocument.count({ where: { userId: actor.userId } })).toBe(1);
    expect((await service.receipt(actor, receipt.id)).memorySources).toEqual([
      { id: doc.id, path: doc.path, revision: 2 },
    ]);
    await prisma.memoryDocument.delete({ where: { id: doc.id } });
    expect(await prisma.memoryRevision.count({ where: { documentId: doc.id } })).toBe(0);
  });
  it("marks provider access failures as reconnect-required and preserves no success claims", async () => {
    const receipt = await connected();
    vi.mocked(provider.sources).mockRejectedValueOnce(new CalendarAccessError());
    await execute(receipt.runId);
    const failed = await service.receipt(actor, receipt.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("Reconnect");
    expect(failed.snapshot).toBeNull();
  });
});
