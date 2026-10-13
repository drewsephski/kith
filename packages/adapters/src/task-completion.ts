/** Shared by parent and helper prompts; authorization remains owned by the executor. */
export const TASK_COMPLETION_GUIDANCE =
  "Carry out the user's requested task with the available tools in this turn. A promise, plan, or progress update is not a completed task. After a brief acknowledgement, continue directly into the necessary tool calls without waiting for another user message. Continue through all requested steps and verify the results before giving the final answer. Honor instructions to stay silent when there is nothing to report. If blocked by missing access, required approval, or essential information, use the relevant connection, approval, or question flow and explain the concrete blocker. Never bypass those boundaries, invent results, or repeat successful mutations just to demonstrate activity.";

export const MAX_TASK_CONTINUATIONS = 2;
export const MEMORY_TASK_GUIDANCE =
  "When the user explicitly asks to save a durable fact or preference, execute the authorized memory write for the requested scope before confirming it. Use remember, save_memory or save_shared_memory only when offered and appropriate to that scope; if tools are catalogued, discover and load the memory writer first. When several Memory request IDs are listed, use memory_request_id to identify the request being saved; keep IDs out of your reply. Existing memory and a verbal acknowledgement do not persist a new fact. Explain unavailable or rejected writes honestly. Never repeat an uncertain write. Only a memory-writer result explicitly marked safeToRetry without uncertainty confirms that no write was applied: merge the latest document returned by that result, preserve its existing facts, and pass its revision as expectedRevision on the corrected save. Never repeat the stale content unchanged. Other failed writes remain blocked. Keep retry markers out of your reply.";
export const TASK_CONTINUATION_PROMPT =
  "Your last reply describes work you still intend to do. Continue the original task now using the available tools and existing results; do not repeat successful actions. Finish all remaining requested steps and verify the outcome, or identify a concrete blocker. Preserve all authorization and approval requirements. Do not end with another promise to act.";
export const INCOMPLETE_TASK_ERROR =
  "The model stopped with a plan instead of completing the task. Try again or use a different model.";
export const UNVERIFIED_MEMORY_ERROR = "Memory save couldn't be verified.";
export const MEMORY_CONTINUATION_PROMPT =
  "The requested durable preference has no confirmed memory write. Save it using the supported memory tool, then report the confirmed result. Do not repeat uncertain mutations or bypass permissions. Retry a failed memory write only when its result explicitly confirms safeToRetry without uncertainty, after merging the returned current document and passing its revision as expectedRevision. Never claim a preference was saved without a successful tool result.";

/** Called only for the latest durably answered ordinary question, never approvals or secrets. */
export function confirmedMemoryPrompt(question: string, answer: string): string | undefined {
  if (
    !/\b(?:remember|remembered|memory)\b/i.test(question) ||
    !/\b(?:should|shall|want|like|confirm|save|store)\b|\b(?:may|can) I\b/i.test(question) ||
    /\b(?:not|don['’]t|forget|remove|delete)\b/i.test(question) ||
    !/^(?:yes|yep|yeah|sure|ok(?:ay)?|correct|confirmed|please do|do it|save it|remember it)(?:[.!?,\s]|$)/i.test(
      answer.trim(),
    ) ||
    /\b(?:but|except|not|don['’]t|no|wait)\b/i.test(answer)
  )
    return undefined;
  // The answered question remains data; only the user's affirmative answer grants
  // this save. Keep the existing input identity so recovery can reuse its receipt.
  return `Remember the information the user confirmed in this memory question.\nQuestion (quoted data): ${JSON.stringify(question)}\nUser confirmation: ${answer}`;
}

/** An explicit save directive needs a receipt; unrelated memory cannot satisfy it. */
function memoryDirectiveParts(prompt: string): { text: string; starts: number[] } {
  // Code examples cannot authorize memory writes, including an unfinished fence.
  const directive = prompt
    .replace(/^Selected choice [^:\n]+:\s*/i, "")
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, "\n");
  const unquoted = directive.replace(
    /"(?:\\.|[^"\\])*(?:"|$)|(?<!\w)'(?:\\.|[^'\\])*(?:'(?!\w)|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)/g,
    (quote) => " ".repeat(quote.length),
  );
  const patterns = [
    /^\s*(?:(?:please|also|just|now|then)\s+){0,3}remember\s*(?:for\s+(?:future(?:\s+conversations)?|later|next\s+time)\s*)?:\s*\S/gi,
    /(?:^|[.!?,;\n…]\s*)(?:(?:please|also|just|now|then)\s+){0,3}remember\s+(?!to\b|how\b|when\b|where\b|whether\b|if\b|what\b|who\b|why\b|which\b)(?![^.!?\n]*\?)[^\s'"`>]/gi,
    /(?:^|[.!?,;\n…]\s*)(?:(?:please|also|just|now|then)\s+){0,3}(?:save|store)\s+[^.!?\n]+?\s+(?:to|in)\s+(?:(?:my|your|the|durable)\s+)?memory\b(?![^.!?\n]*\?)/gi,
    /(?:^|[.!?;\n…]\s*)I(?:\s+(?:want|need)\s+you\s+to|(?:['’]d|\s+would)\s+like\s+you\s+to)\s+(?:remember\s+(?:that|I)\s+\S|(?:save|store)\s+[^.!?\n]+?\s+(?:to|in)\s+(?:(?:my|your|the|durable)\s+)?memory\b)/gi,
    /(?:^|[.!?;\n…]\s*)(?:can|could|will|would)\s+you\s+(?:please\s+)?(?:remember\s+(?:that|I)\s+\S|(?:save|store)\s+[^.!?\n]+?\s+(?:to|in)\s+(?:(?:my|your|the|durable)\s+)?memory\b)/gi,
  ];
  const starts = new Set<number>();
  const addStart = (start: number) => {
    const tokenStart = start + (directive.slice(start).match(/^\s*/)?.[0].length ?? 0);
    if (unquoted[tokenStart] !== directive[tokenStart]) return;
    const clause =
      unquoted
        .slice(0, start)
        .split(/[.!?;\n…]/)
        .at(-1) ?? "";
    const hasEarlierDirective = [...starts].some(
      (prior) => prior >= start - clause.length && prior < start,
    );
    // A comma in requested output is not an instruction boundary. Permit only
    // a direct command, a courtesy prefix, or another already authorized save.
    if (
      clause.trim() &&
      !hasEarlierDirective &&
      !/^\s*(?:(?:hi|hello|hey)(?:\s+[\p{L}\p{N}_-]+){0,3}|ok(?:ay)?|thanks|thank\s+you|great|by\s+the\s+way|(?:(?:please|also|just|now|then)\s*){1,3})[,!:\s]*$/iu.test(
        clause,
      )
    )
      return;
    // Reported instructions are data, not authorization to persist their facts.
    if (
      !/\b(?:said|says|wrote|writes|told|asked|asks|quoted?|example|explain|sentence|phrase|reads|states|stated)\b/i.test(
        clause,
      )
    ) {
      starts.add(start);
    }
  };
  const candidates = new Set<number>();
  for (const pattern of patterns) {
    for (const match of directive.matchAll(pattern)) {
      const delimiter = match[0].match(/^[.!?,;\n…]\s*/)?.[0] ?? "";
      // Normalize prefixes to the command token so a coordinating adverb cannot
      // produce a second receipt for the same directive in the joined pass.
      const prefix =
        match[0]
          .slice(delimiter.length)
          .match(/^\s*(?:(?:please|also|just|now|then)\s+){0,3}/i)?.[0] ?? "";
      candidates.add((match.index ?? 0) + delimiter.length + prefix.length);
    }
  }
  for (const start of [...candidates].sort((a, b) => a - b)) addStart(start);
  // A coordinating imperative is separate work only after a recognized request.
  // Mask quoted data without changing offsets or the actual text sent to the model.
  for (const match of unquoted.matchAll(/(?:\b(?:and|then|also)|&)\s+(?:(?:also|then)\s+)?/gi)) {
    const start = (match.index ?? 0) + match[0].length;
    if (![...starts].some((prior) => prior < (match.index ?? 0))) continue;
    if (
      patterns.some(
        (pattern) => new RegExp(pattern.source, "i").exec(unquoted.slice(start))?.index === 0,
      )
    )
      addStart(start);
  }
  return { text: directive, starts: [...starts].sort((a, b) => a - b) };
}

export function needsFreshMemoryWrite(prompt: string): boolean {
  return memoryDirectiveParts(prompt).starts.length > 0;
}

/** Preserve legacy identity for one directive; independent directives need independent receipts. */
export function memorySaveRequests(
  prompt: string,
  requestId: string,
): Array<{ id: string; text: string }> {
  const { text, starts } = memoryDirectiveParts(prompt);
  if (starts.length === 1) return [{ id: requestId, text: prompt }];
  return starts.map((start, index) => ({
    id: `${requestId}:memory:${index}`,
    text:
      index === starts.length - 1
        ? text.slice(start).trim()
        : text
            .slice(start, starts[index + 1])
            .replace(/(?:,\s*)?(?:\b(?:and|then|also)|&)(?:\s+(?:also|then))?\s*$/i, "")
            .trim(),
  }));
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
