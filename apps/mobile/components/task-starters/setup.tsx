import type {
  Connection,
  ConnectionCatalogItem,
  TaskAnalyticsProperty,
  TaskStarterId,
  TaskStarterOptions,
  TaskStarterReceipt,
  TaskStarterSpec,
} from "@rakazo/contracts";
import { TaskStarterSpecSchema } from "@rakazo/contracts";
import {
  TASK_STARTERS,
  taskStarterApp,
  taskStarterSearchQuery,
  waitForAppConnection,
} from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { rpc } from "../../lib/api";
import { t } from "../../lib/i18n";
import { errorText } from "../../lib/user-error";
import { NativeActionButton } from "../native-action-button";
import { TaskField, TaskPicker, TaskSheet, TaskText, TaskToggle } from "./controls";
import { captureTaskScope } from "./scope";

type App = TaskStarterOptions["connections"][number]["app"];
const APP_NAMES: Record<App, string> = {
  gmail: "Gmail",
  calendar: "Google Calendar",
  hubspot: "HubSpot",
  analytics: "Google Analytics 4",
  sheets: "Google Sheets",
};
const METRICS: Array<{ id: TaskStarterSpec["metrics"][number]; label: string }> = [
  { id: "sessions", label: "Sessions" },
  { id: "activeUsers", label: "Active users" },
  { id: "screenPageViews", label: "Page views" },
  { id: "keyEvents", label: "Key events" },
  { id: "totalRevenue", label: "Revenue" },
];

export function TaskStarterSetup({
  starterId,
  prompt,
  botId,
  onClose,
  onStarted,
}: {
  starterId: TaskStarterId;
  prompt: string;
  botId: string;
  onClose: () => void;
  onStarted: (receipt: TaskStarterReceipt) => void;
}) {
  const scope = useRef(captureTaskScope());
  const controller = useRef(new AbortController());
  const nonce = useRef(
    globalThis.crypto?.randomUUID?.() ??
      `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<TaskStarterOptions | null>(null);
  const [properties, setProperties] = useState<TaskAnalyticsProperty[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [spec, setSpec] = useState<TaskStarterSpec>(() => ({
    starter: starterId,
    meetingId: null,
    meetingConnectionId: null,
    query: starterId === "gmail_search" ? taskStarterSearchQuery(prompt) : "",
    gmailConnectionIds: [],
    calendarConnectionIds: [],
    hubspotConnectionId: null,
    analyticsConnectionId: null,
    sheetsConnectionId: null,
    propertyId: null,
    spreadsheetId: null,
    reportRange: null,
    metrics: ["sessions", "activeUsers", "screenPageViews"],
    period: "this_week",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    lookbackDays: 7,
  }));
  const [existingSheet, setExistingSheet] = useState(false);
  const current = () => !controller.current.signal.aborted && scope.current();

  function update(patch: Partial<TaskStarterSpec>) {
    if (locked.current) return;
    setSpec((previous) => ({ ...previous, ...patch }));
    nonce.current =
      globalThis.crypto?.randomUUID?.() ??
      `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setError(null);
  }

  async function load() {
    const next = await rpc<TaskStarterOptions>(
      "taskStarters/options",
      {},
      { signal: controller.current.signal },
    );
    if (current()) setOptions(next);
    return next;
  }

  useEffect(() => {
    controller.current = new AbortController();
    void load().catch((reason) => {
      if (current()) setError(errorText(reason, t("Could not load accounts")));
    });
    return () => controller.current.abort();
  }, []);

  useEffect(() => {
    setProperties([]);
    if (!spec.analyticsConnectionId) return;
    const abort = new AbortController();
    setLoadingProperties(true);
    void rpc<TaskAnalyticsProperty[]>(
      "taskStarters/properties",
      { connectionId: spec.analyticsConnectionId },
      { signal: abort.signal },
    )
      .then((next) => {
        if (!abort.signal.aborted && current()) setProperties(next);
      })
      .catch((reason) => {
        if (!abort.signal.aborted && current())
          setError(errorText(reason, t("Could not load properties")));
      })
      .finally(() => {
        if (!abort.signal.aborted && current()) setLoadingProperties(false);
      });
    return () => abort.abort();
  }, [spec.analyticsConnectionId]);

  async function finishConnection(connectionId: string, authorizationUrl: string | null = null) {
    if (authorizationUrl) await Linking.openURL(authorizationUrl);
    const connection = await waitForAppConnection(
      () => {
        if (!current()) throw new Error("The active workspace changed");
        return rpc<Connection>(
          "connections/complete",
          { connectionId },
          { signal: controller.current.signal },
        );
      },
      { signal: controller.current.signal },
    );
    if (current()) await load();
    if (connection.status !== "connected")
      throw new Error(
        connection.status === "pending"
          ? t("Authorization is still pending. Finish connecting to continue.")
          : t("Account authorization did not complete."),
      );
  }

  async function checkPending(connectionId: string) {
    if (locked.current || !current()) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await finishConnection(connectionId);
    } catch (reason) {
      if (current()) setError(errorText(reason, t("Could not check account")));
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  async function connect(app: App) {
    if (locked.current || !current()) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const catalog = await rpc<ConnectionCatalogItem[]>(
        "connections/catalog",
        { query: app },
        { signal: controller.current.signal },
      );
      if (!current()) return;
      const item = catalog.find(
        (entry) => entry.connectorId === "composio" && taskStarterApp(entry.slug) === app,
      );
      if (!item)
        throw new Error(
          t("{name} is unavailable. Check integrations in Settings.", { name: APP_NAMES[app] }),
        );
      const started = await rpc<{ connectionId: string; authorizationUrl: string | null }>(
        "connections/begin",
        { connectorId: item.connectorId, provider: item.slug, displayName: item.name },
        { signal: controller.current.signal },
      );
      if (!current()) return;
      await finishConnection(started.connectionId, started.authorizationUrl);
    } catch (reason) {
      if (current()) setError(errorText(reason, t("Could not connect account")));
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  function accounts(
    app: App,
    multiple: boolean,
    ids: string[],
    choose: (id: string, selected: boolean) => void,
  ) {
    const rows =
      options?.connections.filter((row) => row.app === app && row.status === "connected") ?? [];
    return (
      <View style={{ gap: 10 }}>
        <TaskText>{APP_NAMES[app]}</TaskText>
        {multiple ? (
          rows.map((row) => (
            <TaskToggle
              key={row.id}
              label={row.identity ? `${row.name} · ${row.identity}` : row.name}
              value={ids.includes(row.id)}
              disabled={busy}
              onChange={(selected) => choose(row.id, selected)}
            />
          ))
        ) : (
          <TaskPicker
            label={t("{name} account", { name: APP_NAMES[app] })}
            value={ids[0] ?? ""}
            choices={[
              { id: "", label: t("Choose") },
              ...rows.map((row) => ({
                id: row.id,
                label: row.identity ? `${row.name} · ${row.identity}` : row.name,
              })),
            ]}
            disabled={busy}
            onChange={(id) => choose(id, Boolean(id))}
          />
        )}
        {options?.connections
          .filter((row) => row.app === app && row.status === "pending")
          .map((row) => (
            <NativeActionButton
              key={row.id}
              label={t("Finish connecting {name}", { name: row.name })}
              disabled={busy}
              fill={false}
              prominence="secondary"
              onPress={() => void checkPending(row.id)}
            />
          ))}
        <NativeActionButton
          label={t("Connect {name}", { name: APP_NAMES[app] })}
          disabled={busy || !options?.configured}
          fill={false}
          prominence="plain"
          onPress={() => void connect(app)}
        />
      </View>
    );
  }

  const gmail = accounts("gmail", true, spec.gmailConnectionIds, (id, selected) =>
    update({
      gmailConnectionIds: selected
        ? [...spec.gmailConnectionIds, id]
        : spec.gmailConnectionIds.filter((value) => value !== id),
    }),
  );
  const validated = TaskStarterSpecSchema.safeParse(spec);
  async function start() {
    if (locked.current || !validated.success || !current()) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const receipt = await rpc<TaskStarterReceipt>(
        "taskStarters/start",
        { botId, prompt, clientNonce: nonce.current, spec: validated.data },
        { signal: controller.current.signal },
      );
      if (current()) onStarted(receipt);
    } catch (reason) {
      if (current()) setError(errorText(reason, t("Could not start task")));
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  return (
    <TaskSheet
      title={t(TASK_STARTERS.find((starter) => starter.id === starterId)?.title ?? "Start task")}
      onClose={onClose}
    >
      {!options ? (
        <NativeActionButton
          label={t("Load accounts")}
          busy={busy}
          prominence="secondary"
          onPress={() =>
            void load().catch((reason) => setError(errorText(reason, t("Could not load accounts"))))
          }
        />
      ) : !options.configured ? (
        <TaskText>{t("Configure integrations in Settings to connect accounts.")}</TaskText>
      ) : null}
      {starterId === "gmail_search" ? (
        <TaskField
          disabled={busy}
          label={t("Search for")}
          value={spec.query}
          onChange={(query) => update({ query })}
        />
      ) : null}
      {starterId === "gmail_search" || starterId === "inbox_todos" || starterId === "meeting_brief"
        ? gmail
        : null}
      {starterId === "inbox_todos" ? (
        <TaskPicker
          label={t("Emails from")}
          value={String(spec.lookbackDays)}
          choices={[
            { id: "1", label: t("Today") },
            { id: "7", label: t("Past seven days") },
            { id: "30", label: t("Past thirty days") },
          ]}
          onChange={(id) => update({ lookbackDays: Number(id) })}
        />
      ) : null}
      {starterId === "meeting_brief" ? (
        <>
          {accounts("calendar", true, spec.calendarConnectionIds, (id, selected) =>
            update({
              calendarConnectionIds: selected
                ? [...spec.calendarConnectionIds, id]
                : spec.calendarConnectionIds.filter((value) => value !== id),
            }),
          )}
          {accounts(
            "hubspot",
            false,
            spec.hubspotConnectionId ? [spec.hubspotConnectionId] : [],
            (id) => update({ hubspotConnectionId: id || null }),
          )}
        </>
      ) : null}
      {starterId === "analytics_report" ? (
        <>
          {accounts(
            "analytics",
            false,
            spec.analyticsConnectionId ? [spec.analyticsConnectionId] : [],
            (id) => update({ analyticsConnectionId: id || null, propertyId: null }),
          )}
          <TaskPicker
            label={loadingProperties ? t("Loading properties…") : t("Property")}
            value={spec.propertyId ?? ""}
            disabled={loadingProperties || busy}
            choices={[
              { id: "", label: t("Choose") },
              ...properties.map((property) => ({ id: property.id, label: property.name })),
            ]}
            onChange={(id) =>
              update({
                propertyId: id || null,
                timezone:
                  properties.find((property) => property.id === id)?.timezone ?? spec.timezone,
              })
            }
          />
          {spec.analyticsConnectionId && !loadingProperties && !properties.length ? (
            <NativeActionButton
              label={t("Reload properties")}
              fill={false}
              prominence="plain"
              disabled={busy}
              onPress={() => {
                setLoadingProperties(true);
                void rpc<TaskAnalyticsProperty[]>(
                  "taskStarters/properties",
                  { connectionId: spec.analyticsConnectionId },
                  { signal: controller.current.signal },
                )
                  .then((next) => {
                    if (current()) setProperties(next);
                  })
                  .catch((reason) => {
                    if (current()) setError(errorText(reason, t("Could not load properties")));
                  })
                  .finally(() => {
                    if (current()) setLoadingProperties(false);
                  });
              }}
            />
          ) : null}
          <TaskPicker
            label={t("Period")}
            value={spec.period}
            choices={[
              { id: "this_week", label: t("This week to date") },
              { id: "last_week", label: t("Last week") },
            ]}
            onChange={(id) => update({ period: id as TaskStarterSpec["period"] })}
          />
          {METRICS.map((metric) => (
            <TaskToggle
              key={metric.id}
              label={t(metric.label)}
              value={spec.metrics.includes(metric.id)}
              disabled={busy}
              onChange={(selected) =>
                update({
                  metrics: selected
                    ? [...spec.metrics, metric.id]
                    : spec.metrics.filter((value) => value !== metric.id),
                })
              }
            />
          ))}
          {accounts(
            "sheets",
            false,
            spec.sheetsConnectionId ? [spec.sheetsConnectionId] : [],
            (id) => update({ sheetsConnectionId: id || null }),
          )}
          <TaskToggle
            label={t("Use an existing Sheet")}
            value={existingSheet}
            disabled={busy}
            onChange={(value) => {
              setExistingSheet(value);
              update({ spreadsheetId: value ? "" : null });
            }}
          />
          {existingSheet ? (
            <TaskField
              disabled={busy}
              label={t("Spreadsheet ID")}
              value={spec.spreadsheetId ?? ""}
              onChange={(spreadsheetId) => update({ spreadsheetId })}
            />
          ) : null}
        </>
      ) : null}
      <TaskField
        disabled={busy}
        label={t("Timezone")}
        value={spec.timezone}
        onChange={(timezone) => update({ timezone })}
      />
      {error ? <TaskText error>{error}</TaskText> : null}
      <NativeActionButton
        label={t("Start task")}
        busy={busy}
        disabled={!validated.success || !options?.configured}
        onPress={() => void start()}
      />
    </TaskSheet>
  );
}
