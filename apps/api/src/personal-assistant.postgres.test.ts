import { randomUUID } from "node:crypto";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDb, createRepos } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensurePersonalAssistant, personalAssistantBotId } from "./personal-assistant.js";

const databaseSuite =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;

databaseSuite("Personal assistant provisioning (PostgreSQL, offline)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let actor: Actor;
  beforeAll(() => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const id = `assistant-test-${randomUUID()}`;
    actor = {
      spaceId: id,
      userId: `${id}-user`,
      email: `${id}@example.test`,
      isDeploymentOwner: false,
    };
    await prisma.user.create({ data: { id: actor.userId, email: actor.email, name: "Test" } });
    await prisma.organization.create({
      data: {
        id,
        name: "Test",
        slug: id,
        createdAt: new Date(),
        spaces: { create: { id, name: "Test" } },
      },
    });
    await prisma.member.create({
      data: {
        id: `${id}-member`,
        organizationId: id,
        userId: actor.userId,
        role: "member",
        createdAt: new Date(),
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${id}-space-member`,
        spaceId: id,
        organizationId: id,
        userId: actor.userId,
        role: "member",
        createdAt: new Date(),
      },
    });
  });
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: actor.spaceId } });
    await prisma.user.deleteMany({ where: { id: actor.userId } });
  });
  afterAll(async () => close());
  const create = (input: Parameters<Parameters<typeof ensurePersonalAssistant>[2]>[0]) =>
    createRepos(prisma).createBot(actor, input);

  it("concurrent requests and lost-response retries reuse one assistant without starting work", async () => {
    const ids = await Promise.all(
      Array.from({ length: 6 }, () => ensurePersonalAssistant(prisma, actor, create)),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await ensurePersonalAssistant(prisma, actor, create)).toBe(ids[0]);
    expect(await prisma.bot.count({ where: { spaceId: actor.spaceId } })).toBe(1);
    expect(await prisma.personalAssistant.count({ where: { spaceId: actor.spaceId } })).toBe(1);
    expect((await prisma.bot.findUniqueOrThrow({ where: { id: ids[0] } })).pinned).toBe(true);
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId } })).toBe(0);
    expect(await prisma.task.count({ where: { spaceId: actor.spaceId } })).toBe(0);
  });
  it("preserves an explicit unpin on retry and leaves additional bots unpinned", async () => {
    const id = await ensurePersonalAssistant(prisma, actor, create);
    await prisma.bot.update({ where: { id }, data: { pinned: false } });
    const added = await create({
      name: "Added",
      title: "",
      description: "",
      instructions: "",
      computerMode: "team",
      notifyOnFinish: true,
      spawnKey: "added",
    });
    expect(added.pinned).toBe(false);
    expect(await ensurePersonalAssistant(prisma, actor, create)).toBe(id);
    expect((await prisma.bot.findUniqueOrThrow({ where: { id } })).pinned).toBe(false);
  });
  it("preserves an existing assistant instead of creating a replacement", async () => {
    const bot = await create({
      name: "Existing",
      title: "",
      description: "",
      instructions: "",
      computerMode: "team",
      notifyOnFinish: false,
      spawnKey: "existing",
    });
    const unexpected = vi.fn(create);
    expect(await ensurePersonalAssistant(prisma, actor, unexpected)).toBe(bot.id);
    expect(unexpected).not.toHaveBeenCalled();
  });
  it("replaces an archived assistant without rebinding to the archived conversation", async () => {
    const first = await ensurePersonalAssistant(prisma, actor, create);
    await prisma.bot.update({ where: { id: first }, data: { archivedAt: new Date() } });
    const replacement = await ensurePersonalAssistant(prisma, actor, create);
    expect(replacement).not.toBe(first);
    expect(await personalAssistantBotId(prisma, actor)).toBe(replacement);
    expect(await prisma.bot.count({ where: { spaceId: actor.spaceId, archivedAt: null } })).toBe(1);
  });
});
