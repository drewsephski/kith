import { Trans, useLingui } from "@lingui/react/macro";
import type { MemoryDocument } from "@rakazo/contracts";
import { CALENDAR_PREFERENCES_PATH, resolveFeaturedCatalogItem } from "@rakazo/core";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Input,
  SelectField,
  Textarea,
} from "@rakazo/ui-web";
import { CalendarDays, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AppAuthorization } from "../lib/app-connect";
import { connectAppAccount } from "../lib/app-connect";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { IntegrationSetup } from "./integrations/IntegrationSetup";

export function CalendarConnection({
  botId,
  compact = false,
}: {
  botId: string;
  compact?: boolean;
}) {
  const { t } = useLingui();
  const fieldId = useId();
  const [state, setState] = useState<Awaited<ReturnType<typeof rpc.calendar.status>> | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorization, setAuthorization] = useState<AppAuthorization | null>(null);
  const [accountId, setAccountId] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const connectionAttempt = useRef<AbortController | null>(null);
  useEffect(() => () => connectionAttempt.current?.abort(), [botId]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [preferences, setPreferences] = useState<MemoryDocument | null>(null);
  const [draft, setDraft] = useState("");
  const draftDirty = useRef(false);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await rpc.calendar.status();
        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) setError(t`Could not load Calendar connection`);
      }
    };
    void load();
    // Poll only during OAuth; the server callback owns completion and task creation.
    const timer =
      state?.status === "pending" ? window.setInterval(() => void load(), 2000) : undefined;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [botId, state?.status, t]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void rpc.memory
      .list({ scope: "user" })
      .then((docs) => {
        if (cancelled) return;
        const doc = docs.find((d) => d.path === CALENDAR_PREFERENCES_PATH) ?? null;
        setPreferences(doc);
        if (!draftDirty.current) setDraft(doc?.content ?? "");
      })
      .catch(() => {
        if (!cancelled) setError(t`Could not load preferences`);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setState(await rpc.calendar.status());
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setError(errorText(error, t`Could not update Calendar. Try again.`));
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    if (!state?.configured) {
      setOpen(true);
      return;
    }
    await action(async () => {
      if (state.managedConnectorId) {
        const controller = new AbortController();
        connectionAttempt.current?.abort();
        connectionAttempt.current = controller;
        try {
          let connectionId = accountId || state.managedConnections?.[0]?.id;
          if (!connectionId) {
            const catalog = await rpc.connections.catalog({
              connectorId: state.managedConnectorId,
            });
            const item = resolveFeaturedCatalogItem("google-calendar", catalog);
            if (!item) throw new Error(t`Calendar is unavailable. Try again.`);
            const row = await connectAppAccount(item, {
              signal: controller.signal,
              onAuthorization: (authorization) => {
                setAuthorization(authorization);
                setOpen(true);
              },
            });
            if (row.status !== "connected")
              throw new Error(t`Finish connecting Calendar in the browser, then try again.`);
            connectionId = row.id;
          }
          controller.signal.throwIfAborted();
          await rpc.calendar.connectAccount({ connectionId, botId, timezone });
          setAuthorization(null);
          setOpen(false);
          return;
        } finally {
          if (connectionAttempt.current === controller) connectionAttempt.current = null;
        }
      }
      const { authorizationUrl } = await rpc.calendar.begin({ botId, timezone });
      const popup = window.open(authorizationUrl, "_blank", "noopener,noreferrer");
      // Electron routes this window to the system browser. Its return value is null.
      if (!popup && !window.rakazoDesktop) window.location.assign(authorizationUrl);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        aria-label={
          state?.status === "connected"
            ? t`Calendar`
            : busy || state?.status === "pending"
              ? t`Connecting Calendar…`
              : t`Connect Google Calendar`
        }
        size="sm"
        className="app-no-drag max-w-full gap-2"
        disabled={busy || !state}
        onClick={() =>
          state?.connectionId || (state?.managedConnections?.length ?? 0) > 1
            ? setOpen(true)
            : void connect()
        }
      >
        <CalendarDays size={16} aria-hidden />
        <span className={compact ? "hidden sm:inline" : "truncate"}>
          {state?.status === "connected"
            ? t`Calendar`
            : busy || state?.status === "pending"
              ? t`Connecting Calendar…`
              : t`Connect Google Calendar`}
        </span>
      </Button>
      {error && !open ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-h-[85dvh] max-w-lg overflow-y-auto">
          <div className="flex items-center justify-between">
            <DialogTitle>
              <Trans>Google Calendar</Trans>
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
          {!state?.configured ? (
            state?.canConfigure ? (
              <div className="space-y-4">
                {setupOpen ? (
                  <IntegrationSetup
                    serverSetup
                    managedOnly
                    onDone={() =>
                      void action(async () => {
                        setSetupOpen(false);
                      })
                    }
                  />
                ) : (
                  <Button onClick={() => setSetupOpen(true)}>
                    <Trans>Set up app connections</Trans>
                  </Button>
                )}
                <Collapsible>
                  <CollapsibleTrigger className="cursor-pointer text-sm text-muted-foreground">
                    <Trans>Use your own Google OAuth app</Trans>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    {" "}
                    <div className="space-y-3">
                      <label htmlFor={`${fieldId}-client`} className="block text-sm">
                        <Trans>OAuth Client ID</Trans>
                        <Input
                          id={`${fieldId}-client`}
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <label htmlFor={`${fieldId}-secret`} className="block text-sm">
                        <Trans>OAuth Client secret</Trans>
                        <Input
                          id={`${fieldId}-secret`}
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <p className="break-all text-xs text-muted-foreground">
                        <Trans>Redirect URI</Trans>: {state?.redirectUri}
                      </p>
                      <Button
                        disabled={busy || !clientId.trim() || !clientSecret.trim()}
                        onClick={() =>
                          void action(async () => {
                            await rpc.calendar.configure({ clientId, clientSecret });
                            setClientSecret("");
                          })
                        }
                      >
                        <Trans>Save connection settings</Trans>
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Trans>Ask the server owner to set up Google Calendar.</Trans>
              </p>
            )
          ) : null}
          {authorization ? (
            <div className="flex flex-wrap gap-3">
              <a
                className="text-sm underline"
                href={authorization.authorizationUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Trans>Continue in browser</Trans>
              </a>
              {busy ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => connectionAttempt.current?.abort()}
                >
                  <Trans>Stop waiting</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
          {state?.configured && state.status !== "connected" ? (
            <div className="space-y-3">
              {(state.managedConnections?.length ?? 0) > 1 ? (
                <SelectField
                  aria-label={t`Calendar account`}
                  value={accountId || state.managedConnections[0]?.id || ""}
                  onValueChange={setAccountId}
                  items={state.managedConnections.map((connection) => ({
                    value: connection.id,
                    label: connection.displayName,
                  }))}
                />
              ) : null}
              <label htmlFor={`${fieldId}-timezone`} className="block text-sm">
                <Trans>Timezone</Trans>
                <Input
                  id={`${fieldId}-timezone`}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                <Trans>Read-only access. Your briefing starts when you connect.</Trans>
              </p>
              <Button disabled={busy || !timezone} onClick={() => void connect()}>
                <Trans>Connect Google Calendar</Trans>
              </Button>
            </div>
          ) : null}
          {state?.connectionId ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void action(() => rpc.calendar.disconnect().then(() => undefined))}
            >
              {state.managedConnectionId ? (
                <Trans>Disconnect briefing</Trans>
              ) : (
                <Trans>Disconnect Calendar</Trans>
              )}
            </Button>
          ) : null}
          <Collapsible className="space-y-3">
            <CollapsibleTrigger className="cursor-pointer text-sm">
              <Trans>Briefing preferences</Trans>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea
                aria-label={t`Briefing preferences`}
                value={draft}
                onChange={(e) => {
                  draftDirty.current = true;
                  setDraft(e.target.value);
                }}
                maxLength={4000}
                rows={4}
                placeholder={t`What should your assistant keep in mind?`}
              />
              <div className="flex gap-2">
                <Button
                  disabled={busy || draft === (preferences?.content ?? "")}
                  onClick={() =>
                    void action(async () => {
                      await rpc.calendar.preferences({
                        botId,
                        content: draft,
                        expectedRevision: preferences?.revision ?? 0,
                      });
                      const docs = await rpc.memory.list({ scope: "user" });
                      setPreferences(
                        docs.find((d) => d.path === CALENDAR_PREFERENCES_PATH) ?? null,
                      );
                    })
                  }
                >
                  <Trans>Save preferences</Trans>
                </Button>
                {preferences ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await rpc.memory.remove({ documentId: preferences.id });
                        setPreferences(null);
                        draftDirty.current = false;
                        setDraft("");
                      })
                    }
                  >
                    <Trans>Forget</Trans>
                  </Button>
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </DialogContent>
      </Dialog>
    </>
  );
}
