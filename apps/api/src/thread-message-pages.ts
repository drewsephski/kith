import type { MessageBlock, ThreadMessage, ThreadMessagePage } from "@rakazo/contracts";
import { MessageBlock as MessageBlockSchema } from "@rakazo/contracts";
import {
  callIdFromClientNonce,
  emailActionIdentity,
  emailActionOutcome,
  isPeerReceiptBlocks,
} from "@rakazo/core";
import { messageReplyPreview } from "@rakazo/core/message-quote";
import type { Prisma, PrismaClient } from "@rakazo/db";

type MessageDb = PrismaClient | Prisma.TransactionClient;

const replySelection = {
  threadId: true,
  role: true,
  botId: true,
  blocks: true,
} as const;

export async function loadMessagePage(
  prisma: MessageDb,
  threadId: string,
  before: number | undefined,
  pageSize: number,
  around?: { messageId?: string; seq?: number },
  includePeerRuns = false,
  includePeerReceipts = false,
): Promise<ThreadMessagePage> {
  if (around) {
    let targetSeq = around.seq;
    if (targetSeq === undefined && around.messageId) {
      const row = await prisma.message.findFirst({
        where: { id: around.messageId, threadId },
        select: { seq: true },
      });
      targetSeq = row?.seq;
    }
    if (targetSeq !== undefined) {
      const half = Math.floor(pageSize / 2);
      const minSeq = Math.max(0, targetSeq - half);
      const maxSeq = targetSeq + half;
      const rows = await prisma.message.findMany({
        where: { threadId, seq: { gte: minSeq, lte: maxSeq } },
        orderBy: { seq: "asc" },
        take: pageSize,
        include: { replyTo: { select: replySelection } },
      });
      const truncated = rows.length >= pageSize;
      const coveredThroughSeq = truncated ? (rows[rows.length - 1]?.seq ?? maxSeq) : maxSeq;
      const first = rows[0];
      const hasOlder = first
        ? (await prisma.message.count({ where: { threadId, seq: { lt: first.seq } } })) > 0
        : false;
      // Peer text/activity stays out of the normal transcript (including the
      // around target). Receipts remain via withoutPeerRunMessages; full peer
      // history belongs in the bot-messages overlay (includePeerRuns).
      const messages = includePeerRuns ? rows : await withoutPeerRunMessages(prisma, rows);
      return {
        threadId,
        messages: await withEmailActions(prisma, threadId, messages.map(toThreadMessage)),
        olderCursor: hasOlder ? (first?.seq ?? null) : null,
        coveredThroughSeq,
      };
    }
  }

  let cursor = before;
  while (true) {
    const rows = await prisma.message.findMany({
      where: {
        threadId,
        ...(cursor === undefined ? {} : { seq: { lt: cursor } }),
      },
      orderBy: { seq: "desc" },
      take: pageSize + 1,
      include: { replyTo: { select: replySelection } },
    });
    const hasOlder = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize).reverse();
    const visibleRows = includePeerRuns ? pageRows : await withoutPeerRunMessages(prisma, pageRows);
    // Web hides receipts client-side, so its receipt-only pages keep scanning.
    // Mobile explicitly retains them and must receive each page for pagination.
    const hasSubstantive = visibleRows.some(
      (row) => !isPeerReceiptBlocks(row.blocks as MessageBlock[]),
    );
    if (hasSubstantive || includePeerReceipts || !hasOlder || includePeerRuns) {
      return {
        threadId,
        messages: await withEmailActions(prisma, threadId, visibleRows.map(toThreadMessage)),
        olderCursor: hasOlder ? (pageRows[0]?.seq ?? null) : null,
      };
    }
    // TODO: only rescan when a raw page is entirely peer output. Consider a run relation if
    // long peer-only histories make this path hot.
    cursor = pageRows[0]?.seq;
  }
}

/** Batched projection scoped to the already-authorized thread, including legacy edited receipts. */
async function withEmailActions(
  prisma: MessageDb,
  threadId: string,
  messages: ThreadMessage[],
): Promise<ThreadMessage[]> {
  const cards = messages.filter(
    (message) => message.role === "bot" && message.blocks.some((block) => block.kind === "email"),
  );
  if (!cards.length) return messages;
  const requests = await prisma.message.findMany({
    where: {
      threadId,
      role: "user",
      replyToMessageId: { in: cards.map((message) => message.id) },
      clientNonce: { startsWith: "email-send:" },
    },
    orderBy: { seq: "asc" },
    select: {
      clientNonce: true,
      blocks: true,
      sourceRuns: {
        select: {
          id: true,
          status: true,
          effects: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, kind: true, status: true, result: true, request: true },
          },
        },
      },
    },
  });
  const reviewRunIds = requests.flatMap((request) =>
    request.sourceRuns.filter((run) => run.effects.length > 0).map((run) => run.id),
  );
  const reviewRows = reviewRunIds.length
    ? await prisma.message.findMany({
        where: {
          threadId,
          role: "bot",
          runId: { in: reviewRunIds },
          blocks: { array_contains: [{ kind: "ask", approvalAction: "email_send" }] },
        },
        orderBy: { seq: "desc" },
        select: { blocks: true },
      })
    : [];
  // A changed provider draft may have received a later final approval than the
  // selected card. Show that actual approved content beside the send outcome.
  const reviewedEmails = new Map<string, Extract<MessageBlock, { kind: "ask" }>>();
  for (const row of reviewRows) {
    const parsed = MessageBlockSchema.array().safeParse(row.blocks);
    if (!parsed.success) continue;
    for (const block of parsed.data) {
      if (
        block.kind === "ask" &&
        block.approvalAction === "email_send" &&
        block.approvalEffectId &&
        !reviewedEmails.has(block.approvalEffectId)
      )
        reviewedEmails.set(block.approvalEffectId, block);
    }
  }
  const byMessage = new Map<string, NonNullable<ThreadMessage["emailActions"]>>();
  for (const request of requests) {
    const identity = emailActionIdentity(request.clientNonce);
    if (!identity) continue;
    const states = byMessage.get(identity.messageId) ?? [];
    if (states.some((state) => state.blockIndex === identity.blockIndex)) continue;
    const run = request.sourceRuns[0];
    if (!run) continue;
    const parsed = MessageBlockSchema.array().safeParse(request.blocks);
    const email = parsed.success ? parsed.data.find((block) => block.kind === "email") : undefined;
    const outcome = emailActionOutcome(run, run.effects);
    const review = outcome.effectId ? reviewedEmails.get(outcome.effectId) : undefined;
    const approvedEmail =
      review?.status === "answered" && review.answer === "allow" ? review.email : undefined;
    const source = cards.find((message) => message.id === identity.messageId)?.blocks[
      identity.blockIndex
    ];
    states.push({
      blockIndex: identity.blockIndex,
      runId: run.id,
      status:
        source?.kind === "email" && source.mode === "received" && run.status === "completed"
          ? "completed"
          : outcome.status,
      ...(approvedEmail
        ? { email: approvedEmail }
        : email?.kind === "email"
          ? { email: email.email }
          : {}),
    });
    byMessage.set(identity.messageId, states);
  }
  return messages.map((message) =>
    byMessage.has(message.id) ? { ...message, emailActions: byMessage.get(message.id) } : message,
  );
}

export async function loadAllMessages(
  prisma: PrismaClient,
  threadId: string,
  pageSize: number,
): Promise<ThreadMessage[]> {
  const pages: ThreadMessage[][] = [];
  let before: number | undefined;
  do {
    const page = await loadMessagePage(prisma, threadId, before, pageSize, undefined, true);
    pages.push(page.messages);
    before = page.olderCursor ?? undefined;
  } while (before !== undefined);
  return pages.reverse().flat();
}

async function withoutPeerRunMessages<T extends { runId: string | null; blocks: Prisma.JsonValue }>(
  prisma: MessageDb,
  rows: T[],
): Promise<T[]> {
  const runIds = [...new Set(rows.flatMap((row) => (row.runId ? [row.runId] : [])))];
  if (runIds.length === 0) return rows;
  const peerRuns = await prisma.run.findMany({
    where: { id: { in: runIds }, trigger: "bot_message" },
    select: { id: true },
  });
  const peerRunIds = new Set(peerRuns.map((run) => run.id));
  return rows.filter((row) => {
    if (!row.runId || !peerRunIds.has(row.runId)) return true;
    // Keep peer receipts (chips), ask cards, and the bot's own text reply.
    const blocks = row.blocks as MessageBlock[];
    return blocks.some(
      (block) =>
        block.kind === "bot_message_sent" ||
        block.kind === "bot_message_received" ||
        block.kind === "ask" ||
        block.kind === "text",
    );
  });
}

export async function isPeerRun(
  prisma: MessageDb,
  runId: string | undefined,
  cache: Map<string, Promise<boolean>>,
): Promise<boolean> {
  if (!runId) return false;
  let peerRun = cache.get(runId);
  if (!peerRun) {
    peerRun = prisma.run
      .findUnique({ where: { id: runId }, select: { trigger: true } })
      .then((run) => run?.trigger === "bot_message");
    cache.set(runId, peerRun);
  }
  return peerRun;
}

/** Peer-run SSE events that must still reach an open thread (terminals, waits, receipts, asks, text). */
export function shouldForwardPeerThreadEvent(event: {
  type: string;
  payload: { blocks?: unknown };
}): boolean {
  if (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.cancelled" ||
    event.type === "run.waiting_input" ||
    event.type === "computer.takeover.requested"
  ) {
    return true;
  }
  if (event.type !== "thread.message.created" && event.type !== "thread.message.updated") {
    return false;
  }
  const blocks = event.payload.blocks;
  return (
    Array.isArray(blocks) &&
    blocks.some(
      (block) =>
        !!block &&
        typeof block === "object" &&
        "kind" in block &&
        (block.kind === "bot_message_received" ||
          block.kind === "bot_message_sent" ||
          block.kind === "ask" ||
          block.kind === "email" ||
          block.kind === "text"),
    )
  );
}

function toThreadMessage(row: {
  id: string;
  threadId: string;
  seq: number;
  role: string;
  blocks: Prisma.JsonValue;
  botId: string | null;
  replyToMessageId: string | null;
  replyQuote: string | null;
  replyTo?: {
    threadId: string;
    role: string;
    botId: string | null;
    blocks: Prisma.JsonValue;
  } | null;
  runId: string | null;
  clientNonce?: string | null;
  createdAt: Date;
}): ThreadMessage {
  const parent = row.replyTo?.threadId === row.threadId ? row.replyTo : null;
  const parsed = parent ? MessageBlockSchema.array().safeParse(parent.blocks) : undefined;
  const replyPreview =
    parent && parsed?.success
      ? messageReplyPreview(
          parsed.data,
          parent.role as ThreadMessage["role"],
          parent.botId ?? undefined,
        )
      : row.replyToMessageId || row.replyQuote != null
        ? null
        : undefined;
  return {
    id: row.id,
    threadId: row.threadId,
    seq: row.seq,
    role: row.role as ThreadMessage["role"],
    blocks: row.blocks as ThreadMessage["blocks"],
    botId: row.botId ?? undefined,
    replyToMessageId: row.replyToMessageId ?? undefined,
    replyQuote: row.replyQuote ?? undefined,
    replyPreview,
    runId: row.runId ?? undefined,
    callId: callIdFromClientNonce(row.clientNonce),
    createdAt: row.createdAt.toISOString(),
  };
}
