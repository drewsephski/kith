import { Trans, useLingui } from "@lingui/react/macro";
import type { CalendarReceipt as Receipt } from "@rakazo/contracts";
import { calendarTime } from "@rakazo/core";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@rakazo/ui-web";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

export function CalendarReceipt({ receiptId }: { receiptId: string }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await rpc.calendar.receipt({ receiptId });
        if (!cancelled) {
          setReceipt(next);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(t`Could not load receipt`);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, receiptId, t]);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Trans>Calendar briefing · View receipt</Trans>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-h-[85dvh] max-w-xl overflow-y-auto">
          <div className="flex items-center justify-between">
            <DialogTitle>
              <Trans>Briefing receipt</Trans>
            </DialogTitle>
            <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label={t`Close`} />}>
              <X size={16} />
            </DialogClose>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {receipt ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt>
                  <Trans>Status</Trans>
                </dt>
                <dd>{receipt.status}</dd>
                <dt>
                  <Trans>Created</Trans>
                </dt>
                <dd>{new Date(receipt.createdAt).toLocaleString()}</dd>
                <dt>
                  <Trans>Started</Trans>
                </dt>
                <dd>{receipt.startedAt ? new Date(receipt.startedAt).toLocaleString() : "—"}</dd>
                <dt>
                  <Trans>Finished</Trans>
                </dt>
                <dd>
                  {receipt.completedAt ? new Date(receipt.completedAt).toLocaleString() : "—"}
                </dd>
                <dt>
                  <Trans>Attempts</Trans>
                </dt>
                <dd>{receipt.attempts}</dd>
                <dt>
                  <Trans>Timezone</Trans>
                </dt>
                <dd className="break-all">{receipt.timezone}</dd>
              </dl>
              {receipt.error ? <p className="text-destructive">{receipt.error}</p> : null}
              {receipt.status === "failed" ? (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await rpc.calendar.retry({ receiptId });
                      setReceipt(await rpc.calendar.receipt({ receiptId }));
                    } catch {
                      setError(t`Could not retry. Check your Calendar connection.`);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trans>Retry briefing</Trans>
                </Button>
              ) : null}
              {receipt.snapshot ? (
                <>
                  <div>
                    <h3 className="font-medium">
                      <Trans>Verified calendar data</Trans>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {new Date(receipt.snapshot.retrievedAt).toLocaleString()} ·{" "}
                      {receipt.snapshot.date}
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {receipt.snapshot.sources.map((source) => (
                      <li key={source.id} className="break-words">
                        {source.name}
                      </li>
                    ))}
                  </ul>
                  <p>
                    {receipt.snapshot.events.length} <Trans>events retrieved</Trans>
                  </p>
                  <ul className="space-y-2">
                    {receipt.snapshot.events.map((event) => (
                      <li key={event.id}>
                        <span className="text-muted-foreground">
                          {calendarTime(event, receipt.timezone)}
                        </span>{" "}
                        · {event.title}
                      </li>
                    ))}
                  </ul>
                  <Collapsible>
                    <CollapsibleTrigger className="cursor-pointer">
                      <Trans>Source records</Trans>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(receipt.snapshot, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : null}
              <p>
                <Trans>AI suggestions</Trans>: {receipt.suggestionStatus ?? "—"}
              </p>
              {receipt.memorySources.length ? (
                <div>
                  <h3 className="font-medium">
                    <Trans>Preference sources</Trans>
                  </h3>
                  {receipt.memorySources.map((source) => (
                    <p key={source.id}>
                      {source.path} · rev {source.revision}
                    </p>
                  ))}
                </div>
              ) : null}
              {receipt.outcome ? (
                <Collapsible>
                  <CollapsibleTrigger className="cursor-pointer">
                    <Trans>Saved outcome</Trans>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                      {receipt.outcome}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
