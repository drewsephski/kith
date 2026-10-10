import { Trans, useLingui } from "@lingui/react/macro";
import type {
  EmailCard as EmailBlock,
  EmailContent,
  EmailDraftEdits,
  ThreadMessage,
} from "@rakazo/contracts";
import { Button, Input, Textarea } from "@rakazo/ui-web";
import { useLayoutEffect, useRef, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

function fitEmailBody(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export function EmailPreview({
  email,
  onChange,
}: {
  email: EmailContent;
  onChange?: (edits: EmailDraftEdits) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => fitEmailBody(bodyRef.current), [email.body]);
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    let frame: number | undefined;
    const resizeToContent = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      // ResizeObserver must not mutate its observed box during delivery.
      frame = requestAnimationFrame(() => {
        frame = undefined;
        fitEmailBody(element);
      });
    };
    // Refit wrapping when the card or viewport changes width.
    document.fonts?.addEventListener("loadingdone", resizeToContent);
    let width: number | undefined;
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(([entry]) => {
            if (entry && entry.contentRect.width !== width) {
              width = entry.contentRect.width;
              resizeToContent();
            }
          });
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      document.fonts?.removeEventListener("loadingdone", resizeToContent);
    };
  }, []);
  const { t } = useLingui();
  const headers = [
    [t`Account`, email.account],
    [t`From`, email.from === email.account ? undefined : email.from],
    [t`To`, email.to.join(", ")],
    [t`Cc`, email.cc.join(", ")],
    [t`Bcc`, email.bcc.join(", ")],
    [t`Attachments`, email.attachments?.join(", ")],
  ];
  return (
    <div
      className="min-w-0 space-y-2"
      data-testid="email-preview"
      style={{ fontFamily: '"Geist Variable", system-ui, sans-serif' }}
    >
      {onChange ? (
        <Input
          aria-label={t`Email subject`}
          value={email.subject}
          onChange={(event) => onChange({ subject: event.target.value, body: email.body })}
          maxLength={1000}
          className="h-7 rounded-none border-0 bg-transparent px-0 py-0 text-base font-medium leading-5 shadow-none md:text-[13px] dark:bg-transparent"
        />
      ) : (
        <h3 className="break-words text-[13px] font-medium leading-5 text-foreground">
          {email.subject || t`No subject`}
        </h3>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[11px] leading-4">
        {headers
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-[10px] text-muted-foreground/80">{label}</dt>
              <dd className="min-w-0 break-all text-foreground/75">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="border-t border-border pt-2">
        <Textarea
          ref={bodyRef}
          aria-label={t`Email body`}
          value={email.body}
          onChange={(event) => onChange?.({ subject: email.subject, body: event.target.value })}
          readOnly={!onChange}
          maxLength={50000}
          rows={1}
          style={{ boxShadow: "none" }}
          className="min-h-5 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-base leading-[1.65] text-foreground/90 shadow-none focus-visible:border-transparent focus-visible:ring-0 [overflow-wrap:anywhere] md:text-[12px] dark:bg-transparent"
        />
      </div>
    </div>
  );
}

export function EmailCard({
  block,
  message,
  blockIndex,
  groupId,
  onUpdated,
}: {
  block: EmailBlock;
  message: ThreadMessage;
  blockIndex: number;
  groupId?: string;
  onUpdated?: () => Promise<void>;
}) {
  const { t } = useLingui();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(block.email.subject);
  const [body, setBody] = useState(block.email.body);
  const action = message.emailActions?.find((state) => state.blockIndex === blockIndex);
  const accepted = requested || Boolean(action);
  const statusLabel = action
    ? {
        completed: t`Completed`,
        queued: t`Request queued`,
        waiting_input: t`Needs attention`,
        awaiting_approval: t`Awaiting final approval`,
        sending: t`Sending…`,
        sent: t`Sent and verified`,
        failed: t`Failed`,
        uncertain: t`Verify before retrying`,
        cancelled: t`Cancelled`,
      }[action.status]
    : undefined;
  const changed = subject !== block.email.subject || body !== block.email.body;
  async function act() {
    if (locked.current || accepted || !message.botId) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await rpc.threads.send({
        ...(groupId
          ? { groupId, mentions: [{ kind: "bot" as const, id: message.botId }] }
          : { botId: message.botId }),
        emailAction: {
          messageId: message.id,
          blockIndex,
          ...(changed ? { edits: { subject, body } } : {}),
        },
        replyToMessageId: message.id,
      });
      setRequested(true);
      // Sending is confirmed by the service in the ensuing run, not by queue acceptance.
      await onUpdated?.().catch(() => undefined);
    } catch (cause) {
      setError(errorText(cause, t`Could not request email action`));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      data-testid="email-card"
      aria-label={block.mode === "draft" ? t`Email draft` : t`Email`}
      className="w-full min-w-0 max-w-lg rounded-xl border border-border bg-card p-3 sm:p-3.5"
    >
      <EmailPreview
        email={action?.email ?? { ...block.email, subject, body }}
        onChange={
          block.mode === "draft" && !busy && !accepted && message.botId
            ? (edits) => {
                setSubject(edits.subject);
                setBody(edits.body);
              }
            : undefined
        }
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={busy || accepted || !message.botId}
          onClick={() => void act()}
        >
          {statusLabel ? (
            statusLabel
          ) : busy ? (
            <Trans>Requesting…</Trans>
          ) : requested ? (
            <Trans>Requested</Trans>
          ) : block.mode === "draft" ? (
            <Trans>Send</Trans>
          ) : (
            <Trans>Reply</Trans>
          )}
        </Button>
      </div>
      {block.provenance !== "provider" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <Trans>Unverified email preview</Trans>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
