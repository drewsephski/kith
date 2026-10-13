import { randomUUID } from "node:crypto";
import type { Actor, MessageBlock } from "@rakazo/contracts";
import { BOT_NAME_MAX_LENGTH } from "@rakazo/contracts";
import {
  ASSISTANT_FOCUS_QUESTION,
  BOT_IDENTITY_PRESETS,
  BOT_IDENTITY_QUESTION,
} from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  BotCreationRequestUnavailableError,
  createDb,
  createRepos,
  createThreadEvents,
  createThreadMessage,
} from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseFocus,
  chooseIdentity,
  createConversationalBot,
  dismissFocus,
  promptFocus,
} from "./onboarding.js";
import { personalAssistantBotId } from "./personal-assistant.js";

const databaseSuite =
  process.env.VERIFY_DATABASE === "1" && process.env.DATABASE_URL
    ? describe.sequential
    : describe.skip;

databaseSuite("Conversational additional-bot onboarding (PostgreSQL, offline)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let actor: Actor;
  let events: ThreadEvents;
  const connectors = { managedProviders: () => [] } as never;
  const deps = () => ({ prisma, events, connectors });

  beforeAll(() => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
  });
  beforeEach(async () => {
    const id = `onboarding-${randomUUID()}`;
    actor = {
      spaceId: id,
      userId: `${id}-user`,
      email: `${id}@example.test`,
      isDeploymentOwner: false,
    };
    await prisma.user.create({ data: { id: actor.userId, email: actor.email, name: "Fixture" } });
    await prisma.organization.create({
      data: {
        id,
        name: "Fixture",
        slug: id,
        createdAt: new Date(),
        spaces: { create: { id, name: "Fixture" } },
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
        organizationId: id,
        spaceId: id,
        userId: actor.userId,
        role: "member",
        createdAt: new Date(),
      },
    });
    events = createThreadEvents(prisma);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.organization.deleteMany({ where: { id: actor.spaceId } });
    await prisma.user.deleteMany({ where: { id: actor.userId } });
  });
  afterAll(async () => close());

  const messages = (threadId: string) =>
    prisma.message.findMany({ where: { threadId }, orderBy: { seq: "asc" } });
  const create = (nonce = randomUUID()) => createConversationalBot(deps(), actor, nonce);
  const identityCard = async (threadId: string) => (await messages(threadId))[0]!;

  it("opens a durable identity conversation with four presets and no inference or computer startup", async () => {
    const bot = await create();
    expect(bot.name).toBe("New bot");
    const card = await identityCard(bot.threadId);
    expect(card.botId).toBe(bot.id);
    expect(card.blocks).toEqual([
      {
        kind: "choice",
        onboardingStage: "identity",
        question: BOT_IDENTITY_QUESTION,
        options: BOT_IDENTITY_PRESETS.map(({ id, name, role }) => ({
          id,
          letter: "",
          label: name,
          description: role,
        })),
      },
    ]);
    await Promise.all([
      promptFocus(deps(), actor, bot.id),
      dismissFocus(deps(), actor, bot.id),
      chooseFocus(deps(), actor, bot.id, "day"),
    ]);
    expect(await messages(bot.threadId)).toHaveLength(1);
    expect((await identityCard(bot.threadId)).blocks).toEqual(card.blocks);
    expect(await prisma.run.count({ where: { spaceId: actor.spaceId } })).toBe(0);
    expect(await prisma.task.count({ where: { spaceId: actor.spaceId } })).toBe(0);
    const computers = await prisma.computer.findMany({ where: { spaceId: actor.spaceId } });
    expect(computers.every((computer) => !computer.providerRef && !computer.executionRunId)).toBe(
      true,
    );
    const assistantId = await personalAssistantBotId(prisma, actor);
    expect(assistantId).not.toBe(bot.id);
    expect(await prisma.bot.findUnique({ where: { id: assistantId! } })).toMatchObject({
      name: "Kith",
    });
  });

  it.each(BOT_IDENTITY_PRESETS)(
    "saves $name identity and advances exactly once to focus",
    async (preset) => {
      const bot = await create();
      const card = await identityCard(bot.threadId);
      const updated = await chooseIdentity(deps(), actor, bot.id, card.id, { presetId: preset.id });
      expect(updated).toMatchObject({
        name: preset.name,
        title: preset.role,
        description: preset.description,
        instructions: preset.instructions,
        color: bot.color,
      });
      const after = await messages(bot.threadId);
      expect(after).toHaveLength(2);
      expect(after[0]!.blocks).toEqual([
        expect.objectContaining({ onboardingStage: "identity", answerId: preset.id }),
      ]);
      expect(after[1]!.blocks).toEqual([
        expect.objectContaining({
          onboardingStage: "focus",
          question: ASSISTANT_FOCUS_QUESTION,
          options: [
            expect.objectContaining({ id: "day", letter: "A" }),
            expect.objectContaining({ id: "inbox", letter: "B" }),
            expect.objectContaining({ id: "research", letter: "C" }),
            expect.objectContaining({ id: "everything", letter: "D" }),
          ],
        }),
      ]);
      await chooseFocus(deps(), actor, bot.id, "day");
      expect((await messages(bot.threadId))[1]!.blocks).toEqual([
        expect.objectContaining({ answerId: "day" }),
      ]);
      expect((await prisma.bot.findUniqueOrThrow({ where: { id: bot.id } })).name).toBe(
        preset.name,
      );
    },
  );

  it("persists explicit custom fields and preserves its selected card after reload", async () => {
    const bot = await create();
    const card = await identityCard(bot.threadId);
    const selected = { name: "  Sol  ", role: "  Writing partner  " };
    const updated = await chooseIdentity(deps(), actor, bot.id, card.id, selected);
    expect(updated).toMatchObject({
      name: "Sol",
      title: "Writing partner",
      description: "Sol helps with Writing partner.",
    });
    expect(updated.instructions).toContain("Your role is Writing partner.");
    const blocks = (await identityCard(bot.threadId)).blocks as MessageBlock[];
    expect(blocks).toEqual([
      expect.objectContaining({
        answerId: "custom",
        options: expect.arrayContaining([
          { id: "custom", letter: "", label: "Sol", description: "Writing partner" },
        ]),
      }),
    ]);
    await chooseIdentity(deps(), actor, bot.id, card.id, { name: "Other", role: "Other" });
    expect((await prisma.bot.findUniqueOrThrow({ where: { id: bot.id } })).name).toBe("Sol");
    expect(await messages(bot.threadId)).toHaveLength(2);
  });

  it("coalesces rapid concurrent device creates and remembers all nonces after setup and clear", async () => {
    const nonces = Array.from({ length: 6 }, () => randomUUID());
    const bots = await Promise.all(nonces.map((nonce) => create(nonce)));
    expect(new Set(bots.map((bot) => bot.id)).size).toBe(1);
    const bot = bots[0]!;
    const card = await identityCard(bot.threadId);
    await chooseIdentity(deps(), actor, bot.id, card.id, { presetId: "miso" });
    for (const nonce of nonces) expect((await create(nonce)).id).toBe(bot.id);
    await events.clearThread({ spaceId: actor.spaceId, threadId: bot.threadId, botId: bot.id });
    for (const nonce of nonces) expect((await create(nonce)).id).toBe(bot.id);
    expect(await messages(bot.threadId)).toHaveLength(0);
    expect(await prisma.botCreationRequest.count({ where: { botId: bot.id } })).toBe(6);
  });

  it("reconciles lost create and identity responses without duplicate effects", async () => {
    const nonce = randomUUID();
    vi.spyOn(events, "notify").mockRejectedValueOnce(new Error("Lost create response"));
    await expect(create(nonce)).rejects.toThrow("Lost create response");
    vi.restoreAllMocks();
    const bot = await create(nonce);
    const card = await identityCard(bot.threadId);
    vi.spyOn(events, "notify").mockRejectedValueOnce(new Error("Lost identity response"));
    await expect(
      chooseIdentity(deps(), actor, bot.id, card.id, { presetId: "orbit" }),
    ).rejects.toThrow("Lost identity response");
    vi.restoreAllMocks();
    await Promise.all([
      chooseIdentity(deps(), actor, bot.id, card.id, { presetId: "orbit" }),
      chooseIdentity(deps(), actor, bot.id, card.id, { presetId: "pixel" }),
    ]);
    expect(await messages(bot.threadId)).toHaveLength(2);
    expect((await prisma.bot.findUniqueOrThrow({ where: { id: bot.id } })).name).toBe("Orbit");
  });

  it("preserves an early user message and lets a later New intent create another bot", async () => {
    const nonce = randomUUID();
    const bot = await create(nonce);
    const card = await identityCard(bot.threadId);
    await createThreadMessage(prisma, {
      threadId: bot.threadId,
      role: "user",
      blocks: [{ kind: "text", text: "Help me plan today" }],
      clientNonce: "first-message",
    });
    const other = await create();
    expect(other.id).not.toBe(bot.id);
    expect((await create(nonce)).id).toBe(bot.id);
    await chooseIdentity(deps(), actor, bot.id, card.id, { presetId: "pippin" });
    const history = await messages(bot.threadId);
    expect(history).toHaveLength(2);
    expect(history[1]!.blocks).toEqual([{ kind: "text", text: "Help me plan today" }]);
    await promptFocus(deps(), actor, bot.id);
    expect(await messages(bot.threadId)).toHaveLength(2);
  });

  it("rejects wrong cards and account/Space scopes, leaving legacy and personal bots unchanged", async () => {
    const bot = await create();
    const card = await identityCard(bot.threadId);
    await expect(
      chooseIdentity(deps(), { ...actor, userId: "other-user" }, bot.id, card.id, {
        presetId: "pixel",
      }),
    ).rejects.toThrow();
    await expect(
      chooseIdentity(deps(), { ...actor, spaceId: "other-space" }, bot.id, card.id, {
        presetId: "pixel",
      }),
    ).rejects.toThrow();
    const personalId = await personalAssistantBotId(prisma, actor);
    await expect(
      chooseIdentity(deps(), actor, personalId!, card.id, { presetId: "pixel" }),
    ).rejects.toThrow();
    const legacy = await createRepos(prisma).createBot(actor, {
      name: "Existing",
      title: "Existing role",
      description: "Keep",
      instructions: "Keep",
      notifyOnFinish: true,
    });
    await expect(
      chooseIdentity(deps(), actor, legacy.id, card.id, { presetId: "pixel" }),
    ).rejects.toThrow();
    expect((await prisma.bot.findUniqueOrThrow({ where: { id: legacy.id } })).name).toBe(
      "Existing",
    );
    expect((await prisma.bot.findUniqueOrThrow({ where: { id: personalId! } })).name).toBe("Kith");
    const otherId = `scope-fixture-${randomUUID()}`;
    await prisma.user.create({
      data: { id: otherId, email: `${otherId}@example.test`, name: "Other" },
    });
    try {
      await expect(
        prisma.botCreationRequest.create({
          data: {
            spaceId: actor.spaceId,
            userId: otherId,
            botId: bot.id,
            requestKey: "invalid-scope",
          },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.user.delete({ where: { id: otherId } });
    }
  });

  it("rejects invalid custom names and roles without stage changes", async () => {
    const bot = await create();
    const card = await identityCard(bot.threadId);
    for (const identity of [
      { name: " ", role: "Writer" },
      { name: "Writer", role: " " },
      { name: "x".repeat(BOT_NAME_MAX_LENGTH + 1), role: "Writer" },
    ]) {
      await expect(chooseIdentity(deps(), actor, bot.id, card.id, identity)).rejects.toThrow();
    }
    expect(await messages(bot.threadId)).toHaveLength(1);
  });

  it("retains creation tombstones so archived and deleted requests cannot create replacement bots", async () => {
    const nonce = randomUUID();
    const bot = await create(nonce);
    await prisma.bot.update({ where: { id: bot.id }, data: { archivedAt: new Date() } });
    await expect(create(nonce)).rejects.toBeInstanceOf(BotCreationRequestUnavailableError);
    await prisma.bot.delete({ where: { id: bot.id } });
    expect(
      await prisma.botCreationRequest.findFirst({ where: { spaceId: actor.spaceId } }),
    ).toMatchObject({ botId: null });
    await expect(create(nonce)).rejects.toBeInstanceOf(BotCreationRequestUnavailableError);
    expect(await prisma.bot.count({ where: { spaceId: actor.spaceId } })).toBe(1);
  });

  it("deletes creation aliases and tombstones with their account while a shared Space survives", async () => {
    const otherId = `shared-member-${randomUUID()}`;
    await prisma.user.create({
      data: { id: otherId, email: `${otherId}@example.test`, name: "Other member" },
    });
    await prisma.member.create({
      data: {
        id: `${otherId}-member`,
        organizationId: actor.spaceId,
        userId: otherId,
        role: "member",
        createdAt: new Date(),
      },
    });
    await prisma.spaceMember.create({
      data: {
        id: `${otherId}-space-member`,
        organizationId: actor.spaceId,
        spaceId: actor.spaceId,
        userId: otherId,
        role: "member",
        createdAt: new Date(),
      },
    });
    try {
      const active = await create();
      const card = await identityCard(active.threadId);
      await chooseIdentity(deps(), actor, active.id, card.id, { presetId: "miso" });
      const deleted = await create();
      await prisma.bot.delete({ where: { id: deleted.id } });
      expect(await prisma.botCreationRequest.count({ where: { userId: actor.userId } })).toBe(2);
      expect(
        await prisma.botCreationRequest.findFirst({ where: { userId: actor.userId, botId: null } }),
      ).not.toBeNull();
      await prisma.user.delete({ where: { id: actor.userId } });
      expect(await prisma.space.findUnique({ where: { id: actor.spaceId } })).not.toBeNull();
      expect(
        await prisma.spaceMember.findFirst({ where: { spaceId: actor.spaceId, userId: otherId } }),
      ).not.toBeNull();
      expect(await prisma.botCreationRequest.count({ where: { userId: actor.userId } })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { id: otherId } });
    }
  });
});
