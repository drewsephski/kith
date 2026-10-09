import { Trans, useLingui } from "@lingui/react/macro";
import type { RunActivityRow } from "@rakazo/contracts";
import { assistantHighlights } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../../lib/rpc";
import { statusLabel, statusTone } from "../ActivityList";

export function AssistantForYou({
  onOpenRun,
  revision,
}: {
  onOpenRun: (run: RunActivityRow) => void;
  revision?: string;
}) {
  const { t } = useLingui();
  const [rows, setRows] = useState<RunActivityRow[]>([]);
  const [error, setError] = useState(false);
  const refresh = useRef<() => void>(() => undefined);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      const request = ++generation;
      try {
        const [active, recent] = await Promise.all([
          rpc.runs.list({ filter: "active" }),
          rpc.runs.list({ filter: "recent" }),
        ]);
        if (!alive || request !== generation) return;
        setRows(assistantHighlights(active.runs, recent.runs));
        setError(false);
      } catch {
        if (alive && request === generation) setError(true);
      } finally {
        if (alive && request === generation) timer = setTimeout(() => void load(), 15_000);
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    refresh.current = () => void load();
    void load();
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [t]);
  useEffect(() => {
    if (revision) refresh.current();
  }, [revision]);
  if (!rows.length && !error) return null;
  return (
    <section
      className="shrink-0 border-b border-border px-5 py-3 sm:px-8"
      aria-label={t`For you`}
      data-testid="assistant-for-you"
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-1 text-xs font-medium text-muted-foreground">
          <Trans>For you</Trans>
        </h2>
        {rows.map((run, index) => (
          <Button
            key={run.runId}
            variant="ghost"
            onClick={() => onOpenRun(run)}
            className={`h-auto min-h-11 w-full justify-start gap-3 rounded-lg px-2 py-2 font-normal ${index > 1 ? "hidden sm:flex" : ""}`}
          >
            <span
              className={`size-1.5 shrink-0 rounded-full bg-current ${statusTone(run.status, run.updatedAt)}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-start text-sm">
              {run.promptSnippet || run.botName}
            </span>
            <span className={`shrink-0 text-xs ${statusTone(run.status, run.updatedAt)}`}>
              {statusLabel(run.status)}
            </span>
            <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        ))}
        {error ? (
          <Button variant="ghost" size="sm" onClick={() => refresh.current()}>
            <Trans>Could not refresh tasks. Retry</Trans>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
