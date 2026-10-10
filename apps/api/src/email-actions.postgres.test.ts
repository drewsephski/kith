import { randomUUID } from "node:crypto";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { Actor, EmailCard } from "@rakazo/contracts";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { createDb, createThreadMessage } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMessagePage } from "./thread-message-pages.js";
import type { ThreadTarget } from "./thread-target.js";
import { resolveThreadTarget, sendThreadMessage } from "./thread-target.js";

const databaseSuite =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;
const card: EmailCard = {
  kind: "email",
  mode: "draft",
  draftId: "offline-draft",
  provenance: "unverified",
  email: {
    account: "mail@example.test",
    to: ["recipient@example.test"],
    cc: [],
    bcc: [],
    subject: "Original",
    body: "Original body",
  },
};

databaseSuite("email action recovery (PostgreSQL, offline)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let actor: Actor;
  let target: ThreadTarget;
  let sourceId: string;
  let jobs: JobPublisher;
  const events = { notify: vi.fn(async () => undefined) } as unknown as ThreadEvents;
  beforeAll(() => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const id = `email-action-test-${randomUUID()}`;
    actor = { spaceId: id, userId: `${id}-user` };
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
                id: `${id}-bot`,
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
        id: `${id}-org-member`,
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
    target = await resolveThreadTarget(prisma, actor, { botId: `${id}-bot` });
    const source = await createThreadMessage(prisma, {
      threadId: target.threadId,
      role: "bot",
      botId: `${id}-bot`,
      blocks: [card],
    });
    sourceId = source.id;
    jobs = {
      enqueue: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
  });
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: actor.spaceId } });
    await prisma.user.deleteMany({ where: { id: actor.userId } });
  });
  afterAll(async () => {
    await close?.();
  });
  const send = (edits?: { subject: string; body: string }) =>
    sendThreadMessage({ prisma, jobs, events }, actor, target, {
      emailAction: { messageId: sourceId, blockIndex: 0, ...(edits ? { edits } : {}) },
    });

  it("collapses concurrent double clicks and reload of the original card after an edited request", async () => {
    const edits = { subject: "Accepted revision", body: "Reviewed edited body" };
    const results = await Promise.all(Array.from({ length: 4 }, () => send(edits)));
    expect(new Set(results.map((result) => result.runId)).size).toBe(1);
    const reloaded = await send();
    expect(reloaded.runId).toBe(results[0]?.runId);
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId } })).toBe(1);
    expect(await prisma.message.count({ where: { threadId: target.threadId, role: "user" } })).toBe(
      1,
    );
    const page = await loadMessagePage(prisma, target.threadId, undefined, 100);
    expect(page.messages.find((message) => message.id === sourceId)?.emailActions).toEqual([
      {
        blockIndex: 0,
        runId: reloaded.runId,
        status: "queued",
        email: { ...card.email, ...edits },
      },
    ]);
  });

  it("recovers after the durable commit succeeds but queue publication times out", async () => {
    vi.mocked(jobs.enqueue).mockRejectedValueOnce(new Error("Offline publication timeout"));
    // A missed queue wake does not undo the durable receipt; reload can safely
    // re-enqueue that same run while the existing reconciler also repairs it.
    const accepted = await send();
    expect((await send()).runId).toBe(accepted.runId);
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId } })).toBe(1);
    expect(jobs.enqueue).toHaveBeenCalledTimes(2);
  });

  it("shows provider confirmation and uncertain effects after fresh reads without replaying delivery", async () => {
    const result = await send();
    const effect = await prisma.externalEffect.create({
      data: {
        spaceId: actor.spaceId,
        runId: result.runId,
        kind: "GMAIL_SEND_DRAFT",
        idempotencyKey: randomUUID(),
        status: "executing",
        request: { draftId: card.draftId },
      },
    });
    await prisma.run.update({ where: { id: result.runId }, data: { status: "failed" } });
    let page = await loadMessagePage(prisma, target.threadId, undefined, 100);
    expect(
      page.messages.find((message) => message.id === sourceId)?.emailActions?.[0]?.status,
    ).toBe("uncertain");
    await prisma.externalEffect.update({
      where: { id: effect.id },
      data: { status: "completed", result: { emailSendVerified: true } },
    });
    page = await loadMessagePage(prisma, target.threadId, undefined, 100);
    expect(
      page.messages.find((message) => message.id === sourceId)?.emailActions?.[0]?.status,
    ).toBe("sent");
    expect((await send()).runId).toBe(result.runId);
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId } })).toBe(1);
  });

  it("rejects foreign user and space access before resolving a card", async () => {
    await expect(
      resolveThreadTarget(
        prisma,
        { ...actor, userId: "other-user" },
        { botId: target.kind === "bot" ? target.botId : "missing" },
      ),
    ).rejects.toThrow();
    await expect(
      resolveThreadTarget(
        prisma,
        { ...actor, spaceId: "other-space" },
        { botId: target.kind === "bot" ? target.botId : "missing" },
      ),
    ).rejects.toThrow();
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId } })).toBe(0);
  });
});
