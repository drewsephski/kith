import type { EmailActionState, EmailCard, EmailContent } from "@rakazo/contracts";
import { isEmailSendTool } from "./action-approval.js";

/** An email card expresses user intent through the ordinary authorized run pipeline.
 * It never grants the client access to arbitrary connector tools or credentials. */
export function emailActionPrompt(card: EmailCard, edited = false): string {
  return card.mode === "draft"
    ? edited
      ? "Send this email draft with my edits."
      : "Send this email draft as shown."
    : "Draft a reply to this email for me to review.";
}

/** Stable across retries and remounts, so a lost response cannot enqueue another send. */
export function emailActionNonce(messageId: string, blockIndex: number): string {
  // Edits belong to the first accepted request. Reloading the original card must
  // replay that request, not grant a second send with a new revision identity.
  return `email-send:${JSON.stringify([messageId, blockIndex])}`;
}

export function emailActionIdentity(
  nonce: string | null | undefined,
): { messageId: string; blockIndex: number } | undefined {
  if (!nonce?.startsWith("email-send:")) return;
  try {
    const value: unknown = JSON.parse(nonce.slice("email-send:".length));
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      Number.isInteger(value[1]) &&
      value[1] >= 0
    )
      return { messageId: value[0], blockIndex: value[1] };
  } catch {
    /* Non-email and malformed legacy nonces are not action receipts. */
  }
}

/** Completion of an agent run or approval never proves an email was sent. */
export function emailActionStatus(
  run: { status: string },
  effects: readonly EmailActionEffect[],
): EmailActionState["status"] {
  return emailActionOutcome(run, effects).status;
}

type EmailActionEffect = {
  id?: string;
  kind: string;
  status: string;
  result: unknown;
  request?: unknown;
};

/** Keep the displayed content bound to the same effect that establishes its outcome. */
export function emailActionOutcome(
  run: { status: string },
  effects: readonly EmailActionEffect[],
): { status: EmailActionState["status"]; effectId?: string } {
  const sends = effects.filter(isEmailActionEffect);
  const uncertain = sends.findLast((effect) => effect.status === "uncertain");
  if (uncertain) return { status: "uncertain", effectId: uncertain.id };
  const executing = sends.findLast((effect) => effect.status === "executing");
  if (executing)
    return {
      status: ["failed", "cancelled", "completed"].includes(run.status) ? "uncertain" : "sending",
      effectId: executing.id,
    };
  let confirmed: EmailActionEffect | undefined;
  let failed: EmailActionEffect | undefined;
  for (const effect of sends) {
    if (effect.status !== "completed") continue;
    const result =
      effect.result && typeof effect.result === "object" && !Array.isArray(effect.result)
        ? (effect.result as Record<string, unknown>)
        : undefined;
    if (result?.uncertain === true) return { status: "uncertain", effectId: effect.id };
    if (result?.error || result?.success === false || result?.successful === false) {
      failed = effect;
      continue;
    }
    // A provider adapter must explicitly verify its consequential response.
    if (result?.emailSendVerified === true) {
      confirmed = effect;
      continue;
    }
    return { status: "uncertain", effectId: effect.id };
  }
  if (confirmed) return { status: "sent", effectId: confirmed.id };
  if (failed) return { status: "failed", effectId: failed.id };
  const denied = sends.findLast((effect) => effect.status === "denied");
  if (denied || run.status === "cancelled")
    return { status: "cancelled", effectId: denied?.id ?? sends.at(-1)?.id };
  if (run.status === "waiting_input")
    return {
      status: sends.length ? "awaiting_approval" : "waiting_input",
      effectId: sends.at(-1)?.id,
    };
  if (run.status === "failed" || run.status === "completed")
    return { status: "failed", effectId: sends.at(-1)?.id };
  return { status: "queued", effectId: sends.at(-1)?.id };
}

/** Provider-verified effects and persisted direct/catalog envelopes share one send identity. */
export function isEmailActionEffect(effect: {
  kind: string;
  request?: unknown;
  result?: unknown;
}): boolean {
  return (
    isEmailSendTool(effect.kind) ||
    (effect.result !== null &&
      typeof effect.result === "object" &&
      "emailSendVerified" in effect.result &&
      effect.result.emailSendVerified === true) ||
    emailWrapperContainsSend(effect.kind, effect.request)
  );
}

function emailWrapperContainsSend(kind: string, request: unknown): boolean {
  if (!kind.toLowerCase().endsWith("_execute_tool")) return false;
  const record = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  // Catalog requests preserve their server-bound route and original arguments.
  // Inspect tool identifiers only, never arbitrary email text or model narration.
  const envelope = Array.isArray(request) ? record(request[2]) : undefined;
  const bound = Array.isArray(request) && request[1] === "direct";
  const route = bound
    ? record(envelope?.route)
    : Array.isArray(request)
      ? record(request[3])
      : undefined;
  if (typeof route?.toolName === "string" && isEmailSendTool(route.toolName)) return true;
  const args = bound
    ? record(envelope?.args)
    : record(Array.isArray(request) ? request[2] : request);
  if (!Array.isArray(args?.tools)) return false;
  return args.tools.some((tool: unknown) => {
    const call = record(tool);
    return typeof call?.tool_slug === "string" && isEmailSendTool(call.tool_slug);
  });
}

/** The provider's fresh draft must match the exact content selected by the user. */
export function emailSendMatchesCard(
  card: EmailCard,
  preview: { draftId?: string; email?: EmailCard["email"] },
): boolean {
  const email = preview.email;
  if (card.mode !== "draft" || !email || !card.draftId || card.draftId !== preview.draftId)
    return false;
  const addresses = (values: string[]) => {
    const result: string[] = [];
    for (const value of values) {
      const matches = value.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/gi);
      if (!matches?.length) return undefined;
      result.push(...matches.map((address) => address.toLowerCase()));
    }
    return result.sort().join("\n");
  };
  const account = addresses([card.email.account]);
  if (!account || account.includes("\n") || account !== addresses([email.account])) return false;
  const sender = addresses([card.email.from || card.email.account]);
  if (!sender || sender !== addresses([email.from || email.account])) return false;
  for (const field of ["to", "cc", "bcc"] as const) {
    const expected = addresses(card.email[field]);
    if (expected === undefined || expected !== addresses(email[field])) return false;
  }
  const body = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return (
    card.email.subject === email.subject &&
    body(card.email.body) === body(email.body) &&
    JSON.stringify(card.email.attachments ?? []) === JSON.stringify(email.attachments ?? [])
  );
}

/** Reject ambiguous headers rather than dropping recipients from a send review. */
export function emailAddresses(value: unknown, optional = false): string[] | undefined {
  if (value === undefined && optional) return [];
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (
    !values ||
    values.some((item) => typeof item !== "string" || !item.trim() || /[\r\n\0]/.test(item))
  )
    return undefined;
  const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  for (const item of values) {
    // Comma-separated and display-name mailbox headers are both supported.
    const parts = item
      .split(/[,;](?=(?:[^"\\]*"[^"\\]*")*[^"\\]*$)/)
      .map((part: string) => part.trim());
    if (parts.some((part: string) => !address.test(part.match(/<([^<>]+)>$/)?.[1] ?? part)))
      return undefined;
  }
  return values as string[];
}

export function completeEmailApprovalPreview(email: EmailContent | undefined): boolean {
  if (!email) return false;
  const account = emailAddresses(email.account);
  return Boolean(
    account?.length === 1 &&
      !/[,;]/.test(email.account) &&
      emailAddresses(email.to)?.length &&
      emailAddresses(email.cc) &&
      emailAddresses(email.bcc) &&
      (email.from === undefined || emailAddresses(email.from)?.length === 1) &&
      typeof email.subject === "string" &&
      !/[\r\n\0]/.test(email.subject) &&
      typeof email.body === "string" &&
      Array.isArray(email.attachments) &&
      email.attachments.every((item) => typeof item === "string" && item.trim()),
  );
}
