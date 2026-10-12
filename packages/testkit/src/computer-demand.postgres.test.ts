import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdapterContext, AgentRunRequest, AgentRuntimeEvent } from "@rakazo/adapter-kit";
import {
  ComputerSuspendedError,
  FakeSandboxProvider,
  LocalAgentHomeStore,
  sleepComputerIfIdle,
} from "@rakazo/adapters";
import type { ComputerStatus } from "@rakazo/contracts";
import { createThreadEvents } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { createApp } from "../../../apps/api/src/app.ts";
import { sessionCookieHeader } from "./index.js";

const enabled = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
suite("computer demand through authenticated API and worker", () => {
  let handles: Awaited<ReturnType<typeof createApp>>;
  const sandbox = new FakeSandboxProvider();
  const provisions = vi.spyOn(sandbox, "provision");
  const dataDir = mkdtempSync(path.join(tmpdir(), "computer-demand-fixture-"));
  const origin = "http://127.0.0.1:5173";
  let serial = 0;
  beforeAll(async () => {
    vi.stubEnv("PI_DEFAULT_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-demand-key");
    const { createApp } = await import("../../../apps/api/src/app.ts");
    handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      sandbox,
      agentRuntime: "scripted",
      defaultModel: "openai/gpt-4o",
      deploymentModelKey: "fixture-demand-key",
      runtime: {
        describe: () => ({
          id: "demand-fixture",
          contractVersion: "1",
          adapterVersion: "1",
          capabilities: {
            scripted: false,
            streaming: true,
            tools: true,
            compaction: false,
          },
        }),
        async *run(
          request: AgentRunRequest,
          _context: AdapterContext,
        ): AsyncIterable<AgentRuntimeEvent> {
          if (request.prompt.includes("write a file")) {
            const result = await request.executeTool?.(
              "write_file",
              { path: "notes/result.txt", content: "demand" },
              `${request.runId}:write`,
            );
            expect(result).toMatchObject({ ok: true });
          }
          if (request.prompt.includes("Inspect attached file")) {
            const filePath = request.prompt.match(/attachments\/[\w-]+\.txt/)?.[0];
            expect(filePath).toBeDefined();
            const result = await request.executeTool?.(
              "read_file",
              { path: filePath },
              `${request.runId}:read`,
            );
            expect(result).toMatchObject({ content: "Fixture file contents" });
          }
          yield { type: "text", text: "Fixture answer" };
          yield { type: "done", text: "Fixture answer" };
        },
      },
    });
  });
  afterAll(async () => {
    await handles?.stop();
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function account(mode: "team" | "dedicated" = "team") {
    const response = await handles.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        email: `demand-${Date.now()}-${++serial}@rakazo.test`,
        password: "password12",
        name: "Demand Fixture",
      }),
    });
    expect(response.status).toBeLessThan(400);
    const cookie = sessionCookieHeader(response);
    const assistant = await rpc<{ botId: string }>(cookie, "assistant/ensure", {});
    const bot =
      mode === "team"
        ? { id: assistant.botId }
        : await rpc<{ id: string }>(cookie, "bots/create", {
            name: "Private",
            computerMode: mode,
            notifyOnFinish: false,
          });
    return { cookie, botId: bot.id };
  }
  async function raw(cookie: string, proc: string, body: unknown) {
    return handles.app.request(`/rpc/${proc}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({ json: body }),
    });
  }
  async function rpc<T>(cookie: string, proc: string, body: unknown): Promise<T> {
    const response = await raw(cookie, proc, body);
    expect(response.status, proc).toBeLessThan(400);
    return ((await response.json()) as { json: T }).json;
  }
  async function send(
    fixture: { cookie: string; botId: string },
    text: string,
    artifactIds?: string[],
  ) {
    const sent = await rpc<{ runId: string }>(fixture.cookie, "threads/send", {
      botId: fixture.botId,
      text,
      artifactIds,
    });
    await expect
      .poll(
        async () =>
          (
            await handles.prisma.run.findUniqueOrThrow({
              where: { id: sent.runId },
            })
          ).status,
        { timeout: 15_000 },
      )
      .toBe("completed");
    return sent.runId;
  }

  it("onboarding and repeated passive reads allocate no sandbox", async () => {
    const count = provisions.mock.calls.length;
    const fixture = await account();
    for (let index = 0; index < 3; index++) {
      expect(
        await rpc<ComputerStatus>(fixture.cookie, "computer/status", {
          botId: fixture.botId,
        }),
      ).toMatchObject({ state: "stopped" });
      expect(
        await rpc(fixture.cookie, "computer/screenUrl", {
          botId: fixture.botId,
        }),
      ).toEqual({
        url: null,
      });
    }
    expect(provisions.mock.calls.length).toBe(count);
  });
  it.each([
    "Hi",
    "What is a computer?",
    "Explain how web browsers work",
    "What is my saved favorite color?",
  ])("%s keeps the computer stopped", async (prompt) => {
    const fixture = await account();
    const count = provisions.mock.calls.length;
    await send(fixture, prompt);
    expect(provisions.mock.calls.length).toBe(count);
    expect(
      await rpc<ComputerStatus>(fixture.cookie, "computer/status", {
        botId: fixture.botId,
      }),
    ).toMatchObject({ state: "stopped" });
  });
  it.each(["current", "earlier"])(
    "%s attached file is copied only at the authorized tool boundary",
    async (turn) => {
      const fixture = await account("dedicated");
      const artifact = await rpc<{ id: string }>(fixture.cookie, "artifacts/create", {
        botId: fixture.botId,
        name: "fixture.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("Fixture file contents").toString("base64"),
      });
      const count = provisions.mock.calls.length;
      if (turn === "earlier") {
        await send(fixture, "Keep this file for later", [artifact.id]);
        expect(provisions.mock.calls.length).toBe(count);
      }
      await send(fixture, "Inspect attached file", turn === "current" ? [artifact.id] : undefined);
      expect(provisions.mock.calls.length).toBe(count + 1);
    },
  );

  it("concurrent manual starts provision once; running reads do not replace it", async () => {
    const fixture = await account();
    const count = provisions.mock.calls.length;
    const starts = await Promise.all([
      raw(fixture.cookie, "computer/boot", { botId: fixture.botId }),
      raw(fixture.cookie, "computer/boot", { botId: fixture.botId }),
    ]);
    expect(starts.some((response) => response.ok)).toBe(true);
    expect(starts.every((response) => response.ok || response.status === 409)).toBe(true);
    expect(provisions.mock.calls.length).toBe(count + 1);
    expect(await rpc(fixture.cookie, "computer/screenUrl", { botId: fixture.botId })).toMatchObject(
      { url: expect.any(String) },
    );
    await rpc(fixture.cookie, "computer/boot", { botId: fixture.botId });
    expect(provisions.mock.calls.length).toBe(count + 1);
  });
  it.each(["team", "dedicated"] as const)(
    "%s computer starts for real filesystem work and releases demand",
    async (mode) => {
      const fixture = await account(mode);
      const count = provisions.mock.calls.length;
      const runId = await send(fixture, "write a file called notes/result.txt that says demand");
      expect(provisions.mock.calls.length).toBe(count + 1);
      const bot = await handles.prisma.bot.findUniqueOrThrow({
        where: { id: fixture.botId },
      });
      await expect
        .poll(
          async () =>
            await handles.prisma.computerExecutionLease.count({
              where: {
                computerId: bot.computerId!,
                expiresAt: { gt: new Date() },
              },
            }),
        )
        .toBe(0);
      const completed = await handles.prisma.run.findUniqueOrThrow({
        where: { id: runId },
      });
      const computer = await handles.prisma.computer.findUniqueOrThrow({
        where: { id: bot.computerId! },
      });
      expect(computer.lastUsedAt.getTime()).toBeGreaterThanOrEqual(
        completed.completedAt!.getTime(),
      );
    },
  );
  it("passive discovery of provider pause retains the ref and publishes the real UI state", async () => {
    const fixture = await account();
    await rpc(fixture.cookie, "computer/boot", { botId: fixture.botId });
    const before = await handles.prisma.bot.findUniqueOrThrow({
      where: { id: fixture.botId },
      include: { computer: true, thread: true },
    });
    const count = provisions.mock.calls.length;
    vi.spyOn(sandbox, "connectScreen").mockRejectedValueOnce(new ComputerSuspendedError());
    expect(await rpc(fixture.cookie, "computer/screenUrl", { botId: fixture.botId })).toEqual({
      url: null,
    });
    const after = await handles.prisma.computer.findUniqueOrThrow({
      where: { id: before.computerId! },
    });
    expect(after.state).toBe("suspended");
    expect(after.providerRef).toBe(before.computer!.providerRef);
    expect(provisions.mock.calls.length).toBe(count);
    expect(
      await handles.prisma.event.findFirst({
        where: { botId: fixture.botId, type: "computer.status" },
        orderBy: { seq: "desc" },
      }),
    ).toMatchObject({ payload: { status: "suspended" } });
  });

  it("idle E2B suspends despite a noncomputer run, then passive reads stay suspended", async () => {
    const fixture = await account("dedicated");
    await rpc(fixture.cookie, "computer/boot", { botId: fixture.botId });
    const bot = await handles.prisma.bot.findUniqueOrThrow({
      where: { id: fixture.botId },
      include: { thread: true },
    });
    const task = await handles.prisma.task.create({
      data: {
        botId: bot.id,
        threadId: bot.thread!.id,
        userId: bot.userId,
        spaceId: bot.spaceId,
        prompt: "Reasoning",
        status: "running",
      },
    });
    await handles.prisma.run.create({
      data: {
        botId: bot.id,
        threadId: bot.thread!.id,
        taskId: task.id,
        userId: bot.userId,
        spaceId: bot.spaceId,
        trigger: "user",
        status: "running",
        leaseOwner: "fixture-worker",
        leaseExpiresAt: new Date(Date.now() + 300_000),
      },
    });
    await handles.prisma.computer.update({
      where: { id: bot.computerId! },
      data: { kind: "e2b", lastUsedAt: new Date(Date.now() - 90_001) },
    });
    const count = provisions.mock.calls.length;
    await sleepComputerIfIdle(
      {
        prisma: handles.prisma,
        sandbox,
        home: new LocalAgentHomeStore(dataDir),
        jobs: handles.jobs,
        events: createThreadEvents(handles.prisma),
      },
      bot.computerId!,
    );
    expect(
      await rpc<ComputerStatus>(fixture.cookie, "computer/status", {
        botId: fixture.botId,
      }),
    ).toMatchObject({ state: "suspended" });
    expect(await rpc(fixture.cookie, "computer/screenUrl", { botId: fixture.botId })).toEqual({
      url: null,
    });
    expect(provisions.mock.calls.length).toBe(count);
    await handles.prisma.run.updateMany({
      where: { botId: bot.id, status: "running" },
      data: { status: "cancelled" },
    });
  });
  it.each(["team", "dedicated"] as const)(
    "%s waiting takeover can sleep and explicitly resume with its original run fence",
    async (mode) => {
      const fixture = await account(mode);
      await rpc(fixture.cookie, "computer/boot", { botId: fixture.botId });
      const bot = await handles.prisma.bot.findUniqueOrThrow({
        where: { id: fixture.botId },
        include: { thread: true, computer: true },
      });
      const task = await handles.prisma.task.create({
        data: {
          botId: bot.id,
          threadId: bot.thread!.id,
          userId: bot.userId,
          spaceId: bot.spaceId,
          prompt: "Human takeover requested",
          status: "waiting_takeover",
        },
      });
      const run = await handles.prisma.run.create({
        data: {
          botId: bot.id,
          threadId: bot.thread!.id,
          taskId: task.id,
          userId: bot.userId,
          spaceId: bot.spaceId,
          trigger: "user",
          status: "waiting_takeover",
        },
      });
      const held = await handles.prisma.computerExecutionLease.upsert({
        where: {
          computerId_botId: { computerId: bot.computerId!, botId: bot.id },
        },
        create: {
          computerId: bot.computerId!,
          botId: bot.id,
          runId: run.id,
          fence: 2,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        update: {
          runId: run.id,
          fence: { increment: 1 },
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await handles.prisma.computer.update({
        where: { id: bot.computerId! },
        data: { lastUsedAt: new Date(Date.now() - 300_001) },
      });
      await sleepComputerIfIdle(
        {
          prisma: handles.prisma,
          sandbox,
          home: new LocalAgentHomeStore(dataDir),
          jobs: handles.jobs,
          events: createThreadEvents(handles.prisma),
        },
        bot.computerId!,
      );
      expect(await rpc(fixture.cookie, "computer/status", { botId: bot.id })).toMatchObject({
        state: "suspended",
      });
      const count = provisions.mock.calls.length;
      expect(await rpc(fixture.cookie, "computer/boot", { botId: bot.id })).toMatchObject({
        state: "running",
      });
      expect(provisions.mock.calls.length).toBe(count + 1);
      expect(
        await handles.prisma.computerExecutionLease.findUniqueOrThrow({
          where: { id: held.id },
        }),
      ).toMatchObject({
        runId: run.id,
        fence: held.fence,
        expiresAt: held.expiresAt,
      });
      await rpc(fixture.cookie, "computer/takeover", { botId: bot.id });
      expect(
        await handles.prisma.computer.findUniqueOrThrow({
          where: { id: bot.computerId! },
        }),
      ).toMatchObject({ controlHolder: "user", controlRunId: run.id });
      await handles.prisma.run.update({
        where: { id: run.id },
        data: { status: "cancelled" },
      });
    },
  );

  it("the optional active fleet fuse counts a Team Computer once and rejects another startup", async () => {
    const fixture = await account();
    await rpc(fixture.cookie, "computer/boot", { botId: fixture.botId });
    const privateBot = await rpc<{ id: string }>(fixture.cookie, "bots/create", {
      name: "Private Capacity",
      computerMode: "dedicated",
      notifyOnFinish: false,
    });
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", "1");
    try {
      const count = provisions.mock.calls.length;
      expect((await raw(fixture.cookie, "computer/boot", { botId: privateBot.id })).status).toBe(
        409,
      );
      expect(provisions.mock.calls.length).toBe(count);
      await rpc(fixture.cookie, "computer/boot", { botId: fixture.botId });
      expect(provisions.mock.calls.length).toBe(count);
    } finally {
      vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", undefined);
    }
  });

  it("concurrent private starts cannot race the active fleet fuse", async () => {
    const fixture = await account();
    const bots = await Promise.all(
      ["First", "Second"].map((name) =>
        rpc<{ id: string }>(fixture.cookie, "bots/create", {
          name,
          computerMode: "dedicated",
          notifyOnFinish: false,
        }),
      ),
    );
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", "1");
    try {
      const count = provisions.mock.calls.length;
      const responses = await Promise.all(
        bots.map((bot) => raw(fixture.cookie, "computer/boot", { botId: bot.id })),
      );
      expect(responses.filter((response) => response.ok)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
      expect(provisions.mock.calls.length).toBe(count + 1);
    } finally {
      vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", undefined);
    }
  });

  it("foreign account reads and starts fail before provider access", async () => {
    const owner = await account();
    const foreign = await account();
    const count = provisions.mock.calls.length;
    for (const proc of ["computer/status", "computer/screenUrl", "computer/boot"]) {
      expect(
        (await raw(foreign.cookie, proc, { botId: owner.botId })).status,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(provisions.mock.calls.length).toBe(count);
  });
});
