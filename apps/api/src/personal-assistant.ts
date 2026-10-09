import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

/** Bind once, independently of mutable sidebar order, with the actor's scope. */
export async function personalAssistantBotId(
  prisma: PrismaClient,
  actor: Actor,
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const scope = `${actor.spaceId}:${actor.userId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('personal-assistant'), hashtext(${scope}))`;
    const where = { spaceId: actor.spaceId, userId: actor.userId, archivedAt: null };
    const binding = await tx.personalAssistant.findUnique({
      where: { spaceId_userId: { spaceId: actor.spaceId, userId: actor.userId } },
    });
    if (
      binding &&
      (await tx.bot.findFirst({ where: { ...where, id: binding.botId }, select: { id: true } }))
    ) {
      return binding.botId;
    }
    const bot = await tx.bot.findFirst({
      where: { ...where, OR: [{ pinned: true }, { parentBotId: null }] },
      orderBy: [{ pinned: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!bot) {
      if (binding)
        await tx.personalAssistant.delete({
          where: { spaceId_userId: { spaceId: actor.spaceId, userId: actor.userId } },
        });
      return null;
    }
    await tx.personalAssistant.upsert({
      where: { spaceId_userId: { spaceId: actor.spaceId, userId: actor.userId } },
      create: { spaceId: actor.spaceId, userId: actor.userId, botId: bot.id },
      update: { botId: bot.id },
    });
    return bot.id;
  });
}
