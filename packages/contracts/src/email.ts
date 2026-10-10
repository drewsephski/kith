import * as z from "zod";

/** Plain text only: email HTML must never become executable chat content. */
export const EmailContentSchema = z.object({
  account: z.string().trim().min(1).max(500),
  from: z.string().max(500).optional(),
  to: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  cc: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  bcc: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  subject: z.string().max(1_000),
  body: z.string().max(50_000),
  attachments: z.array(z.string().max(500)).max(20).optional(),
});
export type EmailContent = z.infer<typeof EmailContentSchema>;
export const EmailDraftEditsSchema = EmailContentSchema.pick({ subject: true, body: true });
export type EmailDraftEdits = z.infer<typeof EmailDraftEditsSchema>;

export const EmailCardSchema = z.object({
  kind: z.literal("email"),
  mode: z.enum(["received", "draft"]),
  email: EmailContentSchema,
  /** Real provider IDs, never links or model-invented identifiers. */
  messageId: z.string().min(1).max(500).optional(),
  draftId: z.string().min(1).max(500).optional(),
});
export type EmailCard = z.infer<typeof EmailCardSchema>;
