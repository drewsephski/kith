import { useLingui } from "@lingui/react/macro";
import { Check, CircleAlert, Clock } from "lucide-react";
import { LoadingState } from "./ai/primitives";

export function TaskReceiptHeader({
  title,
  status,
  timestamp,
  workingLabel,
}: {
  title: string;
  status: string;
  timestamp?: string;
  workingLabel?: string;
}) {
  const { t, i18n } = useLingui();
  const working = status === "running" || status === "leased";
  const attention =
    status === "waiting_input" ||
    status === "waiting_takeover" ||
    status === "reconciliation_required";
  const label =
    status === "completed"
      ? t`Completed`
      : status === "failed"
        ? t`Failed`
        : status === "cancelled"
          ? t`Cancelled`
          : attention
            ? t`Needs attention`
            : t`Queued`;
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
      data-testid="task-receipt-header"
    >
      <div className="min-w-0">
        <h3 className="font-medium">{title}</h3>
        {timestamp ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(timestamp).toLocaleString(i18n.locale)}
          </p>
        ) : null}
      </div>
      {working ? (
        <LoadingState label={workingLabel ?? t`Working…`} />
      ) : (
        <span
          className={`flex items-center gap-1.5 text-xs ${status === "completed" ? "text-success" : status === "failed" ? "text-destructive" : attention ? "text-warning" : "text-muted-foreground"}`}
        >
          {status === "completed" ? (
            <Check size={14} aria-hidden="true" />
          ) : status === "failed" || attention ? (
            <CircleAlert size={14} aria-hidden="true" />
          ) : (
            <Clock size={14} aria-hidden="true" />
          )}
          {label}
        </span>
      )}
    </div>
  );
}
