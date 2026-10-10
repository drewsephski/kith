import type { RunActivityRow } from "@rakazo/contracts";
import { taskStarterApp } from "./task-starters.js";

/** Only persisted work appears here. Cancelled work is available in Tasks. */
export function forYouWork(runs: readonly RunActivityRow[], limit = 5): RunActivityRow[] {
  const priority = (status: RunActivityRow["status"]) => {
    if (status === "waiting_input" || status === "waiting_takeover") return 0;
    if (status === "failed") return 1;
    if (status === "completed") return 3;
    return 2;
  };
  const unique = new Map(
    runs.filter((run) => run.status !== "cancelled").map((run) => [run.runId, run]),
  );
  return [...unique.values()]
    .sort(
      (a, b) =>
        priority(a.status) - priority(b.status) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.runId.localeCompare(b.runId),
    )
    .slice(0, limit);
}

/** Catalog identities stay shared; account discovery stays at the platform boundary. */
export function connectedForYouSuggestions(services: readonly string[]): string[] {
  const apps = new Set(
    services.map((slug) => taskStarterApp(slug) ?? slug.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  return [
    ...(apps.has("gmail") || apps.has("outlook") || apps.has("microsoftoutlook")
      ? ["important-replies"]
      : []),
    ...(apps.has("calendar") || apps.has("outlookcalendar") || apps.has("microsoftcalendar")
      ? ["meeting-brief"]
      : []),
    ...(apps.has("github") ? ["pull-requests"] : []),
  ];
}
