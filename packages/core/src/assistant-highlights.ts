import type { RunActivityRow } from "@rakazo/contracts";

const PRIORITY: Record<RunActivityRow["status"], number> = {
  waiting_input: 0,
  waiting_takeover: 0,
  running: 1,
  leased: 1,
  queued: 1,
  failed: 2,
  completed: 3,
  cancelled: 4,
};
/** A short view of durable work, with attention first and one item per conversation. */
export function assistantHighlights(
  active: RunActivityRow[],
  recent: RunActivityRow[],
  limit = 3,
): RunActivityRow[] {
  const rows = [...new Map([...recent, ...active].map((row) => [row.runId, row])).values()]
    .filter((row) => row.status !== "cancelled")
    .sort(
      (a, b) => PRIORITY[a.status] - PRIORITY[b.status] || b.updatedAt.localeCompare(a.updatedAt),
    );
  const contexts = new Set<string>();
  return rows
    .filter((row) => {
      const context = row.threadId;
      if (contexts.has(context)) return false;
      contexts.add(context);
      return true;
    })
    .slice(0, Math.max(0, limit));
}
