import { settledRunIds } from "./events.js";

type Run = { id: string; status: string };
type Message = { id: string; runId?: string | null; seq?: number };
type Snapshot = {
  threadId: string;
  run?: Run | null;
  activeRuns?: Run[];
  settledRunIds?: string[];
  messages: Message[];
};

/** Reconcile run authority without moving an independently advancing event cursor backwards. */
export function reconcileTerminalRunSnapshot<T extends Snapshot>(previous: T, next: T): T | null {
  if (previous.threadId !== next.threadId) return null;
  const known = new Set([
    ...(previous.run ? [previous.run.id] : []),
    ...(previous.activeRuns?.map((run) => run.id) ?? []),
  ]);
  const terminal = new Set((next.settledRunIds ?? []).filter((id) => known.has(id)));
  if (
    next.run &&
    known.has(next.run.id) &&
    ["completed", "failed", "cancelled"].includes(next.run.status)
  ) {
    terminal.add(next.run.id);
  }
  if (!terminal.size) return null;
  const messages = previous.messages.filter(
    (row) => !(row.id.startsWith("progress:") && row.runId && terminal.has(row.runId)),
  );
  for (const row of next.messages) {
    if (!row.runId || !terminal.has(row.runId) || row.id.startsWith("progress:")) continue;
    const index = messages.findIndex((item) => item.id === row.id);
    if (index < 0) messages.push(row);
    else messages[index] = row;
  }
  return {
    ...previous,
    run:
      next.run?.status === "failed" && terminal.has(next.run.id)
        ? next.run
        : previous.run && terminal.has(previous.run.id)
          ? next.run && known.has(next.run.id)
            ? next.run
            : null
          : previous.run,
    activeRuns: previous.activeRuns?.filter((item) => !terminal.has(item.id)),
    settledRunIds: [...terminal].reduce(
      (ids, id) => settledRunIds(ids, id),
      previous.settledRunIds ?? [],
    ),
    messages: messages.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
  };
}
