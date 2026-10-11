import type { MessageBlock } from "@rakazo/contracts";
import { taskAcknowledgmentBlocks } from "@rakazo/core";
import type { Prisma } from "./client.js";
import { appendEventInTransaction } from "./events.js";
import { createThreadMessageInTransaction } from "./messages.js";

/** Commit the receipt with the input and run, before any worker can claim it. */
export async function acknowledgeMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    spaceId: string;
    threadId: string;
    botId: string;
    runId: string;
    messageId: string;
    blocks: readonly MessageBlock[];
  },
) {
  const blocks = taskAcknowledgmentBlocks(input.blocks);
  const message = await createThreadMessageInTransaction(tx, {
    threadId: input.threadId,
    botId: input.botId,
    runId: input.runId,
    role: "bot",
    blocks,
    markUnread: false,
    clientNonce: `acknowledgment:${input.messageId}:${input.botId}`,
  });
  return appendEventInTransaction(tx, {
    spaceId: input.spaceId,
    threadId: input.threadId,
    botId: input.botId,
    runId: input.runId,
    type: "thread.message.created",
    payload: { messageId: message.id, role: "bot", blocks, acknowledgment: true },
  });
}
