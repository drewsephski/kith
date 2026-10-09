import type { TaskStarterReceipt } from "@rakazo/contracts";
import { CalendarTimezone } from "@rakazo/contracts";
import { nextCronDateAcrossStrict, TASK_STARTERS } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { rpc } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useThreadReadOnly } from "../../lib/thread-read-only";
import { errorText } from "../../lib/user-error";
import { NativeActionButton } from "../native-action-button";
import { TaskField, TaskPicker, TaskSheet, TaskText } from "./controls";
import { captureTaskScope } from "./scope";
import { TaskTodoReview } from "./todo-review";

export function TaskStarterReceiptCard({ receiptId }: { receiptId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NativeActionButton
        label={t("View task receipt")}
        fill={false}
        prominence="secondary"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <TaskReceiptDetails key={receiptId} receiptId={receiptId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function TaskReceiptDetails({
  receiptId,
  onClose,
}: {
  receiptId: string;
  onClose: () => void;
}) {
  const readOnly = useThreadReadOnly();
  const scope = useRef(captureTaskScope());
  const controller = useRef(new AbortController());
  const locked = useRef(false);
  const publishNonce = useRef(
    globalThis.crypto?.randomUUID?.() ??
      `publish-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [activeReceiptId, setActiveReceiptId] = useState(receiptId);
  const choiceNonces = useRef(new Map<string, string>());
  const [receipt, setReceipt] = useState<TaskStarterReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [cron, setCron] = useState("0 9 * * 1");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [pollingTick, setPollingTick] = useState(0);
  const current = () => !controller.current.signal.aborted && scope.current();

  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let fetching = false;
    async function load() {
      if (stopped || !current() || fetching || AppState.currentState !== "active") return;
      fetching = true;
      try {
        const next = await rpc<TaskStarterReceipt>(
          "taskStarters/receipt",
          { receiptId: activeReceiptId },
          { signal: controller.current.signal },
        );
        if (stopped || !current()) return;
        setReceipt(next);
        setError(null);
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(() => void load(), 2000);
      } catch (reason) {
        if (!stopped && current()) setError(errorText(reason, t("Could not load receipt")));
      } finally {
        fetching = false;
      }
    }
    void load();
    const listener = AppState.addEventListener("change", (state) => {
      clearTimeout(timer);
      if (state === "active") void load();
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      listener.remove();
    };
  }, [activeReceiptId, pollingTick]);

  async function action(proc: string, body: unknown) {
    if (readOnly || locked.current || !current()) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await rpc<TaskStarterReceipt>(proc, body, { signal: controller.current.signal });
      if (!current()) return;
      setReceipt(next);
      setActiveReceiptId(next.id);
      setPollingTick((tick) => tick + 1);
      return true;
    } catch (reason) {
      if (current()) setError(errorText(reason, t("Could not complete action")));
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  async function schedule() {
    if (readOnly || locked.current || !current()) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await rpc<{ routineId: string }>(
        "taskStarters/schedule",
        { receiptId: activeReceiptId, cron, timezone },
        { signal: controller.current.signal },
      );
      if (current()) {
        setRoutineId(next.routineId);
        setShowSchedule(false);
      }
    } catch (reason) {
      if (current()) setError(errorText(reason, t("Could not schedule task. Try again.")));
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  const result = receipt?.result;
  const nextRun =
    showSchedule && CalendarTimezone.safeParse(timezone).success
      ? nextCronDateAcrossStrict([cron], new Date(), timezone)
      : null;
  return (
    <TaskSheet
      title={t(
        TASK_STARTERS.find((starter) => starter.id === receipt?.starter)?.title ?? "Task receipt",
      )}
      onClose={onClose}
    >
      {receipt ? (
        <TaskText>
          {
            {
              queued: t("Queued"),
              running: t("Running"),
              completed: t("Completed"),
              failed: t("Failed"),
              cancelled: t("Cancelled"),
              reconciliation_required: t("Check outcome"),
            }[receipt.status]
          }
        </TaskText>
      ) : (
        <TaskText>{t("Loading…")}</TaskText>
      )}
      {receipt?.error ? <TaskText error>{receipt.error}</TaskText> : null}
      {result ? (
        <>
          {result.summary ? <TaskText>{result.summary}</TaskText> : null}
          {result.warnings.map((warning, index) => (
            <TaskText key={`warning-${index}`}>{warning}</TaskText>
          ))}
          {result.kind === "gmail_search" ? (
            <>
              {result.coverage.map((account) => (
                <TaskText key={account.connectionId}>
                  {account.label} · {t("{count} results", { count: account.count })} ·{" "}
                  {
                    { complete: t("Complete"), limited: t("Limited"), failed: t("Failed") }[
                      account.status
                    ]
                  }
                </TaskText>
              ))}
              {result.messages.map((message) => (
                <View key={`${message.connectionId}-${message.id}`} style={{ gap: 6 }}>
                  <NativeActionButton
                    label={message.subject || t("Untitled email")}
                    fill={false}
                    prominence="plain"
                    onPress={() =>
                      void Linking.openURL(message.url).catch((reason) =>
                        setError(errorText(reason, t("Could not open source"))),
                      )
                    }
                  />
                  <TaskText>
                    {message.accountLabel} · {message.from}
                  </TaskText>
                  <TaskText>{message.snippet}</TaskText>
                </View>
              ))}
            </>
          ) : null}
          {result.kind === "meeting_brief" ? (
            <>
              {result.meeting ? (
                <TaskText>
                  {result.meeting.title} · {result.meeting.start}
                </TaskText>
              ) : null}
              {result.choices.map((choice) => (
                <NativeActionButton
                  key={`${choice.connectionId}-${choice.id}`}
                  label={`${choice.title} · ${choice.start}`}
                  fill={false}
                  prominence="secondary"
                  disabled={readOnly || busy || receipt?.status !== "completed"}
                  onPress={() => {
                    const key = `${choice.connectionId}-${choice.id}`;
                    const clientNonce =
                      choiceNonces.current.get(key) ??
                      globalThis.crypto?.randomUUID?.() ??
                      `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    choiceNonces.current.set(key, clientNonce);
                    void action("taskStarters/chooseMeeting", {
                      receiptId: activeReceiptId,
                      meetingId: choice.id,
                      connectionId: choice.connectionId,
                      clientNonce,
                    });
                  }}
                />
              ))}
              {[...result.facts, ...result.suggestions].map((fact, index) => (
                <View key={`fact-${index}`} style={{ gap: 6 }}>
                  <TaskText>{fact.text}</TaskText>
                  {fact.sourceIds.map((id) => {
                    const source = result.sources.find((row) => row.id === id);
                    return source ? <TaskText key={id}>{source.title}</TaskText> : null;
                  })}
                </View>
              ))}
            </>
          ) : null}
          {result.kind === "inbox_todos" ? (
            <TaskTodoReview
              result={result}
              status={receipt!.status}
              busy={busy}
              readOnly={readOnly}
              onError={setError}
              onSave={async (actionIds, edits) =>
                Boolean(
                  await action("taskStarters/saveTodos", {
                    receiptId: activeReceiptId,
                    actionIds,
                    edits,
                  }),
                )
              }
            />
          ) : null}
          {result.kind === "analytics_report" ? (
            <>
              <TaskText>
                {result.report.startDate} – {result.report.endDate} · {result.report.timezone}
                {result.report.provisional ? ` · ${t("Provisional")}` : ""}
              </TaskText>
              {result.report.metrics.map((metric) => (
                <TaskText key={metric.name}>
                  {t(metric.label)}: {metric.value}
                  {metric.name === "totalRevenue" && result.report.currency
                    ? ` ${result.report.currency}`
                    : ""}
                </TaskText>
              ))}
              {result.report.published && result.report.url ? (
                <NativeActionButton
                  label={t("Open Sheet")}
                  prominence="secondary"
                  fill={false}
                  onPress={() =>
                    void Linking.openURL(result.report.url!).catch((reason) =>
                      setError(errorText(reason, t("Could not open Sheet"))),
                    )
                  }
                />
              ) : !readOnly && receipt?.status === "completed" ? (
                <NativeActionButton
                  label={t("Write report to Sheet")}
                  busy={busy}
                  onPress={() =>
                    void action("taskStarters/publish", {
                      receiptId: activeReceiptId,
                      clientNonce: publishNonce.current,
                    })
                  }
                />
              ) : null}
              {result.report.published && !readOnly && !routineId ? (
                <NativeActionButton
                  label={t("Schedule report")}
                  fill={false}
                  prominence="plain"
                  disabled={busy}
                  onPress={() => {
                    setTimezone(result.report.timezone);
                    setShowSchedule(true);
                  }}
                />
              ) : null}
              {routineId ? <TaskText>{t("Report scheduled")}</TaskText> : null}
              {showSchedule ? (
                <>
                  <TaskField
                    disabled={busy}
                    label={t("Schedule (cron)")}
                    value={cron}
                    onChange={setCron}
                  />
                  <TaskField
                    disabled={busy}
                    label={t("Timezone")}
                    value={timezone}
                    onChange={setTimezone}
                  />
                  <NativeActionButton
                    label={t("Save schedule")}
                    busy={busy}
                    disabled={!cron.trim() || !CalendarTimezone.safeParse(timezone).success}
                    onPress={() => void schedule()}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {receipt?.status === "completed" &&
          receipt.repeat &&
          result.kind !== "analytics_report" &&
          !readOnly ? (
            <View style={{ gap: 12 }}>
              {routineId ? (
                <TaskText>{t("Scheduled.")}</TaskText>
              ) : (
                <NativeActionButton
                  label={t("Make this a routine")}
                  fill={false}
                  prominence="secondary"
                  disabled={busy}
                  onPress={() => {
                    setTimezone(receipt.repeat!.timezone);
                    setCron("0 9 * * *");
                    setShowSchedule(!showSchedule);
                  }}
                />
              )}
              {showSchedule && !routineId ? (
                <>
                  <TaskText>{receipt.repeat.sources.join(" · ")}</TaskText>
                  <TaskPicker
                    label={t("Frequency")}
                    value={cron}
                    onChange={setCron}
                    disabled={busy}
                    choices={[
                      { id: "0 9 * * *", label: `${t("Every day")} · 09:00` },
                      { id: "0 9 * * 1", label: `${t("Every Monday")} · 09:00` },
                    ]}
                  />
                  <TaskField
                    label={t("Timezone")}
                    value={timezone}
                    onChange={setTimezone}
                    disabled={busy}
                  />
                  {nextRun ? (
                    <TaskText>
                      {t("Next run")}: {nextRun.toLocaleString(undefined, { timeZone: timezone })}
                    </TaskText>
                  ) : null}
                  <TaskText>
                    {t("Read-only preparation. It won’t send email or change your accounts.")}
                  </TaskText>
                  <NativeActionButton
                    label={t("Confirm routine")}
                    busy={busy}
                    disabled={!nextRun}
                    onPress={() => void schedule()}
                  />
                </>
              ) : null}
            </View>
          ) : null}
          {result.sources.length ? (
            <View style={{ gap: 8 }}>
              <TaskText>{t("Sources")}</TaskText>
              {result.sources.map((source) =>
                source.url ? (
                  <NativeActionButton
                    key={source.id}
                    label={source.title}
                    prominence="plain"
                    fill={false}
                    onPress={() =>
                      void Linking.openURL(source.url!).catch((reason) =>
                        setError(errorText(reason, t("Could not open source"))),
                      )
                    }
                  />
                ) : (
                  <TaskText key={source.id}>{source.title}</TaskText>
                ),
              )}
            </View>
          ) : null}
        </>
      ) : null}
      {receipt?.status === "reconciliation_required" ? (
        <>
          <TaskText>{t("Check the destination before taking another action.")}</TaskText>
          {!readOnly ? (
            <NativeActionButton
              label={t("Check outcome")}
              busy={busy}
              fill={false}
              prominence="secondary"
              onPress={() => void action("taskStarters/reconcile", { receiptId: activeReceiptId })}
            />
          ) : null}
        </>
      ) : null}
      {receipt?.status === "failed" && !readOnly ? (
        <NativeActionButton
          label={t("Retry retrieval")}
          busy={busy}
          onPress={() => void action("taskStarters/retry", { receiptId: activeReceiptId })}
        />
      ) : null}
      {error ? (
        <>
          <TaskText error>{error}</TaskText>
          <NativeActionButton
            label={t("Refresh receipt")}
            fill={false}
            prominence="secondary"
            disabled={busy}
            onPress={() => setPollingTick((tick) => tick + 1)}
          />
        </>
      ) : null}
    </TaskSheet>
  );
}
