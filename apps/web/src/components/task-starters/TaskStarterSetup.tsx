import { Trans, useLingui } from "@lingui/react/macro";
import type {
  ConnectionCatalogItem,
  IntegrationSetupState,
  TaskAnalyticsProperty,
  TaskStarterId,
  TaskStarterOptions,
} from "@rakazo/contracts";
import { TaskStarterSpecSchema } from "@rakazo/contracts";
import { taskStarterApp, taskStarterSearchQuery } from "@rakazo/core";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  SelectField,
} from "@rakazo/ui-web";
import { useEffect, useId, useRef, useState } from "react";
import type { AppAuthorization } from "../../lib/app-connect";
import { checkAppAccount, connectAppAccount } from "../../lib/app-connect";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";
import { IntegrationSetup } from "../integrations/IntegrationSetup";

export type TaskStarterDraft = {
  starter: TaskStarterId;
  prompt: string;
  clientNonce: string;
  botId: string;
  target: string;
};
type App = TaskStarterOptions["connections"][number]["app"];

export function TaskStarterSetup({
  draft,
  onClose,
  onStarted,
}: {
  draft: TaskStarterDraft;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useLingui();
  const fieldId = useId();
  const [options, setOptions] = useState<TaskStarterOptions | null>(null);
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [setupState, setSetupState] = useState<IntegrationSetupState | null>(null);
  const [authorization, setAuthorization] = useState<AppAuthorization | null>(null);
  const [query, setQuery] = useState(() =>
    draft.starter === "gmail_search" ? taskStarterSearchQuery(draft.prompt) : "",
  );
  const [gmail, setGmail] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<string[]>([]);
  const [hubspot, setHubspot] = useState("");
  const [analytics, setAnalytics] = useState("");
  const [sheets, setSheets] = useState("");
  const [properties, setProperties] = useState<TaskAnalyticsProperty[]>([]);
  const [property, setProperty] = useState("");
  const [metrics, setMetrics] = useState(["sessions", "activeUsers", "screenPageViews"]);
  const [period, setPeriod] = useState("this_week");
  const [destination, setDestination] = useState("new");
  const [spreadsheet, setSpreadsheet] = useState("");
  const [lookback, setLookback] = useState("7");
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const refresh = async () => {
    const [next, items, integrationSetup] = await Promise.all([
      rpc.taskStarters.options(),
      rpc.connections.catalog({}),
      rpc.integrationSetup.get(),
    ]);
    if (alive.current) {
      setOptions(next);
      setCatalog(items);
      setSetupState(integrationSetup);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh().catch((cause: unknown) => {
      if (alive.current) setError(errorText(cause, t`Could not load connections`));
    });
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, [t]);
  useEffect(() => {
    setProperty("");
    setProperties([]);
    if (!analytics) return;
    let cancelled = false;
    void rpc.taskStarters
      .properties({ connectionId: analytics })
      .then((next) => {
        if (!cancelled) setProperties(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorText(cause, t`Could not load analytics properties`));
      });
    return () => {
      cancelled = true;
    };
  }, [analytics, t]);
  const appNames: Record<App, string> = {
    gmail: "Gmail",
    calendar: "Google Calendar",
    hubspot: "HubSpot",
    analytics: "Google Analytics 4",
    sheets: "Google Sheets",
  };
  async function connect(item: ConnectionCatalogItem) {
    controller.current?.abort();
    const attempt = new AbortController();
    controller.current = attempt;
    setBusy(true);
    setError(null);
    setAuthorization(null);
    try {
      const connection = await connectAppAccount(item, {
        signal: attempt.signal,
        onAuthorization: (next) => {
          if (!attempt.signal.aborted && alive.current) setAuthorization(next);
        },
      });
      if (connection.status === "connected") {
        setAuthorization(null);
        await refresh();
        return;
      }
      throw new Error(t`Authorization is still pending. Check the connection and try again.`);
    } catch (cause) {
      if (!attempt.signal.aborted && alive.current)
        setError(errorText(cause, t`Could not connect account`));
    } finally {
      if (controller.current === attempt) controller.current = null;
      if (!attempt.signal.aborted && alive.current) setBusy(false);
    }
  }
  async function checkConnection() {
    if (!authorization) return;
    controller.current?.abort();
    const attempt = new AbortController();
    controller.current = attempt;
    setBusy(true);
    setError(null);
    try {
      const connection = await checkAppAccount(authorization, attempt.signal);
      if (attempt.signal.aborted || !alive.current) return;
      if (connection.status !== "connected")
        throw new Error(t`Authorization is still pending. Check the connection and try again.`);
      setAuthorization(null);
      await refresh();
    } catch (cause) {
      if (!attempt.signal.aborted && alive.current)
        setError(errorText(cause, t`Could not connect account`));
    } finally {
      if (controller.current === attempt) controller.current = null;
      if (!attempt.signal.aborted && alive.current) setBusy(false);
    }
  }
  function accountPicker(
    app: App,
    selected: string[],
    change: (next: string[]) => void,
    multiple = true,
  ) {
    const rows = options?.connections.filter((row) => row.app === app) ?? [];
    const providers = catalog.filter((item) => taskStarterApp(item.slug) === app);
    return (
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="mb-2 font-medium">{appNames[app]}</legend>
        {rows.map((row) => (
          <label
            htmlFor={`${fieldId}-${row.id}`}
            key={row.id}
            className="flex min-h-9 items-center gap-3 break-all"
          >
            <Checkbox
              id={`${fieldId}-${row.id}`}
              disabled={row.status !== "connected"}
              checked={selected.includes(row.id)}
              onCheckedChange={(checked) => {
                setError(null);
                change(
                  checked
                    ? multiple
                      ? [...selected, row.id]
                      : [row.id]
                    : selected.filter((id) => id !== row.id),
                );
              }}
            />
            <span>
              {row.name}
              {row.identity ? ` · ${row.identity}` : ""}
              {row.status !== "connected" ? ` · ${row.status}` : ""}
            </span>
          </label>
        ))}
        {providers.map((item) => (
          <Button
            key={`${item.connectorId}:${item.slug}`}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void connect(item)}
          >
            <Trans>Connect {appNames[app]}</Trans>
          </Button>
        ))}
        {options?.configured && providers.length === 0 && rows.length === 0 ? (
          <p className="text-muted-foreground">
            <Trans>This app is unavailable from the configured integration provider.</Trans>
          </p>
        ) : null}
      </fieldset>
    );
  }
  async function start() {
    setError(null);
    const selectedProperty = properties.find((row) => row.id === property);
    const parsed = TaskStarterSpecSchema.safeParse({
      starter: draft.starter,
      query,
      gmailConnectionIds: gmail,
      calendarConnectionIds: calendar,
      hubspotConnectionId: hubspot || null,
      analyticsConnectionId: analytics || null,
      sheetsConnectionId: sheets || null,
      propertyId: property || null,
      spreadsheetId: destination === "existing" ? spreadsheet.trim() : null,
      metrics,
      period,
      timezone: selectedProperty?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      lookbackDays: Number(lookback),
    });
    if (destination === "existing" && !spreadsheet.trim()) {
      setError(t`Enter a spreadsheet ID.`);
      return;
    }
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t`Check your selections.`);
      return;
    }
    setBusy(true);
    try {
      await rpc.taskStarters.start({
        botId: draft.botId,
        clientNonce: draft.clientNonce,
        prompt: draft.prompt,
        spec: parsed.data,
      });
      onStarted();
    } catch (cause) {
      setError(errorText(cause, t`Could not start task`));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && (!busy || controller.current)) onClose();
      }}
    >
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!busy || Boolean(controller.current)}
      >
        <DialogTitle>
          <Trans>Choose task sources</Trans>
        </DialogTitle>
        <p className="break-words text-muted-foreground">{draft.prompt}</p>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        {!options ? (
          <Button
            variant="outline"
            onClick={() => void refresh().catch((cause: unknown) => setError(errorText(cause)))}
          >
            <Trans>Load connections</Trans>
          </Button>
        ) : null}
        {options && !options.configured && setupState?.canConfigure ? (
          <>
            <Button variant="outline" onClick={() => setSetup((value) => !value)}>
              <Trans>Configure integrations</Trans>
            </Button>
            {setup ? (
              <IntegrationSetup
                serverSetup
                managedOnly
                initialState={setupState}
                onDone={() => {
                  setSetup(false);
                  void refresh().catch((cause: unknown) => setError(errorText(cause)));
                }}
              />
            ) : null}
          </>
        ) : null}
        {options && !options.configured && setupState && !setupState.canConfigure ? (
          <p className="text-muted-foreground">
            <Trans>Ask the server owner to enable app connections.</Trans>
          </p>
        ) : null}
        {authorization ? (
          <div role="status" className="flex flex-wrap items-center gap-3">
            <a
              className="text-sm underline"
              href={authorization.authorizationUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Trans>Continue in browser</Trans>
            </a>
            {!busy ? (
              <Button variant="outline" size="sm" onClick={() => void checkConnection()}>
                <Trans>Check connection</Trans>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  controller.current?.abort();
                  controller.current = null;
                  setBusy(false);
                }}
              >
                <Trans>Stop waiting</Trans>
              </Button>
            )}
          </div>
        ) : null}
        {draft.starter === "gmail_search" ? (
          <label htmlFor={`${fieldId}-query`} className="space-y-2">
            <span>
              <Trans>Search topic</Trans>
            </span>
            <Input
              id={`${fieldId}-query`}
              aria-label={t`Search topic`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}
        {draft.starter === "gmail_search" || draft.starter === "inbox_todos"
          ? accountPicker("gmail", gmail, setGmail)
          : null}
        {draft.starter === "inbox_todos" ? (
          <label htmlFor={`${fieldId}-lookback`} className="space-y-2">
            <span>
              <Trans>Look back in days</Trans>
            </span>
            <Input
              type="number"
              min={1}
              max={30}
              id={`${fieldId}-lookback`}
              aria-label={t`Look back in days`}
              value={lookback}
              onChange={(event) => setLookback(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}
        {draft.starter === "meeting_brief" ? (
          <>
            {accountPicker("calendar", calendar, setCalendar)}
            <details>
              <summary className="cursor-pointer">
                <Trans>Email and CRM context (optional)</Trans>
              </summary>
              <div className="space-y-4 pt-3">
                {accountPicker("gmail", gmail, setGmail)}
                {accountPicker(
                  "hubspot",
                  hubspot ? [hubspot] : [],
                  (rows) => setHubspot(rows[0] ?? ""),
                  false,
                )}
              </div>
            </details>
          </>
        ) : null}
        {draft.starter === "analytics_report" ? (
          <>
            {accountPicker(
              "analytics",
              analytics ? [analytics] : [],
              (rows) => setAnalytics(rows[0] ?? ""),
              false,
            )}
            {analytics ? (
              <SelectField
                aria-label={t`Analytics property`}
                value={property}
                onValueChange={setProperty}
                items={[
                  { value: "", label: t`Choose a property` },
                  ...properties.map((row) => ({
                    value: row.id,
                    label: `${row.name} · ${row.timezone}`,
                  })),
                ]}
                disabled={busy}
              />
            ) : null}
            <SelectField
              aria-label={t`Report period`}
              value={period}
              onValueChange={setPeriod}
              items={[
                { value: "this_week", label: t`This week to date` },
                { value: "last_week", label: t`Last week` },
              ]}
              disabled={busy}
            />
            <fieldset className="space-y-2" disabled={busy}>
              <legend className="mb-2 font-medium">
                <Trans>Metrics</Trans>
              </legend>
              {(
                [
                  ["sessions", t`Sessions`],
                  ["activeUsers", t`Active users`],
                  ["screenPageViews", t`Page views`],
                  ["keyEvents", t`Key events`],
                  ["totalRevenue", t`Revenue`],
                ] as const
              ).map(([id, label]) => (
                <label
                  htmlFor={`${fieldId}-metric-${id}`}
                  key={id}
                  className="flex min-h-8 items-center gap-3"
                >
                  <Checkbox
                    id={`${fieldId}-metric-${id}`}
                    checked={metrics.includes(id)}
                    onCheckedChange={(checked) =>
                      setMetrics((rows) =>
                        checked ? [...rows, id] : rows.filter((value) => value !== id),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {accountPicker(
              "sheets",
              sheets ? [sheets] : [],
              (rows) => setSheets(rows[0] ?? ""),
              false,
            )}
            <SelectField
              aria-label={t`Report destination`}
              value={destination}
              onValueChange={setDestination}
              items={[
                { value: "new", label: t`New spreadsheet` },
                { value: "existing", label: t`Existing spreadsheet` },
              ]}
              disabled={busy}
            />
            {destination === "existing" ? (
              <Input
                aria-label={t`Spreadsheet ID`}
                placeholder={t`Spreadsheet ID`}
                value={spreadsheet}
                onChange={(event) => setSpreadsheet(event.target.value)}
                disabled={busy}
              />
            ) : null}
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy && !controller.current} onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button disabled={busy || !options?.configured} onClick={() => void start()}>
            {busy ? (
              <Trans>Working…</Trans>
            ) : draft.starter === "analytics_report" ? (
              <Trans>Preview report</Trans>
            ) : (
              <Trans>Start task</Trans>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
