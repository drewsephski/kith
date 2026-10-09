import type { ConnectorRegistry } from "@rakazo/adapters";
import type { Actor, MessageBlock } from "@rakazo/contracts";
import {
  ASSISTANT_FOCUS_OPTIONS,
  ASSISTANT_FOCUS_QUESTION,
  featuredConnectorProvidersMatch,
} from "@rakazo/core";
import type { Prisma, PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  appendEventInTransaction,
  createThreadMessageInTransaction,
  IsolationError,
} from "@rakazo/db";
import { requireBotThread, updateBlocks } from "./bot-thread.js";

/**
 * First-run conversational onboarding, seeded deterministically into the bot's
 * thread: greeting, a focus choice, and available app cards the user authorizes
 * inline. Focus must not rename the bot. No model tokens are spent.
 */

type OnboardingDeps = {
  prisma: PrismaClient;
  events: ThreadEvents;
  connectors: ConnectorRegistry;
};

/** Sentinel answerId for a focus card the user dismissed without choosing. */
export const FOCUS_DISMISSED_ANSWER_ID = "_dismissed";

export async function startOnboarding(
  deps: OnboardingDeps,
  actor: Actor,
  botId: string,
): Promise<void> {
  const { thread } = await requireBotThread(deps, actor, botId);
  const existing = await deps.prisma.message.count({ where: { threadId: thread.id } });
  if (existing > 0) return;
  // Fresh chats start empty (same as web). The focus card is posted later via
  // promptFocus so non-first bots can wait ~10s for free typing, or skip if the
  // user already engaged.
}

function messageHasChoice(blocks: MessageBlock[]): boolean {
  return blocks.some((block) => block.kind === "choice");
}

function messageHasPendingChoice(blocks: MessageBlock[]): boolean {
  return blocks.some((block) => block.kind === "choice" && !block.answerId);
}

export async function promptFocus(
  deps: OnboardingDeps,
  actor: Actor,
  botId: string,
): Promise<void> {
  const { bot, thread } = await requireBotThread(deps, actor, botId);
  const target = { spaceId: actor.spaceId, botId: bot.id, threadId: thread.id };
  const blocks: MessageBlock[] = [
    {
      kind: "choice",
      question: ASSISTANT_FOCUS_QUESTION,
      options: ASSISTANT_FOCUS_OPTIONS.map(({ id, letter, label }) => ({ id, letter, label })),
    },
  ];
  // Check + insert + event in one transaction so concurrent promptFocus calls
  // cannot duplicate cards, and a concurrent user send cannot publish first.
  const committed = await deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialize concurrent promptFocus callers on this thread before the gate check.
    await tx.$executeRaw`SELECT id FROM threads WHERE id = ${thread.id} FOR UPDATE`;
    const recent = await tx.message.findMany({
      where: { threadId: thread.id },
      select: { role: true, blocks: true },
      orderBy: { createdAt: "asc" },
    });
    if (recent.some((message) => message.role === "user")) return null;
    if (recent.some((message) => messageHasChoice(message.blocks as MessageBlock[]))) return null;
    const message = await createThreadMessageInTransaction(tx, {
      threadId: target.threadId,
      role: "bot",
      botId: target.botId,
      blocks,
    });
    const event = await appendEventInTransaction(tx, {
      spaceId: target.spaceId,
      threadId: target.threadId,
      botId: target.botId,
      type: "thread.message.created",
      payload: { messageId: message.id, role: "bot", blocks },
    });
    return { message, event };
  });
  if (!committed) return;
  await deps.events.notify(target.threadId, committed.event.seq);
}

export async function dismissFocus(
  deps: OnboardingDeps,
  actor: Actor,
  botId: string,
): Promise<void> {
  const { bot, thread } = await requireBotThread(deps, actor, botId);
  const target = { spaceId: actor.spaceId, botId: bot.id, threadId: thread.id };
  const claimed = await deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT id FROM threads WHERE id = ${thread.id} FOR UPDATE`;
    const recent = await tx.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });
    const pending = recent.find((message) =>
      messageHasPendingChoice(message.blocks as MessageBlock[]),
    );
    if (!pending) return null;
    const blocks = (pending.blocks as MessageBlock[]).map((block) =>
      block.kind === "choice" && !block.answerId
        ? { ...block, answerId: FOCUS_DISMISSED_ANSWER_ID }
        : block,
    );
    await tx.message.update({ where: { id: pending.id }, data: { blocks } });
    const event = await appendEventInTransaction(tx, {
      spaceId: target.spaceId,
      threadId: target.threadId,
      botId: target.botId,
      type: "thread.message.updated",
      payload: { messageId: pending.id, role: "bot", blocks },
    });
    return { messageId: pending.id, blocks, event };
  });
  if (!claimed) return;
  await deps.events.notify(target.threadId, claimed.event.seq);
}

export async function chooseFocus(
  deps: OnboardingDeps,
  actor: Actor,
  botId: string,
  optionId: string,
): Promise<void> {
  const option = ASSISTANT_FOCUS_OPTIONS.find((entry) => entry.id === optionId);
  if (!option) throw new IsolationError();
  const { bot, thread } = await requireBotThread(deps, actor, botId);
  const target = { spaceId: actor.spaceId, botId: bot.id, threadId: thread.id };
  // Resolve optional integration metadata before claiming the choice. Durable
  // answer and follow-up commit together, so a lost response is safe to retry.
  const catalog =
    option.id === "inbox"
      ? (
          await Promise.all(
            deps.connectors.managedProviders().map((provider) =>
              provider
                .catalog({
                  operationId: "onboarding.choose",
                  traceId: "onboarding.choose",
                  spaceId: actor.spaceId,
                  userId: actor.userId,
                  botId: bot.id,
                  signal: AbortSignal.timeout(15_000),
                })
                .catch(() => []),
            ),
          )
        ).flat()
      : [];
  const gmail = catalog.find((item) => featuredConnectorProvidersMatch(item.slug, "gmail"));
  const followUp: MessageBlock[] =
    option.id === "inbox" && gmail
      ? [
          {
            kind: "app_connect",
            connectorId: gmail.connectorId ?? "composio",
            provider: gmail.slug,
            name: gmail.name,
            description: "",
            logo: gmail.logo ?? null,
            status: gmail.connected ? "connected" : "pending",
          },
        ]
      : [];
  const committed = await deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT id FROM threads WHERE id = ${thread.id} FOR UPDATE`;
    const recent = await tx.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });
    const pending = recent.find((message) =>
      messageHasPendingChoice(message.blocks as MessageBlock[]),
    );
    if (!pending) return null;
    const blocks = (pending.blocks as MessageBlock[]).map((block) =>
      block.kind === "choice" ? { ...block, answerId: option.id } : block,
    );
    await tx.message.update({ where: { id: pending.id }, data: { blocks } });
    const updated = await appendEventInTransaction(tx, {
      ...target,
      type: "thread.message.updated",
      payload: { messageId: pending.id, role: "bot", blocks },
    });
    if (!followUp.length) return updated;
    const message = await createThreadMessageInTransaction(tx, {
      threadId: thread.id,
      role: "bot",
      botId: bot.id,
      blocks: followUp,
    });
    return appendEventInTransaction(tx, {
      ...target,
      type: "thread.message.created",
      payload: { messageId: message.id, role: "bot", blocks: followUp },
    });
  });
  if (committed) await deps.events.notify(thread.id, committed.seq);
}

export async function markAppConnected(
  deps: OnboardingDeps,
  actor: Actor,
  botId: string,
  provider: string,
  connectorId = "composio",
  threadId?: string,
): Promise<void> {
  const { bot, thread } = await requireBotThread(deps, actor, botId);
  const cardThreadId = threadId ?? thread.id;
  if (cardThreadId !== thread.id) {
    const owned = await deps.prisma.thread.findFirst({
      where: {
        id: cardThreadId,
        spaceId: actor.spaceId,
        userId: actor.userId,
        group: { members: { some: { botId: bot.id } } },
      },
      select: { id: true },
    });
    if (!owned) throw new IsolationError();
  }
  const connections = await deps.prisma.connection.findMany({
    where: { spaceId: actor.spaceId, userId: actor.userId, connectorId, status: "connected" },
    select: { provider: true },
  });
  if (!connections.some((row) => featuredConnectorProvidersMatch(row.provider, provider))) {
    const adapter = deps.connectors.managed(connectorId);
    const catalog = await adapter?.catalog({
      operationId: "onboarding.appConnected",
      traceId: "onboarding.appConnected",
      spaceId: actor.spaceId,
      userId: actor.userId,
      botId,
      signal: AbortSignal.timeout(15_000),
    });
    if (
      !catalog?.some(
        (item) => item.connected && featuredConnectorProvidersMatch(item.slug, provider),
      )
    )
      throw new IsolationError();
  }
  const target = { spaceId: actor.spaceId, botId: bot.id, threadId: cardThreadId };
  const messages = await deps.prisma.message.findMany({
    where: {
      threadId: cardThreadId,
      // Older onboarding messages predate persisted speaker IDs. Only the
      // owned bot's main thread can contain its legacy unattributed cards.
      ...(cardThreadId === thread.id ? { OR: [{ botId }, { botId: null }] } : { botId }),
      blocks: { array_contains: [{ kind: "app_connect" }] },
    },
    select: { id: true, blocks: true },
    orderBy: { createdAt: "asc" },
  });
  for (const message of messages) {
    const blocks = message.blocks as MessageBlock[];
    if (
      !blocks.some(
        (block) =>
          block.kind === "app_connect" &&
          (block.connectorId ?? "composio") === connectorId &&
          featuredConnectorProvidersMatch(block.provider, provider) &&
          block.status !== "connected",
      )
    )
      continue;
    const next = blocks.map((block) =>
      block.kind === "app_connect" &&
      (block.connectorId ?? "composio") === connectorId &&
      featuredConnectorProvidersMatch(block.provider, provider)
        ? { ...block, status: "connected" as const }
        : block,
    );
    await updateBlocks(deps, target, message.id, next);
  }
}
