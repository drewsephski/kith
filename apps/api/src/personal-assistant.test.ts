import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { personalAssistantBotId } from "./personal-assistant";

const actor: Actor = { userId: "user-1", spaceId: "space-1" };
function database() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    personalAssistant: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    bot: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    $transaction: async (run: (value: typeof tx) => Promise<string | null>) => run(tx),
  } as unknown as PrismaClient;
  return { tx, prisma };
}

describe("personal assistant binding", () => {
  it("reuses a valid binding without consulting mutable roster order", async () => {
    const { tx, prisma } = database();
    tx.personalAssistant.findUnique.mockResolvedValue({ botId: "primary" });
    tx.bot.findFirst.mockResolvedValue({ id: "primary" });
    expect(await personalAssistantBotId(prisma, actor)).toBe("primary");
    expect(tx.bot.findFirst).toHaveBeenCalledOnce();
    expect(tx.bot.findFirst).toHaveBeenCalledWith({
      where: { id: "primary", userId: actor.userId, spaceId: actor.spaceId, archivedAt: null },
      select: { id: true },
    });
    expect(tx.personalAssistant.upsert).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("prefers an owned pinned assistant or falls back to a root under a transaction lock", async () => {
    const { tx, prisma } = database();
    tx.bot.findFirst.mockResolvedValue({ id: "first-root" });
    expect(await personalAssistantBotId(prisma, actor)).toBe("first-root");
    expect(tx.bot.findFirst).toHaveBeenCalledWith({
      where: {
        userId: actor.userId,
        spaceId: actor.spaceId,
        archivedAt: null,
        OR: [{ pinned: true }, { parentBotId: null }],
      },
      select: { id: true },
      orderBy: [{ pinned: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    expect(tx.personalAssistant.upsert).toHaveBeenCalledWith({
      where: { spaceId_userId: actor },
      create: { ...actor, botId: "first-root" },
      update: { botId: "first-root" },
    });
  });

  it("rejects an archived or out-of-scope binding and replaces it", async () => {
    const { tx, prisma } = database();
    tx.personalAssistant.findUnique.mockResolvedValue({ botId: "foreign" });
    tx.bot.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "owned" });
    expect(await personalAssistantBotId(prisma, actor)).toBe("owned");
    expect(tx.personalAssistant.upsert).toHaveBeenCalled();
  });

  it("removes a stale binding when no available assistant remains", async () => {
    const { tx, prisma } = database();
    tx.personalAssistant.findUnique.mockResolvedValue({ botId: "archived" });
    expect(await personalAssistantBotId(prisma, actor)).toBeNull();
    expect(tx.personalAssistant.delete).toHaveBeenCalledWith({ where: { spaceId_userId: actor } });
    expect(tx.personalAssistant.upsert).not.toHaveBeenCalled();
  });
});
