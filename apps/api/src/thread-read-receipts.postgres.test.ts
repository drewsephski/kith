import { randomUUID } from "node:crypto";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDb, createThreadEvents, loadRunHistoryMessages } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveThreadTarget, sendThreadMessage, threadSnapshot } from "./thread-target.js";

const databaseSuite =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;

databaseSuite("Message read receipts (PostgreSQL, offline)", () => {
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

  it("keeps accepted input unread until worker consumption, then preserves Read on reload", async () => {
    const target = await resolveThreadTarget(prisma, actor, { botId });
    const events = createThreadEvents(prisma);
    const enqueue = vi.fn(async () => {
      const snapshot = await threadSnapshot({ prisma }, target);
      expect(snapshot.run?.status).toBe("queued");
      expect(snapshot.messages.map((message) => message.role)).toEqual(["user"]);
      expect(snapshot.messages[0]?.readAt).toBeUndefined();
      throw new Error("Queue unavailable");
    });
    const sent = await sendThreadMessage(
      { prisma, events, jobs: { enqueue } as unknown as JobPublisher },
      actor,
      target,
      {
        text: "Plan my week",
        clientNonce: "request-1",
      },
    );
    expect(enqueue).toHaveBeenCalledOnce();
    const sentMessage = await prisma.message.findFirstOrThrow({
      where: { threadId: target.threadId, seq: sent.seq },
    });
    const history = await loadRunHistoryMessages(
      prisma,
      { id: sent.runId, threadId: target.threadId },
      40,
    );
    expect(history.map((message) => message.role)).toEqual(["user"]);
    await events.append({
      spaceId: actor.spaceId,
      threadId: target.threadId,
      botId,
      runId: sent.runId,
      type: "run.started",
      payload: { readMessageIds: [sentMessage.id] },
    });
    const reloaded = await threadSnapshot({ prisma }, target);
    expect(reloaded.messages).toHaveLength(1);
    expect(reloaded.messages[0]?.readAt).toEqual(expect.any(String));
    expect((await prisma.thread.findUniqueOrThrow({ where: { id: target.threadId } })).unread).toBe(
      false,
    );
    const committed = await prisma.event.findMany({
      where: { threadId: target.threadId },
      orderBy: { seq: "asc" },
    });
    expect(committed.map((event) => event.type)).toEqual(["thread.message.created", "run.started"]);
    expect(committed[1]?.payload).toMatchObject({
      readMessageIds: [sentMessage.id],
      readAt: reloaded.messages[0]?.readAt,
    });
  });

  it("deduplicates sends and reads follow-up messages only when the fenced worker claims them", async () => {
    const target = await resolveThreadTarget(prisma, actor, { botId });
    const events = createThreadEvents(prisma);
    const deps = {
      prisma,
      events,
      jobs: { enqueue: vi.fn(async () => undefined) } as unknown as JobPublisher,
    };
    const input = { text: "Plan my week", clientNonce: "request-1" };
    const [first, second] = await Promise.all([
      sendThreadMessage(deps, actor, target, input),
      sendThreadMessage(deps, actor, target, input),
    ]);
    expect(second).toEqual(first);
    expect(await prisma.message.count({ where: { threadId: target.threadId } })).toBe(1);
    const update = await sendThreadMessage(deps, actor, target, {
      text: "Keep Friday free",
      clientNonce: "request-2",
    });
    expect(update.runId).toBe(first.runId);
    const firstMessage = await prisma.message.findFirstOrThrow({
      where: { threadId: target.threadId, seq: first.seq },
    });
    const updateMessage = await prisma.message.findFirstOrThrow({
      where: { threadId: target.threadId, seq: update.seq },
    });
    await prisma.run.update({
      where: { id: first.runId },
      data: { status: "running", startedAt: new Date(), leaseOwner: "worker", leaseFence: 1 },
    });
    await events.append({
      spaceId: actor.spaceId,
      threadId: target.threadId,
      botId,
      runId: first.runId,
      type: "run.started",
      payload: { readMessageIds: [firstMessage.id] },
    });
    const started = await threadSnapshot({ prisma }, target);
    expect(started.messages[0]?.readAt).toEqual(expect.any(String));
    expect(started.messages[1]?.readAt).toBeUndefined();
    const claim = {
      threadId: target.threadId,
      botId,
      runId: first.runId,
      leaseOwner: "worker",
      leaseFence: 1,
      seenIds: [],
    };
    expect(await events.claimSteering({ ...claim, leaseFence: 2 })).toEqual([]);
    const consumed = await events.claimSteering(claim);
    expect(consumed.map((message) => message.messageId)).toEqual([updateMessage.id]);
    expect(consumed[0]?.claimedAt).toBeUndefined();
    const read = await threadSnapshot({ prisma }, target);
    expect(read.messages[1]?.readAt).toEqual(expect.any(String));
    const savedClaim = await prisma.steeringMessage.findUniqueOrThrow({
      where: { id: consumed[0]!.id },
    });
    const replayed = await events.claimSteering(claim);
    expect(replayed[0]?.claimedAt).toEqual(savedClaim.claimedAt);
    expect(
      await prisma.event.count({
        where: { threadId: target.threadId, type: "thread.message.read" },
      }),
    ).toBe(1);
    expect((await threadSnapshot({ prisma }, target)).messages[1]?.readAt).toBe(
      read.messages[1]?.readAt,
    );
    await prisma.run.update({
      where: { id: first.runId },
      data: { status: "failed", error: "Provider unavailable" },
    });
    expect(
      (await threadSnapshot({ prisma }, target)).messages.map((message) => message.readAt),
    ).toEqual(read.messages.map((message) => message.readAt));
  });
});
