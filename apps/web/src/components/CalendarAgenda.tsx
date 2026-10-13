import { Trans, useLingui } from "@lingui/react/macro";
import type { CalendarEvent, CalendarSnapshot } from "@rakazo/contracts";
import { calendarAgendaEvents, calendarEventUrl } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

export function CalendarAgenda() {
  const { t, i18n } = useLingui();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    snapshots: CalendarSnapshot[];
    unavailable: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void rpc.calendar
      .agenda(
        { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) },
      )
      .then(
        (next) => {
          if (!controller.signal.aborted) {
            setState(next);
            setLoading(false);
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setState({ snapshots: [], unavailable: true });
            setLoading(false);
          }
        },
      );
    return () => controller.abort();
  }, [revision]);
  const events = calendarAgendaEvents(state?.snapshots ?? []);
  const format = (event: CalendarEvent) => {
    if (event.allDay)
      return `${new Date(`${event.start.slice(0, 10)}T12:00:00`).toLocaleDateString(i18n.locale || "en", { weekday: "short", month: "short", day: "numeric" })} · ${t`All day`}`;
    return new Date(event.start).toLocaleString(i18n.locale || "en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  return (
    <section
      aria-label={t`Upcoming schedule`}
      data-testid="calendar-agenda"
      className="space-y-3 border-t border-border pt-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          <Trans>Upcoming</Trans>
        </h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <Trans>Refresh</Trans>
        </Button>
      </div>
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Loading schedule…</Trans>
        </p>
      ) : (
        <>
          {state?.unavailable ? (
            <p role="alert" className="text-sm text-muted-foreground">
              <Trans>Could not load every calendar. Try refreshing.</Trans>
            </p>
          ) : !events.length ? (
            <p className="text-sm text-muted-foreground">
              <Trans>No events in the next seven days.</Trans>
            </p>
          ) : null}
          <ul className="space-y-4">
            {events.map((event) => (
              <li key={`${event.calendarId}:${event.id}`} className="min-w-0 space-y-1 text-sm">
                {event.url && calendarEventUrl(event.url) ? (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-words underline underline-offset-4"
                  >
                    {event.title || t`Untitled event`}
                  </a>
                ) : (
                  <p className="break-words">{event.title || t`Untitled event`}</p>
                )}
                <p className="text-xs text-muted-foreground">{format(event)}</p>
                {event.location ? (
                  <p className="break-words text-xs text-muted-foreground">{event.location}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
