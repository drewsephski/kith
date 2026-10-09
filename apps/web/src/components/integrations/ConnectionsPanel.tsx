import { Trans, useLingui } from "@lingui/react/macro";
import { connectedAppServices } from "@rakazo/core";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConnectorIcon,
} from "@rakazo/ui-web";
import { Plus } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { rpc } from "../../lib/rpc";
import { CalendarConnection } from "../CalendarConnection";
import { lazyOverlay } from "../ErrorBoundary";

const PluginsOverlay = lazyOverlay(() =>
  import("../../pages/PluginsOverlay").then((module) => module.PluginsOverlay),
);

export function ConnectionsPanel({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [services, setServices] = useState<ReturnType<typeof connectedAppServices>>([]);
  const [nativeCalendar, setNativeCalendar] = useState(false);
  const [calendarAvailable, setCalendarAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);

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
              <span className="min-w-0 break-words text-sm">{service.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {nativeCalendar ? <CalendarConnection botId={botId} /> : null}
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
          <Trans>No connected services</Trans>
        </p>
      ) : null}
      <Button variant="link" size="sm" className="gap-2 px-0" onClick={() => setOpen(true)}>
        <Plus size={15} />
        <Trans>Connect services</Trans>
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
