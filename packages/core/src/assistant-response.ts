import type { ThreadMessage } from "@rakazo/contracts";
import { isToolActivityBlock } from "./tool-activity.js";

/** The companion animates only for the bound assistant's generating turns. */
export function isAssistantResponding(
  assistantId: string | null | undefined,
  bots: readonly { botId?: string; status?: string }[],
): boolean {
  return Boolean(
    assistantId &&
      bots.some(
        (bot) =>
          bot.botId === assistantId &&
          (bot.status === "queued" || bot.status === "leased" || bot.status === "running"),
      ),
  );
}

/** Used to avoid a duplicate response avatar; prose does not imply completion. */
export function hasRunResponseText(
  messages: readonly Pick<ThreadMessage, "role" | "runId" | "blocks">[],
  runId: string | null | undefined,
): boolean {
  return Boolean(
    runId &&
      messages.some(
        (message) =>
          message.role === "bot" &&
          message.runId === runId &&
          message.blocks.some(
            (block) =>
              (block.kind === "text" || block.kind === "progress") &&
              !isToolActivityBlock(block) &&
              block.text.trim().length > 0,
          ),
      ),
  );
}

/** Only the current run's synthetic row can supply its transient activity. */
export function runActivityText(
  messages: readonly Pick<ThreadMessage, "id" | "role" | "runId" | "blocks">[],
  runId: string | null | undefined,
): string | null {
  if (!runId) return null;
  const live = messages.findLast(
    (message) =>
      message.role === "bot" && message.runId === runId && message.id.startsWith("progress:"),
  );
  const block = live?.blocks.findLast((block) => block.kind === "progress" && block.activity);
  return block?.kind === "progress" && block.text.trim() ? block.text.trim() : null;
}
