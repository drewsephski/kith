import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { TaskStarterReceipt as Receipt, TaskTodo } from "@rakazo/contracts";
import { Button, Checkbox, Input, SelectField, Textarea } from "@rakazo/ui-web";
import { useEffect, useId, useRef, useState } from "react";
import { newClientId } from "../../lib/client-id";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

export function TaskStarterReceipt({
  receiptId: originalReceiptId,
  onUpdated,
}: {
  receiptId: string;
  onUpdated?: () => Promise<void>;
}) {
  const { t } = useLingui();
  const fieldId = useId();
  const [receiptId, setReceiptId] = useState(originalReceiptId);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setReceiptId(originalReceiptId);
    setReceipt(null);
  }, [originalReceiptId]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, TaskTodo>>({});
  const [recurrence, setRecurrence] = useState(false);
  const [frequency, setFrequency] = useState("weekly");
  const [time, setTime] = useState("09:00");
  const [day, setDay] = useState("1");
  const [scheduled, setScheduled] = useState(false);
  const [chosenMeeting, setChosenMeeting] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const publishNonce = `task-publish:${receiptId}`;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const next = await rpc.taskStarters.receipt({ receiptId });
        if (cancelled) return;
        setReceipt(next);
        setError(null);
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(() => void load(), 2000);
      } catch (cause) {
        if (!cancelled) setError(errorText(cause, t`Could not load task`));
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [receiptId, refresh, t]);
  async function mutate(action: () => Promise<Receipt>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (!alive.current) return;
      setReceiptId(next.id);
      setReceipt(next);
      setRefresh((value) => value + 1);
    } catch (cause) {
      // Refresh durable state after a lost response before enabling another action.
      try {
        const next = await rpc.taskStarters.receipt({ receiptId });
        if (!alive.current) return;
        setReceiptId(next.id);
        setReceipt(next);
        setRefresh((value) => value + 1);
      } catch {
        /* The original error remains visible; refresh uses a read-only request. */
      }
      if (alive.current) setError(errorText(cause, t`Could not complete this action`));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const result = receipt?.result;
  const sources = result?.sources ?? [];
  function citations(ids: string[]) {
    return (
      <span className="inline-flex flex-wrap gap-2 text-xs text-muted-foreground">
        {ids.map((id) => {
          const source = sources.find((row) => row.id === id);
          return source ? (
            source.url ? (
              <a
                key={id}
                className="underline underline-offset-2"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.title}
              </a>
            ) : (
              <span key={id}>{source.title}</span>
            )
          ) : null;
        })}
      </span>
    );
  }
  return (
    <section
      aria-label={t`Task result`}
      data-testid="task-starter-receipt"
      className="my-2 w-full max-w-xl space-y-4 rounded-xl border border-border bg-card p-4 text-sm"
    >
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {!receipt ? (
        <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>
          <Trans>Load task</Trans>
        </Button>
      ) : null}
      {receipt?.status === "queued" || receipt?.status === "running" ? (
        <p role="status" className="text-muted-foreground">
          <Trans>Working…</Trans>
        </p>
      ) : null}
      {receipt?.status === "cancelled" ? (
        <p>
          <Trans>Task cancelled</Trans>
        </p>
      ) : null}
      {receipt?.status === "reconciliation_required" ? (
        <div className="space-y-2">
          <p role="alert" className="text-warning">
            <Trans>
              The spreadsheet update could not be confirmed. Check the destination before starting
              another report.
            </Trans>
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void mutate(() => rpc.taskStarters.reconcile({ receiptId }))}
          >
            <Trans>Check outcome</Trans>
          </Button>
        </div>
      ) : null}
      {receipt?.error ? (
        <p role="alert" className="text-destructive">
          {receipt.error}
        </p>
      ) : null}
      {receipt?.status === "failed" ? (
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void mutate(() => rpc.taskStarters.retry({ receiptId }))}
        >
          <Trans>Retry task</Trans>
        </Button>
      ) : null}
      {result?.summary ? <ChatMarkdown>{result.summary}</ChatMarkdown> : null}
      {result?.warnings.map((warning) => (
        <p key={warning} className="text-warning">
          {warning}
        </p>
      ))}
      {result?.kind === "gmail_search" ? (
        <>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {result.coverage.map((row) => (
              <li key={row.connectionId}>
                {row.label} · {row.count} ·{" "}
                {row.status === "complete"
                  ? t`Complete`
                  : row.status === "limited"
                    ? t`Limited results`
                    : t`Search failed`}
              </li>
            ))}
          </ul>
          <ul className="space-y-3">
            {result.messages.map((mail) => (
              <li key={`${mail.connectionId}:${mail.id}`} className="min-w-0 break-words">
                <a
                  href={mail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  {mail.subject || t`Untitled email`}
                </a>
                <p className="text-xs text-muted-foreground">
                  {mail.accountLabel} · {mail.from} · {new Date(mail.date).toLocaleDateString()}
                </p>
                <p>{mail.snippet}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {result?.kind === "meeting_brief" ? (
        <>
          {result.choices.length ? (
            <div className="space-y-2">
              {result.choices.map((choice) => (
                <Button
                  key={`${choice.connectionId}:${choice.id}`}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal py-3 text-start"
                  disabled={busy || chosenMeeting !== null}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await rpc.taskStarters.chooseMeeting({
                        receiptId,
                        meetingId: choice.id,
                        connectionId: choice.connectionId,
                        clientNonce: newClientId(),
                      });
                      setChosenMeeting(choice.id);
                      await onUpdated?.();
                    } catch (cause) {
                      setError(errorText(cause, t`Could not prepare this meeting`));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <span>
                    {choice.title}
                    <span className="block text-xs text-muted-foreground">
                      {new Date(choice.start).toLocaleString()} –{" "}
                      {new Date(choice.end).toLocaleTimeString()}
                    </span>
                  </span>
                </Button>
              ))}
              {chosenMeeting ? (
                <p role="status" className="text-muted-foreground">
                  <Trans>Meeting selected</Trans>
                </p>
              ) : null}
            </div>
          ) : null}
          {result.meeting ? (
            <h3 className="font-medium">
              {result.meeting.title} · {new Date(result.meeting.start).toLocaleString()}
            </h3>
          ) : null}
          <ul className="space-y-3">
            {result.facts.map((fact, index) => (
              <li key={index}>
                <p>{fact.text}</p>
                {citations(fact.sourceIds)}
              </li>
            ))}
          </ul>
          {result.suggestions.length ? (
            <div>
              <h3 className="mb-2 font-medium">
                <Trans>Suggested talking points</Trans>
              </h3>
              <ul className="space-y-3">
                {result.suggestions.map((item, index) => (
                  <li key={index}>
                    <p>{item.text}</p>
                    {citations(item.sourceIds)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
      {result?.kind === "inbox_todos" ? (
        <>
          <ul className="space-y-4">
            {result.actions.map((action) => {
              const edit = edits[action.id] ?? action;
              const update = (patch: Partial<TaskTodo>) =>
                setEdits((rows) => ({ ...rows, [action.id]: { ...edit, ...patch } }));
              return (
                <li key={action.id} className="space-y-1">
                  <label htmlFor={`${fieldId}-${action.id}`} className="flex items-start gap-3">
                    <Checkbox
                      id={`${fieldId}-${action.id}`}
                      checked={selected.includes(action.id) || Boolean(action.savedItemId)}
                      disabled={busy || Boolean(action.savedItemId)}
                      onCheckedChange={(checked) =>
                        setSelected((ids) =>
                          checked ? [...ids, action.id] : ids.filter((id) => id !== action.id),
                        )
                      }
                    />
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{edit.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {action.savedItemId
                          ? t`Saved`
                          : edit.priority === "high"
                            ? t`High priority`
                            : edit.priority === "low"
                              ? t`Low priority`
                              : t`Normal priority`}
                        {edit.dueDate ? ` · ${edit.dueDate}` : ""}
                      </span>
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground">{action.reason}</p>
                  {citations(action.sourceIds)}
                  {!action.savedItemId ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        <Trans>Edit action</Trans>
                      </summary>
                      <div className="space-y-2 pt-2">
                        <Input
                          aria-label={t`Action title`}
                          value={edit.title}
                          onChange={(event) => update({ title: event.target.value })}
                          maxLength={200}
                          disabled={busy}
                        />
                        <Textarea
                          aria-label={t`Action notes`}
                          value={edit.notes}
                          onChange={(event) => update({ notes: event.target.value })}
                          maxLength={2000}
                          disabled={busy}
                        />
                        <Input
                          type="date"
                          aria-label={t`Due date`}
                          value={edit.dueDate ?? ""}
                          onChange={(event) => update({ dueDate: event.target.value || null })}
                          disabled={busy}
                        />
                        <SelectField
                          aria-label={t`Priority`}
                          value={edit.priority}
                          onValueChange={(value) => {
                            if (value === "high" || value === "normal" || value === "low")
                              update({ priority: value });
                          }}
                          items={[
                            { value: "high", label: t`High` },
                            { value: "normal", label: t`Normal` },
                            { value: "low", label: t`Low` },
                          ]}
                          disabled={busy}
                        />
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Button
            disabled={
              busy ||
              !result.actions.some((action) => selected.includes(action.id) && !action.savedItemId)
            }
            onClick={() =>
              void mutate(() =>
                rpc.taskStarters.saveTodos({
                  receiptId,
                  actionIds: selected.filter(
                    (id) => !result.actions.find((action) => action.id === id)?.savedItemId,
                  ),
                  edits: Object.values(edits)
                    .filter((action) => selected.includes(action.id))
                    .map(({ id, title, notes, dueDate, priority }) => ({
                      id,
                      title,
                      notes,
                      dueDate,
                      priority,
                    })),
                }),
              )
            }
          >
            <Trans>Save selected to-dos</Trans>
          </Button>
        </>
      ) : null}
      {result?.kind === "analytics_report" ? (
        <>
          <p className="text-xs text-muted-foreground">
            {result.report.startDate} – {result.report.endDate} · {result.report.timezone}
            {result.report.provisional ? ` · ${t`Provisional data`}` : ""}
          </p>
          <dl className="grid grid-cols-2 gap-2">
            {result.report.metrics.map((metric) => (
              <div key={metric.name}>
                <dt className="text-muted-foreground">{metric.label}</dt>
                <dd className="text-lg tabular-nums">
                  {metric.value.toLocaleString()}
                  {metric.name === "totalRevenue" && result.report.currency
                    ? ` ${result.report.currency}`
                    : ""}
                </dd>
              </div>
            ))}
          </dl>
          {result.report.url ? (
            <a
              className="inline-block underline underline-offset-2"
              href={result.report.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Trans>Open spreadsheet</Trans>
            </a>
          ) : null}
          {!result.report.published && receipt?.status === "completed" ? (
            <>
              <p className="text-xs text-muted-foreground">
                <Trans>Publishing replaces this report’s range in the selected spreadsheet.</Trans>{" "}
                {result.report.range}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void mutate(() =>
                    rpc.taskStarters.publish({ receiptId, clientNonce: publishNonce }),
                  )
                }
              >
                <Trans>Publish to Sheet</Trans>
              </Button>
            </>
          ) : null}
          {result.report.published ? (
            <>
              {scheduled ? (
                <p role="status">
                  <Trans>Scheduled. Manage it in Routines.</Trans>
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setRecurrence((value) => !value)}
                >
                  <Trans>Repeat this report</Trans>
                </Button>
              )}
              {recurrence && !scheduled ? (
                <div className="space-y-3">
                  <SelectField
                    aria-label={t`Report frequency`}
                    value={frequency}
                    onValueChange={setFrequency}
                    items={[
                      { value: "weekly", label: t`Weekly` },
                      { value: "daily", label: t`Daily` },
                    ]}
                    disabled={busy}
                  />
                  {frequency === "weekly" ? (
                    <SelectField
                      aria-label={t`Day of week`}
                      value={day}
                      onValueChange={setDay}
                      items={(
                        [
                          ["1", t`Monday`],
                          ["2", t`Tuesday`],
                          ["3", t`Wednesday`],
                          ["4", t`Thursday`],
                          ["5", t`Friday`],
                          ["6", t`Saturday`],
                          ["0", t`Sunday`],
                        ] as const
                      ).map(([value, label]) => ({ value, label }))}
                      disabled={busy}
                    />
                  ) : null}
                  <Input
                    type="time"
                    aria-label={t`Report time`}
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">{result.report.timezone}</p>
                  <Button
                    disabled={busy || !/^\d{2}:\d{2}$/.test(time)}
                    onClick={async () => {
                      const [hour, minute] = time.split(":").map(Number);
                      setBusy(true);
                      setError(null);
                      try {
                        await rpc.taskStarters.schedule({
                          receiptId,
                          cron: `${minute} ${hour} * * ${frequency === "weekly" ? day : "*"}`,
                          timezone: result.report.timezone,
                        });
                        setScheduled(true);
                      } catch (cause) {
                        setError(errorText(cause, t`Could not schedule report`));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trans>Schedule report</Trans>
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {sources.length ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            <Trans>Sources</Trans> · {sources.length}
          </summary>
          <ul className="mt-2 space-y-2">
            {sources.map((source) => (
              <li key={source.id} className="break-words">
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(source.retrievedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
