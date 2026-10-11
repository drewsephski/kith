import { randomUUID } from "node:crypto";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDb, createThreadEvents, loadRunHistoryMessages } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveThreadTarget, sendThreadMessage, threadSnapshot } from "./thread-target.js";

const databaseSuite =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;

databaseSuite("Immediate task receipts (PostgreSQL, offline)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let actor: Actor;
  let botId: string;

  beforeAll(() => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const id = `receipt-test-${randomUUID()}`;
    actor = {
      spaceId: id,
      userId: `${id}-user`,
      email: `${id}@example.test`,
      isDeploymentOwner: false,
    };
    botId = `${id}-bot`;
    await prisma.user.create({ data: { id: actor.userId, email: actor.email, name: "Test" } });
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
                id: botId,
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
  });
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: actor.spaceId } });
    await prisma.user.deleteMany({ where: { id: actor.userId } });
  });
  afterAll(async () => {
    await close?.();
  });

  it("commits a quiet acknowledgment before enqueue, preserves it on reload, and excludes it from model history", async () => {
    const target = await resolveThreadTarget(prisma, actor, { botId });
    const enqueue = vi.fn(async () => {
      const snapshot = await threadSnapshot({ prisma }, target);
      expect(snapshot.run?.status).toBe("queued");
      expect(snapshot.messages.map((message) => message.role)).toEqual(["user", "bot"]);
      expect(snapshot.messages[1]?.blocks).toEqual([
        {
          kind: "progress",
          acknowledgment: true,
          text: "Got it — I’ll look into your request:\n\n> Plan my week",
        },
      ]);
      expect(
        (await prisma.thread.findUniqueOrThrow({ where: { id: target.threadId } })).unread,
      ).toBe(false);
      // Failure to wake the worker does not undo accepted input; reconciliation can recover it.
      throw new Error("Queue unavailable");
    });
    const deps = {
      prisma,
      events: createThreadEvents(prisma),
      jobs: { enqueue } as unknown as JobPublisher,
    };
    const sent = await sendThreadMessage(deps, actor, target, {
      text: "Plan my week",
      clientNonce: "request-1",
    });
    expect(enqueue).toHaveBeenCalledOnce();
    const history = await loadRunHistoryMessages(
      prisma,
      { id: sent.runId, threadId: target.threadId },
      40,
    );
    expect(history.map((message) => message.role)).toEqual(["user"]);
    const events = await prisma.event.findMany({
      where: { threadId: target.threadId },
      orderBy: { seq: "asc" },
    });
    expect(events.map((event) => event.type)).toEqual([
      "thread.message.created",
      "thread.message.created",
    ]);
    expect(events[1]?.payload).toMatchObject({ acknowledgment: true, role: "bot" });
  });

  it("deduplicates concurrent retries and accepts steering without creating another run", async () => {
    const target = await resolveThreadTarget(prisma, actor, { botId });
    const deps = {
      prisma,
      events: createThreadEvents(prisma),
      jobs: { enqueue: vi.fn(async () => undefined) } as unknown as JobPublisher,
    };
    const input = { text: "Plan my week", clientNonce: "request-1" };
    const [first, second] = await Promise.all([
      sendThreadMessage(deps, actor, target, input),
      sendThreadMessage(deps, actor, target, input),
    ]);
    expect(second).toEqual(first);
    expect(await prisma.message.count({ where: { threadId: target.threadId } })).toBe(2);
    const update = await sendThreadMessage(deps, actor, target, {
      text: "Keep Friday free",
      clientNonce: "request-2",
    });
    expect(update.runId).toBe(first.runId);
    expect(await prisma.run.count({ where: { threadId: target.threadId } })).toBe(1);
    expect(await prisma.message.count({ where: { threadId: target.threadId } })).toBe(4);
    expect(await prisma.steeringMessage.count({ where: { runId: first.runId } })).toBe(1);
    await prisma.run.update({
      where: { id: first.runId },
      data: { status: "failed", error: "Provider unavailable" },
    });
    const reloaded = await threadSnapshot({ prisma }, target);
    expect(reloaded.run?.status).toBe("failed");
    expect(reloaded.messages).toHaveLength(4);
  });
});
