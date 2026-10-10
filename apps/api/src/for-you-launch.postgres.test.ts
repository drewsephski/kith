import { randomUUID } from "node:crypto";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDb } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { launchForYou } from "./for-you-launch.js";

const databaseSuite =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;

databaseSuite("For you durable launch (PostgreSQL, offline)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let actor: Actor;
  let assistantId: string;
  let jobs: JobPublisher;
  let input: Parameters<typeof launchForYou>[2];

  beforeAll(() => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const id = `for-you-test-${randomUUID()}`;
    actor = { spaceId: id, userId: `${id}-user` };
    assistantId = `${id}-assistant`;
    await prisma.user.create({
      data: { id: actor.userId, email: `${id}@example.test`, name: "Test" },
    });
    await prisma.organization.create({
      data: {
        id,
        name: "Test",
        slug: id,
        createdAt: new Date(),
        spaces: {
          create: {
            id,
            name: "Test",
            bots: {
              create: {
                id: assistantId,
                userId: actor.userId,
                name: "Assistant",
                color: "ink",
                thread: { create: { spaceId: id, userId: actor.userId } },
              },
            },
          },
        },
      },
    });
    await prisma.member.create({
      data: {
        id: `${id}-organization-member`,
        organizationId: id,
        userId: actor.userId,
        role: "member",
        createdAt: new Date(),
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${id}-member`,
        spaceId: id,
        organizationId: id,
        userId: actor.userId,
        role: "member",
        createdAt: new Date(),
      },
    });
    jobs = {
      enqueue: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    input = { ...actor, assistantId, suggestionId: "weekly-plan", operationId: randomUUID() };
  });
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: actor.spaceId } });
    await prisma.user.deleteMany({
      where: { id: { in: [actor.userId, `${actor.userId}-other`] } },
    });
  });
  afterAll(async () => {
    await close?.();
  });

  async function counts() {
    return {
      bots: await prisma.bot.count({ where: { spaceId: actor.spaceId, parentBotId: assistantId } }),
      messages: await prisma.message.count({
        where: { thread: { spaceId: actor.spaceId }, role: "user" },
      }),
      tasks: await prisma.task.count({ where: { spaceId: actor.spaceId } }),
      runs: await prisma.run.count({ where: { spaceId: actor.spaceId } }),
    };
  }

  it("uses only the actor's connected inbox accounts and preserves their prompt on retry", async () => {
    await prisma.connection.createMany({
      data: [
        {
          id: `${actor.spaceId}-mail`,
          spaceId: actor.spaceId,
          userId: actor.userId,
          connectorId: "composio",
          provider: "gmail",
          displayName: "Work inbox",
          status: "connected",
        },
        {
          id: `${actor.spaceId}-revoked`,
          spaceId: actor.spaceId,
          userId: actor.userId,
          connectorId: "composio",
          provider: "gmail",
          displayName: "Revoked inbox",
          status: "revoked",
        },
        {
          id: `${actor.spaceId}-github`,
          spaceId: actor.spaceId,
          userId: actor.userId,
          connectorId: "composio",
          provider: "github",
          displayName: "Repositories",
          status: "connected",
        },
      ],
    });
    const otherUserId = `${actor.userId}-other`;
    await prisma.user.create({
      data: { id: otherUserId, email: `${otherUserId}@example.test`, name: "Other" },
    });
    await prisma.connection.create({
      data: {
        id: `${actor.spaceId}-other`,
        spaceId: actor.spaceId,
        userId: otherUserId,
        connectorId: "composio",
        provider: "gmail",
        displayName: "Other inbox",
        status: "connected",
      },
    });
    const launch = { ...input, suggestionId: "important-replies" };
    const bot = await launchForYou({ prisma, jobs }, actor, launch);
    const before = await prisma.task.findFirstOrThrow({ where: { botId: bot.id } });
    expect(before.prompt).toContain('"label":"Work inbox"');
    expect(before.prompt).not.toContain("Revoked inbox");
    expect(before.prompt).not.toContain("Other inbox");
    expect(before.prompt).not.toContain("Repositories");
    await prisma.connection.update({
      where: { id: `${actor.spaceId}-mail` },
      data: { status: "revoked" },
    });
    expect((await launchForYou({ prisma, jobs }, actor, launch)).id).toBe(bot.id);
    const after = await prisma.task.findFirstOrThrow({ where: { botId: bot.id } });
    expect(after.prompt).toBe(before.prompt);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
  });

  it("commits exactly one conversation and initial task under concurrent double-clicks", async () => {
    const bots = await Promise.all(
      Array.from({ length: 4 }, () => launchForYou({ prisma, jobs }, actor, input)),
    );
    expect(new Set(bots.map((bot) => bot.id)).size).toBe(1);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
    const run = await prisma.run.findFirstOrThrow({
      where: { spaceId: actor.spaceId },
      include: { task: true },
    });
    const message = await prisma.message.findUniqueOrThrow({ where: { id: run.sourceMessageId! } });
    expect(message.runId).toBe(run.id);
    expect(run.task?.prompt).toContain("week ahead");
  });

  it("recovers a lost response after reload without duplicating work and permits intentional repetition", async () => {
    const original = await launchForYou({ prisma, jobs }, actor, input);
    const reloaded = await launchForYou({ prisma, jobs }, actor, { ...input });
    expect(reloaded.id).toBe(original.id);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
    const repeated = await launchForYou({ prisma, jobs }, actor, {
      ...input,
      operationId: randomUUID(),
    });
    expect(repeated.id).not.toBe(original.id);
    expect(await counts()).toEqual({ bots: 2, messages: 2, tasks: 2, runs: 2 });
  });

  it("keeps queued work recoverable after a post-commit publisher failure", async () => {
    vi.mocked(jobs.enqueue).mockRejectedValueOnce(new Error("offline publisher"));
    const first = await launchForYou({ prisma, jobs }, actor, input);
    expect(await prisma.run.findFirst({ where: { botId: first.id } })).toMatchObject({
      status: "queued",
    });
    await launchForYou({ prisma, jobs }, actor, input);
    expect(jobs.enqueue).toHaveBeenCalledTimes(2);
    expect(vi.mocked(jobs.enqueue).mock.calls[0]).toEqual(vi.mocked(jobs.enqueue).mock.calls[1]);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
  });

  it("rolls back the entire launch when creating the initial run fails", async () => {
    const broken = prisma.$extends({
      query: {
        run: {
          create: async () => {
            throw new Error("injected failure");
          },
        },
      },
    });
    await expect(
      launchForYou({ prisma: broken as unknown as PrismaClient, jobs }, actor, input),
    ).rejects.toThrow("injected failure");
    expect(await counts()).toEqual({ bots: 0, messages: 0, tasks: 0, runs: 0 });
    await launchForYou({ prisma, jobs }, actor, input);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
  });

  it.each(["userId", "spaceId", "assistantId"] as const)(
    "rejects a stale %s before creating content",
    async (field) => {
      await expect(
        launchForYou({ prisma, jobs }, actor, { ...input, [field]: "other" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await counts()).toEqual({ bots: 0, messages: 0, tasks: 0, runs: 0 });
    },
  );

  it("binds concurrent reused operation identities to one immutable suggestion", async () => {
    const results = await Promise.allSettled([
      launchForYou({ prisma, jobs }, actor, input),
      launchForYou({ prisma, jobs }, actor, { ...input, suggestionId: "meeting-brief" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
  });

  it("preserves recovery after the user renames the launched conversation", async () => {
    const bot = await launchForYou({ prisma, jobs }, actor, input);
    await prisma.bot.update({ where: { id: bot.id }, data: { name: "My weekly plan" } });
    expect((await launchForYou({ prisma, jobs }, actor, input)).id).toBe(bot.id);
  });

  it("scopes the same operation identity independently to each authorized space", async () => {
    const otherSpaceId = `${actor.spaceId}-other`;
    const otherAssistantId = `${assistantId}-other`;
    await prisma.space.create({
      data: {
        id: otherSpaceId,
        organizationId: actor.spaceId,
        name: "Other",
        bots: {
          create: {
            id: otherAssistantId,
            userId: actor.userId,
            name: "Assistant",
            color: "ink",
            thread: { create: { spaceId: otherSpaceId, userId: actor.userId } },
          },
        },
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${otherSpaceId}-member`,
        spaceId: otherSpaceId,
        organizationId: actor.spaceId,
        userId: actor.userId,
        role: "member",
        createdAt: new Date(),
      },
    });
    const first = await launchForYou({ prisma, jobs }, actor, input);
    const second = await launchForYou(
      { prisma, jobs },
      { ...actor, spaceId: otherSpaceId },
      { ...input, spaceId: otherSpaceId, assistantId: otherAssistantId },
    );
    expect(second.id).not.toBe(first.id);
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
    expect(await prisma.run.count({ where: { spaceId: otherSpaceId } })).toBe(1);
  });

  it("scopes the same operation independently to users sharing a space", async () => {
    const otherUserId = `${actor.userId}-other`;
    const otherAssistantId = `${assistantId}-other`;
    await prisma.user.create({
      data: { id: otherUserId, email: `${otherUserId}@example.test`, name: "Other" },
    });
    await prisma.member.create({
      data: {
        id: `${otherUserId}-organization-member`,
        organizationId: actor.spaceId,
        userId: otherUserId,
        role: "member",
        createdAt: new Date(),
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${otherUserId}-member`,
        spaceId: actor.spaceId,
        organizationId: actor.spaceId,
        userId: otherUserId,
        role: "member",
        createdAt: new Date(),
      },
    });
    await prisma.bot.create({
      data: {
        id: otherAssistantId,
        userId: otherUserId,
        spaceId: actor.spaceId,
        name: "Assistant",
        color: "ink",
        thread: { create: { spaceId: actor.spaceId, userId: otherUserId } },
      },
    });
    const first = await launchForYou({ prisma, jobs }, actor, input);
    const second = await launchForYou(
      { prisma, jobs },
      { userId: otherUserId, spaceId: actor.spaceId },
      { ...input, userId: otherUserId, assistantId: otherAssistantId },
    );
    expect(second.id).not.toBe(first.id);
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId, userId: otherUserId } })).toBe(
      1,
    );
    await expect(
      launchForYou(
        { prisma, jobs },
        { userId: otherUserId, spaceId: actor.spaceId },
        { ...input, userId: otherUserId },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not revive archived conversations on an old retry", async () => {
    const bot = await launchForYou({ prisma, jobs }, actor, input);
    await prisma.bot.update({ where: { id: bot.id }, data: { archivedAt: new Date() } });
    await expect(launchForYou({ prisma, jobs }, actor, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await counts()).toEqual({ bots: 1, messages: 1, tasks: 1, runs: 1 });
  });
});
