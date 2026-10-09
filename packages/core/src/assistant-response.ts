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

/** Response text replaces the waiting indicator even while the run is still active. */
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
