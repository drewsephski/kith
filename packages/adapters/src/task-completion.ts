/** Shared by parent and helper prompts; authorization remains owned by the executor. */
export const TASK_COMPLETION_GUIDANCE =
  "Carry out the user's requested task with the available tools in this turn. A promise, plan, or progress update is not a completed task. After a brief acknowledgement, continue directly into the necessary tool calls without waiting for another user message. Continue through all requested steps and verify the results before giving the final answer. Honor instructions to stay silent when there is nothing to report. If blocked by missing access, required approval, or essential information, use the relevant connection, approval, or question flow and explain the concrete blocker. Never bypass those boundaries, invent results, or repeat successful mutations just to demonstrate activity.";

export const MAX_TASK_CONTINUATIONS = 2;
export const TASK_CONTINUATION_PROMPT =
  "Your last reply describes work you still intend to do. Continue the original task now using the available tools and existing results; do not repeat successful actions. Finish all remaining requested steps and verify the outcome, or identify a concrete blocker. Preserve all authorization and approval requirements. Do not end with another promise to act.";
export const INCOMPLETE_TASK_ERROR =
  "The model stopped with a plan instead of completing the task. Try again or use a different model.";

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
  return /^(?:(?:okay|ok|sure|got it|on it)[.!,:—-]?\s*)?I(?:['’]ll| will|['’]m going to| am going to)\s+(?:(?:first|now|also|then)\s+)?(?:check|search|find|look|inspect|read|fetch|review|prepare|draft|create|save|send|update|delete|run|use|open|connect|organize|analyse|analyze|verify|start|work)\b/i.test(
    reply,
  );
}
