import type { EmailContent } from "@rakazo/contracts";
import { EmailContentSchema } from "@rakazo/contracts";
import {
  completeEmailApprovalPreview,
  emailAddresses,
  isEmailSendTool,
  redactSecrets,
} from "@rakazo/core";
import { JSDOM } from "jsdom";

/** Normalize common connector mail fields here, outside the provider-neutral UI.
 * account must come from the adapter's verified identity, never a model-supplied label. */
export function emailApprovalPreview(
  toolName: string,
  args: Record<string, unknown>,
  secrets: string[],
  account?: string,
  options?: { attachmentsVerified?: boolean },
): EmailContent | undefined {
  if (!isEmailSendTool(toolName) || !account) return undefined;
  const aliases = [
    ["recipient_email", "to", "to_recipients", "to_email"],
    ["cc", "cc_recipients", "cc_emails"],
    ["bcc", "bcc_recipients", "bcc_emails"],
    ["attachment", "attachments"],
  ];
  if (aliases.some((keys) => keys.filter((key) => args[key] !== undefined).length > 1))
    return undefined;
  const to = emailAddresses(args.recipient_email ?? args.to ?? args.to_recipients ?? args.to_email);
  const extra = emailAddresses(args.extra_recipients, true);
  const cc = emailAddresses(args.cc ?? args.cc_recipients ?? args.cc_emails, true);
  const bcc = emailAddresses(args.bcc ?? args.bcc_recipients ?? args.bcc_emails, true);
  const attachmentValue = args.attachment ?? args.attachments;
  const rawAttachments =
    attachmentValue === undefined
      ? []
      : Array.isArray(attachmentValue)
        ? attachmentValue
        : [attachmentValue];
  const attachments: string[] = [];
  for (const value of rawAttachments) {
    if (typeof value === "string" && value.trim()) {
      // Paths and URLs are mutable; only a fetched provider draft can verify them.
      if (!options?.attachmentsVerified) return undefined;
      attachments.push(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const attachment = value as Record<string, unknown>;
      // Outlook's inline attachment payload is immutable in the approved effect request.
      if (
        typeof attachment.name !== "string" ||
        !attachment.name.trim() ||
        typeof attachment.mimetype !== "string" ||
        !attachment.mimetype.trim() ||
        typeof attachment.content !== "string" ||
        !attachment.content
      )
        return undefined;
      attachments.push(`${attachment.name} (${attachment.mimetype})`);
    } else return undefined;
  }
  if (
    !to?.length ||
    !extra ||
    !cc ||
    !bcc ||
    typeof args.body !== "string" ||
    typeof args.subject !== "string" ||
    /[\r\n\0]/.test(args.subject) ||
    (args.from !== undefined && typeof args.from !== "string")
  )
    return undefined;
  let body = args.body;
  if (args.is_html === true || args.content_type === "html") body = emailHtmlText(body);
  const safe = (value: string) => redactSecrets(value, secrets);
  const parsed = EmailContentSchema.safeParse({
    account: safe(account),
    from: typeof args.from === "string" ? safe(args.from) : undefined,
    to: [...to, ...extra].map(safe),
    cc: cc.map(safe),
    bcc: bcc.map(safe),
    subject: safe(args.subject),
    body: safe(body),
    attachments: attachments.map(safe),
  });
  return parsed.success && completeEmailApprovalPreview(parsed.data) ? parsed.data : undefined;
}

/** Plain-text send review retains consequential destinations from rich messages. */
export function emailHtmlText(body: string): string {
  const dom = new JSDOM(body);
  try {
    for (const node of dom.window.document.querySelectorAll("script,style,template")) node.remove();
    for (const link of dom.window.document.querySelectorAll("a[href]"))
      link.append(` (${link.getAttribute("href")})`);
    for (const image of dom.window.document.querySelectorAll("img"))
      image.replaceWith(
        `[${image.getAttribute("alt") ?? "Image"}: ${image.getAttribute("src") ?? ""}]`,
      );
    return dom.window.document.body.textContent ?? "";
  } finally {
    dom.window.close();
  }
}
