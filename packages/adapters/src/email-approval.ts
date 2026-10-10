import type { EmailContent } from "@rakazo/contracts";
import { EmailContentSchema } from "@rakazo/contracts";
import { isEmailSendTool, redactSecrets } from "@rakazo/core";
import { JSDOM } from "jsdom";

/** Normalize common connector mail fields here, outside the provider-neutral UI. */
export function emailApprovalPreview(
  toolName: string,
  args: Record<string, unknown>,
  secrets: string[],
): EmailContent | undefined {
  if (!isEmailSendTool(toolName)) return undefined;
  const addresses = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
  const to = [...addresses(args.recipient_email ?? args.to), ...addresses(args.extra_recipients)];
  if (!to.length || typeof args.body !== "string" || typeof args.subject !== "string")
    return undefined;
  let body = args.body;
  if (args.is_html === true || args.content_type === "html") {
    const dom = new JSDOM(body);
    for (const node of dom.window.document.querySelectorAll("script,style,template")) node.remove();
    body = dom.window.document.body.textContent ?? "";
    dom.window.close();
  }
  const safe = (value: string) => redactSecrets(value, secrets);
  const parsed = EmailContentSchema.safeParse({
    account: safe(
      typeof args.user_id === "string" && args.user_id !== "me"
        ? args.user_id
        : "Connected email account",
    ),
    to: to.map(safe),
    cc: addresses(args.cc).map(safe),
    bcc: addresses(args.bcc).map(safe),
    subject: safe(args.subject),
    body: safe(body),
    attachments: args.attachment === undefined ? [] : addresses(args.attachment).map(safe),
  });
  return parsed.success ? parsed.data : undefined;
}
