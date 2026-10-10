import type { EmailCard } from "@rakazo/contracts";
import { EmailCardSchema } from "@rakazo/contracts";
import { redactSecrets } from "@rakazo/core";

export function emailCardFromTool(args: Record<string, unknown>, secrets: string[]): EmailCard {
  const card = EmailCardSchema.parse({
    kind: "email",
    mode: args.mode,
    email: args,
    messageId: args.messageId,
    draftId: args.draftId,
  });
  // Redact every displayed field, including headers and account labels.
  const safe = (value: string) => redactSecrets(value, secrets);
  return {
    ...card,
    messageId: card.messageId === undefined ? undefined : safe(card.messageId),
    draftId: card.draftId === undefined ? undefined : safe(card.draftId),
    email: {
      ...card.email,
      account: safe(card.email.account),
      from: card.email.from === undefined ? undefined : safe(card.email.from),
      to: card.email.to.map(safe),
      cc: card.email.cc.map(safe),
      bcc: card.email.bcc.map(safe),
      subject: safe(card.email.subject),
      body: safe(card.email.body),
      attachments: card.email.attachments?.map(safe),
    },
  };
}
