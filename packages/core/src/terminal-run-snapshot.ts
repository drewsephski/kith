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
  const run = next.run;
  if (
    previous.threadId !== next.threadId ||
    !run ||
    (previous.run?.id !== run.id && !previous.activeRuns?.some((item) => item.id === run.id)) ||
    !["completed", "failed", "cancelled"].includes(run.status)
  )
    return null;
  const messages = previous.messages.filter(
    (row) => !(row.id.startsWith("progress:") && row.runId === run.id),
  );
  for (const row of next.messages) {
    if (row.runId !== run.id || row.id.startsWith("progress:")) continue;
    const index = messages.findIndex((item) => item.id === row.id);
    if (index < 0) messages.push(row);
    else messages[index] = row;
  }
  return {
    ...previous,
    run: previous.run?.id === run.id ? next.run : previous.run,
    activeRuns: previous.activeRuns?.filter((item) => item.id !== run.id),
    settledRunIds: settledRunIds(previous.settledRunIds, run.id),
    messages: messages.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
  };
}
