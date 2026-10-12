/** Shared by parent and helper prompts; authorization remains owned by the executor. */
export const TASK_COMPLETION_GUIDANCE =
  "Carry out the user's requested task with the available tools in this turn. A promise, plan, or progress update is not a completed task. After a brief acknowledgement, continue directly into the necessary tool calls without waiting for another user message. Continue through all requested steps and verify the results before giving the final answer. Honor instructions to stay silent when there is nothing to report. If blocked by missing access, required approval, or essential information, use the relevant connection, approval, or question flow and explain the concrete blocker. Never bypass those boundaries, invent results, or repeat successful mutations just to demonstrate activity.";

export const MAX_TASK_CONTINUATIONS = 2;
export const MEMORY_TASK_GUIDANCE =
  "When the user explicitly asks to save a durable fact or preference, execute the authorized memory write for the requested scope before confirming it. Use remember, save_memory or save_shared_memory only when offered and appropriate to that scope; if tools are catalogued, discover and load the memory writer first. When several Memory request IDs are listed, use memory_request_id to identify the request being saved; keep IDs out of your reply. Existing memory and a verbal acknowledgement do not persist a new fact. Explain unavailable or rejected writes honestly. Never repeat an attempted failed or uncertain write.";
export const TASK_CONTINUATION_PROMPT =
  "Your last reply describes work you still intend to do. Continue the original task now using the available tools and existing results; do not repeat successful actions. Finish all remaining requested steps and verify the outcome, or identify a concrete blocker. Preserve all authorization and approval requirements. Do not end with another promise to act.";
export const INCOMPLETE_TASK_ERROR =
  "The model stopped with a plan instead of completing the task. Try again or use a different model.";
export const UNVERIFIED_MEMORY_ERROR = "Memory save couldn't be verified.";
export const MEMORY_CONTINUATION_PROMPT =
  "The requested durable preference has no confirmed memory write. Save it using the supported memory tool, then report the confirmed result. Do not repeat any attempted failed or uncertain mutation, bypass permissions, or claim a preference was saved without a successful tool result.";

/** An explicit save directive needs a receipt; unrelated memory cannot satisfy it. */
export function needsFreshMemoryWrite(prompt: string): boolean {
  // Code examples cannot authorize memory writes, including an unfinished fence.
  const directive = prompt
    .replace(/^Selected choice [^:\n]+:\s*/i, "")
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, "\n");
  const patterns = [
    /^\s*(?:please\s+)?remember\s*(?:for\s+(?:future(?:\s+conversations)?|later|next\s+time)\s*)?:\s*\S/gi,
    /(?:^|[.!?,;\n…]\s*)(?:please\s+)?remember\s+(?!to\b|how\b|when\b|where\b|whether\b|if\b|what\b|who\b|why\b|which\b)(?![^.!?\n]*\?)[^\s'"`>]/gi,
    /(?:^|[.!?,;\n…]\s*)(?:please\s+)?(?:save|store)\s+[^.!?\n]+?\s+(?:to|in)\s+(?:(?:my|your|the|durable)\s+)?memory\b(?![^.!?\n]*\?)/gi,
    /(?:^|[.!?;\n…]\s*)(?:can|could|will|would)\s+you\s+(?:please\s+)?(?:remember\s+(?:that|I)\s+\S|(?:save|store)\s+[^.!?\n]+?\s+(?:to|in)\s+(?:(?:my|your|the|durable)\s+)?memory\b)/gi,
  ];
  return patterns.some((pattern) =>
    [...directive.matchAll(pattern)].some((match) => {
      const delimiter = match[0].match(/^[.!?,;\n…]\s*/)?.[0] ?? "";
      const prefix = directive.slice(0, (match.index ?? 0) + delimiter.length);
      const clause = prefix.split(/[.!?;\n…]/).at(-1) ?? "";
      // Reported instructions are data, not permission to persist another person's facts.
      return !/\b(?:said|says|wrote|writes|told|asked|asks|quoted?|example|explain|sentence|phrase|reads|states|stated)\b/i.test(
        clause,
      );
    }),
  );
}

export function memoryReplyIsBlocked(text: string): boolean {
  // Incidental failure wording is not evidence that this save was blocked.
  // Be conservative: contradictory success language still requires a receipt.
  const refusal =
    /\b(?:(?:I|we) (?:cannot|can['’]t|could not|couldn['’]t|am unable to|are unable to|was unable to) (?:save|store|remember)\b|(?:I|we) (?:do not|don['’]t) have (?:permission|access|authorization) to (?:save|store|remember)\b|(?:the )?memory (?:provider|tool) (?:rejected|denied|failed) (?:the |this )?(?:write|save)\b|writes? (?:are|is) disabled\b|(?:memory|(?:your|the|this) preference) (?:was not|wasn['’]t|is not|isn['’]t|has not been|hasn['’]t been|not) (?:saved|stored)\b)/gi;
  if (!refusal.test(text)) return false;
  return !/\b(?:I|we)(?: have|['’]ve)? (?:saved|stored|remembered)\b|(?:^|[.!?]\s*)(?:successfully )?(?:saved|stored|remembered)\b|\b(?:your|the|this) (?:memory|preference) (?:was|is|has been) (?:saved|stored)\b/i.test(
    text.replace(refusal, ""),
  );
}

const MEMORY_SAVE_TOOLS = new Set(["remember", "save_shared_memory", "save_memory"]);
export function isMemorySaveCall(
  name: string,
  args: Record<string, unknown>,
  boundResource: boolean,
): boolean {
  if (boundResource) return false;
  return MEMORY_SAVE_TOOLS.has(name === "kith_execute_tool" ? String(args.id ?? "") : name);
}

/**
 * Conservative recovery for an explicit first-person promise at the start of
 * a terminal reply. This is a bounded heuristic, not proof of task completion.
 * Questions, hypothetical advice, quoted text and missing-access replies must
 * remain terminal; they cannot authorize another action.
 */
export function isUnfulfilledActionReply(text: string): boolean {
  const reply = text.trim();
  if (!reply || reply.includes("?") || /```|^\s*>/m.test(reply)) return false;
  if (
    /\b(?:if you|once you|when you|after you|need (?:you|your)|please (?:connect|approve|provide)|cannot|can['’]t|unable|not connected|don['’]t have access|do not have access|tomorrow|next week|after (?:approval|confirmation)|waiting for (?:approval|permission))\b/i.test(
      reply,
    )
  )
    return false;
  // Keep completed outcomes that include a separate future offer terminal.
  if (
    /(?:^(?:done|saved|created|completed)\b|\bI(?: have|['’]ve)? (?:created|saved|sent|updated|deleted|found|finished|completed|verified)\b)/i.test(
      reply,
    )
  )
    return false;
  return /^(?:(?:okay|ok|sure|got it|on it)[.!,:—-]?\s*)?I(?:['’]ll| will|['’]m going to| am going to)\s+(?:(?:first|now|also|then)\s+)?(?:check|search|find|look|inspect|read|fetch|review|prepare|draft|create|save|remember|store|send|update|delete|run|use|open|connect|organize|analyse|analyze|verify|start|work)\b/i.test(
    reply,
  );
}
