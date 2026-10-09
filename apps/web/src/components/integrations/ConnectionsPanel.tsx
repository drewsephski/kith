import { Trans, useLingui } from "@lingui/react/macro";
import { connectedAppServices } from "@rakazo/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConnectorIcon,
} from "@rakazo/ui-web";
import { Plus, Trash2 } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { rpc } from "../../lib/rpc";
import { CalendarConnection } from "../CalendarConnection";
import { lazyOverlay } from "../ErrorBoundary";

const PluginsOverlay = lazyOverlay(() =>
  import("../../pages/PluginsOverlay").then((module) => module.PluginsOverlay),
);

type ConnectedService = ReturnType<typeof connectedAppServices>[number];
type RemovalTarget =
  | { kind: "service"; name: string; service: ConnectedService }
  | { kind: "calendar"; name: string };

export function ConnectionsPanel({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [services, setServices] = useState<ReturnType<typeof connectedAppServices>>([]);
  const [nativeCalendar, setNativeCalendar] = useState(false);
  const [calendarAvailable, setCalendarAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [removing, setRemoving] = useState<RemovalTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void Promise.allSettled([
      rpc.connections.list(),
      rpc.connections.catalog({}),
      rpc.calendar.status(),
    ]).then(([rows, catalog, calendar]) => {
      if (cancelled) return;
      setServices(
        connectedAppServices(
          rows.status === "fulfilled" ? rows.value : [],
          catalog.status === "fulfilled" ? catalog.value : [],
        ),
      );
      setNativeCalendar(
        calendar.status === "fulfilled" &&
          calendar.value.status === "connected" &&
          !calendar.value.managedConnectionId,
      );
      setCalendarAvailable(
        calendar.status === "fulfilled" &&
          (calendar.value.configured || calendar.value.canConfigure),
      );
      setError([rows, catalog, calendar].some((result) => result.status === "rejected"));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [botId, revision]);

  async function removeConnection() {
    if (!removing || busy) return;
    setBusy(true);
    setRemoveError(false);
    try {
      if (removing.kind === "calendar") {
        await rpc.calendar.disconnect();
      } else {
        const { service } = removing;
        if (service.connectionId) {
          await rpc.connections.revoke({ connectionId: service.connectionId });
        } else {
          await rpc.connections.revokeService({
            connectorId: service.connectorId,
            provider: service.slug,
          });
        }
      }
      setRemoving(null);
    } catch {
      setRemoveError(true);
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  return (
    <div className="space-y-4" data-testid="connections-panel">
      {services.length ? (
        <ul className="space-y-1" aria-label={t`Connected services`}>
          {services.map((service) => (
            <li key={service.key} className="flex min-w-0 items-center gap-3 py-2">
              <ConnectorIcon
                name={service.name}
                brand={service.slug}
                logo={service.logo}
                size={28}
              />
              <span className="min-w-0 flex-1 break-words text-sm">{service.name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t`Remove ${service.name}`}
                disabled={busy || loading || error}
                onClick={() => {
                  setRemoveError(false);
                  setRemoving({ kind: "service", name: service.name, service });
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {nativeCalendar ? (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <CalendarConnection key={revision} botId={botId} />
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={t`Remove Google Calendar`}
            disabled={busy || loading || error}
            onClick={() => {
              setRemoveError(false);
              setRemoving({ kind: "calendar", name: t`Google Calendar` });
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Loading connections…</Trans>
        </p>
      ) : error ? (
        <div role="alert" className="space-y-1">
          <p className="text-sm text-destructive">
            <Trans>Could not load all connections.</Trans>
          </p>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => setRevision((value) => value + 1)}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : !services.length && !nativeCalendar ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No connections yet</Trans>
        </p>
      ) : null}
      <Button variant="link" size="sm" className="gap-2 px-0" onClick={() => setOpen(true)}>
        <Plus size={15} />
        <Trans>Add connection</Trans>
      </Button>
      {calendarAvailable && !nativeCalendar ? (
        <Collapsible className="border-t border-border pt-3">
          <CollapsibleTrigger>
            <Trans>Calendar briefing</Trans>
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted={false} className="pt-2">
            <CalendarConnection botId={botId} />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setRemoving(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              <Trans>Remove {removing?.name}?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>Your assistant will lose access to this connection.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? (
            <p role="alert" className="text-sm text-destructive">
              <Trans>Could not remove connection. Try again.</Trans>
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void removeConnection()}
            >
              {busy ? <Trans>Removing…</Trans> : <Trans>Remove</Trans>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Suspense fallback={null}>
        {open ? (
          <PluginsOverlay
            connectorId="composio"
            activeBotId={botId}
            onClose={() => {
              setOpen(false);
              setRevision((value) => value + 1);
            }}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
