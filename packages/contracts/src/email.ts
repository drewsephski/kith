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

/** A projection of the existing request run and external effects, never client-owned state. */
export const EmailActionStateSchema = z.object({
  blockIndex: z.number().int().nonnegative(),
  runId: z.string(),
  status: z.enum([
    "completed",
    "queued",
    "waiting_input",
    "awaiting_approval",
    "sending",
    "sent",
    "failed",
    "uncertain",
    "cancelled",
  ]),
  email: EmailContentSchema.optional(),
});
export type EmailActionState = z.infer<typeof EmailActionStateSchema>;

export const EmailCardSchema = z.object({
  kind: z.literal("email"),
  mode: z.enum(["received", "draft"]),
  email: EmailContentSchema,
  /** Real provider IDs, never links or model-invented identifiers. */
  messageId: z.string().min(1).max(500).optional(),
  draftId: z.string().min(1).max(500).optional(),
  /** Only the server may establish provider verification. Model display tools remain unverified. */
  provenance: z.enum(["unverified", "provider"]).optional(),
});
export type EmailCard = z.infer<typeof EmailCardSchema>;
