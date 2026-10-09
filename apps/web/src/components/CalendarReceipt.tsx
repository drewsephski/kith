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
import { TaskReceiptHeader } from "./TaskReceiptHeader";

export function CalendarReceipt({ receiptId }: { receiptId: string }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await rpc.calendar.receipt({ receiptId });
        if (!cancelled) {
          setReceipt(next);
          setError(null);
          if (["queued", "leased", "running"].includes(next.status))
            timer = setTimeout(() => void load(), 3000);
        }
      } catch {
        if (!cancelled) setError(t`Could not load receipt`);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, receiptId, refresh, t]);
  return (
    <section
      className="my-2 w-full max-w-xl space-y-3 rounded-xl border border-border bg-card p-4 text-sm"
      data-testid="calendar-receipt"
    >
      {receipt ? (
        <TaskReceiptHeader
          title={t`Calendar briefing`}
          status={receipt.status}
          timestamp={receipt.completedAt ?? receipt.createdAt}
          workingLabel={receipt.snapshot ? t`Preparing your briefing` : t`Checking your calendar`}
        />
      ) : (
        <p role="status" className="text-muted-foreground">
          <Trans>Loading briefing…</Trans>
        </p>
      )}
      {receipt?.status === "completed" && receipt.snapshot ? (
        <div>
          <p className="text-xs text-muted-foreground">
            <Trans>Verified sources</Trans>:{" "}
            {receipt.snapshot.sources.map((source) => source.name).join(" · ")}
          </p>
          {receipt.snapshot.events.length ? (
            <ul className="mt-3 space-y-2">
              {receipt.snapshot.events.slice(0, 3).map((event) => (
                <li key={`${event.calendarId}:${event.id}`} className="flex gap-3">
                  <span className="shrink-0 text-muted-foreground">
                    {calendarTime(event, receipt.timezone)}
                  </span>
                  <span className="min-w-0 break-words">{event.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">
              <Trans>No events found in the checked window.</Trans>
            </p>
          )}
        </div>
      ) : null}
      {error && !open ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
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
                      setRefresh((value) => value + 1);
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
                      <li key={`${event.calendarId}:${event.id}`}>
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
    </section>
  );
}
