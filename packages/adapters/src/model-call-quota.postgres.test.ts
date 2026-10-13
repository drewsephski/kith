import { randomUUID } from "node:crypto";
import type { AdapterContext, AgentRunRequest } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import {
  assertRunCreationQuota,
  clearThread,
  createDb,
  finalizeRun,
  runConcurrencyAvailable,
  sendUserMessage,
} from "@rakazo/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createModelCallQuotaObserver } from "./model-call-quota.js";

const suite =
  process.env.VERIFY_DATABASE === "1" && process.env.DATABASE_URL
    ? describe.sequential
    : describe.skip;
suite("managed execution admission (PostgreSQL)", () => {
  const suffix = randomUUID();
  const userId = `quota-user-${suffix}`;
  const otherUserId = `quota-other-${suffix}`;
  const orgId = `quota-org-${suffix}`;
  const spaces = [`quota-space-a-${suffix}`, `quota-space-b-${suffix}`];
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  const request = {
    runId: `quota-child-${suffix}`,
    rootRunId: `quota-root-${suffix}`,
  } as AgentRunRequest;
  const call = {
    provider: "openrouter",
    modelId: "openai/gpt-6-luna",
    fundingSource: "deployment" as const,
    inputTokensEstimate: 100,
    requestBytes: 512,
    textRequestBytes: 512,
    maxOutputTokens: 4096,
  };
  const observer = (spaceId = spaces[0]!, id = userId) =>
    createModelCallQuotaObserver(prisma, request, { userId: id, spaceId } as AdapterContext, {
      mode: "managed",
      billingRequired: false,
    })!;

  beforeAll(async () => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    const now = new Date();
    for (const id of [userId, otherUserId])
      await prisma.user.create({
        data: { id, name: "Quota fixture", email: `${id}@fixture.test` },
      });
    await prisma.organization.create({
      data: { id: orgId, name: "Quota fixture", slug: orgId, createdAt: now },
    });
    for (const id of [userId, otherUserId])
      await prisma.member.create({
        data: {
          id: `${id}-member`,
          userId: id,
          organizationId: orgId,
          role: "member",
          createdAt: now,
        },
      });
    for (const spaceId of spaces) {
      await prisma.space.create({
        data: { id: spaceId, organizationId: orgId, name: "Quota fixture" },
      });
      for (const id of [userId, otherUserId])
        await prisma.spaceMember.create({
          data: {
            id: `${spaceId}-${id}`,
            spaceId,
            userId: id,
            organizationId: orgId,
            createdAt: now,
          },
        });
    }
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (prisma) {
      await prisma.modelCallReservation.deleteMany({
        where: { userId: { in: [userId, otherUserId] } },
      });
      await prisma.bot.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await close();
  });

  it("serializes concurrent calls across Spaces and keeps failed/unknown attempts counted", async () => {
    vi.stubEnv("MAX_HOSTED_MODEL_CALLS_PER_USER_PER_DAY", "2");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => observer(spaces[i % 2]).beforeCall(call)),
    );
    const admitted = results.filter(
      (result): result is PromiseFulfilledResult<string> => result.status === "fulfilled",
    );
    expect(admitted).toHaveLength(2);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(6);
    await Promise.all(admitted.map((result) => observer().afterCall(result.value, null)));
    await expect(observer().beforeCall(call)).rejects.toThrow("Daily model limit");
    await expect(observer(spaces[0], otherUserId).beforeCall(call)).resolves.toEqual(
      expect.any(String),
    );
  });

  it("settlement is scoped, root quota survives retries, and expired concurrent slots recover", async () => {
    vi.stubEnv("MAX_HOSTED_MODEL_CALLS_PER_RUN", "2");
    vi.stubEnv("MAX_CONCURRENT_HOSTED_MODEL_CALLS_PER_USER", "1");
    const id = await observer().beforeCall(call);
    await observer(spaces[1]).afterCall(id, null);
    await expect(observer().beforeCall(call)).rejects.toThrow("Too many model");
    await prisma.modelCallReservation.update({ where: { id }, data: { expiresAt: new Date(0) } });
    const next = await observer(spaces[1]).beforeCall(call);
    await observer(spaces[1]).afterCall(next, null);
    await expect(observer().beforeCall(call)).rejects.toThrow("task reached");
    expect(
      await prisma.modelCallReservation.count({ where: { userId, runId: request.rootRunId } }),
    ).toBe(2);
  });

  async function botFixture() {
    const bot = await prisma.bot.create({
      data: { userId, spaceId: spaces[0]!, name: "Quota bot", color: "indigo" },
    });
    const thread = await prisma.thread.create({
      data: { botId: bot.id, userId, spaceId: spaces[0]! },
    });
    return { botId: bot.id, threadId: thread.id, spaceId: spaces[0]!, userId };
  }

  it("commits a result when a durable steering continuation reaches the daily cap", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    vi.stubEnv("MAX_RUNS_PER_USER_PER_DAY", "1");
    const target = await botFixture();
    const first = await sendUserMessage(prisma, {
      ...target,
      prompt: "First",
      blocks: [{ kind: "text", text: "First" }],
      trigger: "user",
      clientNonce: "quota-first",
    });
    const run = await prisma.run.update({
      where: { id: first.runId! },
      data: {
        status: "running",
        leaseOwner: "quota-worker",
        leaseFence: 1,
        startedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60000),
      },
    });
    const attempt = await prisma.attempt.create({
      data: { runId: run.id, fence: 1, status: "running" },
    });
    await sendUserMessage(prisma, {
      ...target,
      prompt: "Follow-up",
      blocks: [{ kind: "text", text: "Follow-up" }],
      trigger: "user",
      clientNonce: "quota-follow-up",
    });
    const result = await finalizeRun(prisma, {
      ...target,
      runId: run.id,
      taskId: run.taskId,
      attemptId: attempt.id,
      leaseOwner: "quota-worker",
      leaseFence: 1,
      outcome: "completed",
      blocks: [{ kind: "text", text: "Saved result" }],
    });
    expect(result).toEqual({ continuationRunId: null });
    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      "completed",
    );
    expect(await prisma.message.count({ where: { threadId: target.threadId, role: "bot" } })).toBe(
      1,
    );
    expect(
      await prisma.steeringMessage.count({ where: { botId: target.botId, runId: null } }),
    ).toBe(1);
    await expect(
      sendUserMessage(prisma, {
        ...target,
        prompt: "Retry",
        blocks: [{ kind: "text", text: "Retry" }],
        trigger: "user",
        clientNonce: "quota-first",
      }),
    ).resolves.toMatchObject({ runId: run.id });
  });

  it("clearing a conversation cannot clear its spend quota and cancellation remains effective", async () => {
    vi.stubEnv("MAX_HOSTED_MODEL_CALLS_PER_USER_PER_DAY", "1");
    const target = await botFixture();
    const send = await sendUserMessage(prisma, {
      ...target,
      prompt: "Cancel",
      blocks: [{ kind: "text", text: "Cancel" }],
      trigger: "user",
    });
    await observer().beforeCall(call);
    const cleared = await clearThread(prisma, target);
    expect(cleared.cancelledRunIds).toContain(send.runId);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: send.runId! } })).status).toBe(
      "cancelled",
    );
    await expect(observer().beforeCall(call)).rejects.toThrow("Daily model limit");
  });

  it("run creation serializes the last daily slot before work is enqueued", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    vi.stubEnv("MAX_RUNS_PER_USER_PER_DAY", "1");
    const targets = await Promise.all([botFixture(), botFixture()]);
    const results = await Promise.allSettled(
      targets.map((target) =>
        prisma.$transaction(async (tx) => {
          await assertRunCreationQuota(tx, userId);
          const task = await tx.task.create({
            data: { ...target, prompt: "Quota", status: "queued" },
          });
          return tx.run.create({
            data: { ...target, taskId: task.id, trigger: "user", status: "queued" },
          });
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("only live user leases consume running slots, across Spaces", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    const roots: string[] = [];
    for (let i = 0; i < 2; i++) {
      const target = await botFixture();
      const task = await prisma.task.create({
        data: { ...target, status: "running", prompt: "Lease fixture" },
      });
      const root = await prisma.run.create({
        data: {
          ...target,
          taskId: task.id,
          status: "running",
          trigger: "user",
          leaseExpiresAt: new Date(Date.now() + 60000),
        },
      });
      roots.push(root.id);
    }
    const available = (id: string) =>
      prisma.$transaction((tx) =>
        runConcurrencyAvailable(tx, { userId: id, runId: "unclaimed-fixture" }),
      );
    await expect(available(userId)).resolves.toBe(false);
    await expect(available(otherUserId)).resolves.toBe(true);
    await expect(
      prisma.$transaction((tx) =>
        runConcurrencyAvailable(tx, { userId, runId: "delegated-child", rootRunId: roots[0] }),
      ),
    ).resolves.toBe(true);
    await prisma.run.updateMany({ where: { userId }, data: { leaseExpiresAt: new Date(0) } });
    await expect(available(userId)).resolves.toBe(true);
  });

  it("Space deletion retains the user spend quota and account deletion erases receipts", async () => {
    vi.stubEnv("MAX_HOSTED_MODEL_CALLS_PER_USER_PER_DAY", "1");
    const spaceId = `quota-temporary-${suffix}`;
    await prisma.space.create({
      data: { id: spaceId, organizationId: orgId, name: "Temporary quota fixture" },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${spaceId}-member`,
        userId,
        spaceId,
        organizationId: orgId,
        createdAt: new Date(),
      },
    });
    const id = await observer(spaceId).beforeCall(call);
    await observer(spaceId).afterCall(id, null);
    await prisma.space.delete({ where: { id: spaceId } });
    expect(
      (await prisma.modelCallReservation.findUniqueOrThrow({ where: { id } })).spaceId,
    ).toBeNull();
    await expect(observer().beforeCall(call)).rejects.toThrow("Daily model limit");
    const transientUser = `quota-deleted-${suffix}`;
    await prisma.user.create({
      data: {
        id: transientUser,
        name: "Deleted quota fixture",
        email: `${transientUser}@fixture.test`,
      },
    });
    await prisma.member.create({
      data: {
        id: `${transientUser}-member`,
        userId: transientUser,
        organizationId: orgId,
        role: "member",
        createdAt: new Date(),
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${transientUser}-space-member`,
        userId: transientUser,
        spaceId: spaces[0]!,
        organizationId: orgId,
        createdAt: new Date(),
      },
    });
    await observer(spaces[0], transientUser).beforeCall(call);
    await prisma.user.delete({ where: { id: transientUser } });
    expect(await prisma.modelCallReservation.count({ where: { userId: transientUser } })).toBe(0);
  });
});
