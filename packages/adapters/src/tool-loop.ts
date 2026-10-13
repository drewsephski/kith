import type { ToolCallStreak } from "@rakazo/core";
import { trackToolCallStreak } from "@rakazo/core";

import { isMemorySaveCall } from "./task-completion.js";

// Same tool, same arguments, this many times in a row means the agent is stuck, not paginating.
const MAX_CONSECUTIVE_IDENTICAL_TOOL_CALLS = 6;

export function advanceToolCallLoopGuard(
  streak: ToolCallStreak,
  name: string,
  args: unknown,
  memoryRequestId?: string,
): { streak: ToolCallStreak; stuck: boolean } {
  const memoryArgs = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const input =
    memoryRequestId && isMemorySaveCall(name, memoryArgs, false) ? { args, memoryRequestId } : args;
  const next = trackToolCallStreak(streak, name, input);
  return {
    streak: next,
    stuck: next.count >= MAX_CONSECUTIVE_IDENTICAL_TOOL_CALLS,
  };
}
