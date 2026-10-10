import type { EmailCard } from "@rakazo/contracts";

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
export function emailActionNonce(messageId: string, blockIndex: number, revision?: string): string {
  return `email-send:${JSON.stringify(revision ? [messageId, blockIndex, revision] : [messageId, blockIndex])}`;
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
