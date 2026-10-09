import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskStarterReceipt } from "@rakazo/contracts";
import { CalendarTimezone } from "@rakazo/contracts";
import { nextCronDateAcrossStrict } from "@rakazo/core";
import { Button, Input, Label, SelectField } from "@rakazo/ui-web";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

export function RepeatTask({ receipt }: { receipt: TaskStarterReceipt }) {
  const { t, i18n } = useLingui();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [time, setTime] = useState("09:00");
  const [timezone, setTimezone] = useState(receipt.repeat?.timezone ?? "UTC");
  const [busy, setBusy] = useState(false);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!receipt.repeat || receipt.status !== "completed") return null;
  const [hour, minute] = time.split(":").map(Number);
  const valid =
    /^\d{2}:\d{2}$/.test(time) &&
    hour! < 24 &&
    minute! < 60 &&
    CalendarTimezone.safeParse(timezone).success;
  const cron = `${minute} ${hour} * * ${frequency === "weekly" ? "1" : "*"}`;
  const next = valid ? nextCronDateAcrossStrict([cron], new Date(), timezone) : null;
  if (routineId)
    return (
      <p role="status">
        <Trans>Scheduled.</Trans>{" "}
        <Link
          className="underline underline-offset-2"
          to={`?routine=${encodeURIComponent(routineId)}`}
        >
          <Trans>Manage routine</Trans>
        </Link>
      </p>
    );
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Trans>Make this a routine</Trans>
      </Button>
      {open ? (
        <div className="space-y-3">
          <p className="font-medium">{receipt.repeat.name}</p>
          <p className="text-xs text-muted-foreground">{receipt.repeat.sources.join(" · ")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              aria-label={t`Frequency`}
              value={frequency}
              onValueChange={setFrequency}
              disabled={busy}
              items={[
                { value: "daily", label: t`Every day` },
                { value: "weekly", label: t`Every Monday` },
              ]}
            />
            <div>
              <Label htmlFor={`${id}-time`}>
                <Trans>Time</Trans>
              </Label>
              <Input
                id={`${id}-time`}
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-zone`}>
              <Trans>Timezone</Trans>
            </Label>
            <Input
              id={`${id}-zone`}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              disabled={busy}
            />
          </div>
          {next ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Next run</Trans>:{" "}
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: timezone,
              }).format(next)}
            </p>
          ) : (
            <p className="text-xs text-destructive">
              <Trans>Choose a valid time and timezone.</Trans>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {receipt.repeat.writes ? (
              <Trans>
                Repeats the approved spreadsheet update using the same sources and destination.
              </Trans>
            ) : (
              <Trans>Read-only preparation. It won’t send email or change your accounts.</Trans>
            )}
          </p>
          <Button
            disabled={busy || !next}
            onClick={async () => {
              if (busy || !next) return;
              setBusy(true);
              setError(null);
              try {
                const saved = await rpc.taskStarters.schedule({
                  receiptId: receipt.id,
                  cron,
                  timezone,
                });
                setRoutineId(saved.routineId);
              } catch (cause) {
                setError(errorText(cause, t`Could not schedule task. Try again.`));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trans>Confirm routine</Trans>
          </Button>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
