import type { EmailContent, MessageBlock } from "@rakazo/contracts";
import { isEmailSendTool, redactSecrets } from "@rakazo/core";
import { emailApprovalPreview } from "./email-approval.js";
import { emailCardFromTool } from "./email-card.js";

const MAX_APPROVAL_SUMMARY_LENGTH = 500;
const MAX_APPROVAL_DETAIL_LENGTH = 4_000;

export function buildApprovalAskBlock(
  effectId: string,
  toolName: string,
  args: Record<string, unknown>,
  secrets: string[],
  options?: { reviewReason?: string; emailSend?: boolean; email?: EmailContent },
): MessageBlock {
  const summary = describeApprovalAction(toolName, args);
  const detail = formatApprovalDetail(toolName, args, options?.reviewReason);
  const safeDetail = detail ? redactSecrets(detail, secrets) : undefined;
  const emailSend = options?.emailSend || isEmailSendTool(toolName);
  const email = options?.email
    ? emailCardFromTool({ ...options.email, mode: "draft" }, secrets).email
    : emailApprovalPreview(toolName, args, secrets);
  return {
    kind: "ask",
    approvalEffectId: effectId,
    approvalAction: emailSend ? "email_send" : undefined,
    email,
    text: truncate(
      redactSecrets(
        emailSend
          ? "Review email"
          : toolName === "create_space"
            ? `${summary}?`
            : `Review before ${summary}`,
        secrets,
      ),
      MAX_APPROVAL_SUMMARY_LENGTH,
    ),
    detail: email
      ? options?.reviewReason &&
        redactSecrets(options.reviewReason, secrets).slice(0, MAX_APPROVAL_DETAIL_LENGTH)
      : safeDetail
        ? truncate(safeDetail, MAX_APPROVAL_DETAIL_LENGTH)
        : undefined,
    status: "pending",
    actions: emailSend
      ? [
          { id: "allow", label: "Send email" },
          { id: "deny", label: "Cancel" },
        ]
      : toolName === "create_space"
        ? [
            { id: "allow", label: "Create space", outcome: "created" },
            { id: "deny", label: "Cancel", outcome: "cancelled" },
          ]
        : [
            { id: "allow", label: "Allow once" },
            { id: "always", label: "Always allow this tool" },
            { id: "deny", label: "Deny" },
          ],
  };
}

function describeApprovalAction(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "destination.write") {
    const collection = args.collection ? String(args.collection) : "records";
    const title = args.title ? ` "${String(args.title)}"` : "";
    return `writing${title} to ${collection}`;
  }
  if (toolName === "delete_bot" || toolName === "archive_bot") {
    const name = args.confirm_name ?? args.confirmName;
    return name ? `${toolName.replace("_", " ")} (${String(name)})` : toolName.replace("_", " ");
  }
  if (toolName === "create_space") {
    const name = args.name ? String(args.name) : "Untitled";
    return `Create space “${name}”`;
  }
  const target = pickScopeLabel(args);
  return target ? `${toolName} → ${target}` : toolName;
}

function formatApprovalDetail(
  toolName: string,
  args: Record<string, unknown>,
  reviewReason?: string,
): string | undefined {
  const lines: string[] = [];
  if (reviewReason?.trim()) {
    lines.push(reviewReason.trim().replace(/\u2014|\u2013/g, "-"));
  }
  if (toolName === "create_space") {
    lines.push(
      "Bots, groups, chats, files, memory, and integrations in this space stay separate from other spaces.",
    );
  }
  for (const key of ["collection", "title", "to", "subject", "amount", "body"]) {
    const value = args[key];
    if (value == null || value === "") continue;
    lines.push(`${key}: ${String(value)}`);
  }
  if (lines.length === 0) return undefined;
  return lines.join("\n");
}

function pickScopeLabel(args: Record<string, unknown>): string | undefined {
  for (const key of ["to", "title", "collection", "subject", "amount"]) {
    const value = args[key];
    if (value != null && value !== "") return String(value);
  }
  return undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
