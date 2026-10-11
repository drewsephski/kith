/** Bounded local traces. Keys correlate a run; content and account identifiers never leave here. */
type Trace = {
  scope: string;
  nonce: string;
  submitted: number;
  accepted?: number;
  received?: number;
  frame?: number;
  completed?: number;
};
export type ClientResponseTiming = {
  runId: string;
  acknowledgmentMs?: number;
  firstTextReceivedMs?: number;
  firstTextFrameMs?: number;
  completionMs?: number;
};

export class ResponseTiming {
  private pending = new Map<string, Trace>();
  private runs = new Map<string, Trace>();
  private early = new Map<string, Partial<Trace> & Pick<Trace, "scope" | "submitted">>();
  constructor(private now: () => number = () => performance.now()) {}

  begin(scope: string, nonce: string) {
    this.prune(scope);
    const key = `${scope}:${nonce}`;
    if (!this.pending.has(key)) this.pending.set(key, { scope, nonce, submitted: this.now() });
    if (this.pending.size > 32) this.pending.delete(this.pending.keys().next().value!);
  }

  accept(scope: string, nonce: string, runIds: readonly string[]) {
    this.prune(scope);
    const trace = this.pending.get(`${scope}:${nonce}`);
    if (!trace) return;
    trace.accepted ??= this.now();
    for (const id of runIds) {
      if (!this.runs.has(id)) {
        const early = this.early.get(id);
        this.runs.set(id, {
          ...trace,
          ...(early?.scope === scope
            ? { received: early.received, frame: early.frame, completed: early.completed }
            : {}),
        });
        this.early.delete(id);
      }
    }
    while (this.runs.size > 32) this.runs.delete(this.runs.keys().next().value!);
  }

  event(scope: string, runId: string, text: boolean, complete: boolean) {
    let trace: (Partial<Trace> & Pick<Trace, "scope" | "submitted">) | undefined =
      this.runs.get(runId) ?? this.early.get(runId);
    if (!trace && [...this.pending.values()].some((pending) => pending.scope === scope)) {
      trace = { scope, submitted: this.now() };
      this.early.set(runId, trace);
      if (this.early.size > 32) this.early.delete(this.early.keys().next().value!);
    }
    if (!trace || trace.scope !== scope) return;
    if (text) trace.received ??= this.now();
    if (complete) trace.completed ??= this.now();
  }

  /** First animation frame after React commits useful text; physical display timing needs native profiling. */
  frame(scope: string, runId: string): ClientResponseTiming | undefined {
    const trace = this.runs.get(runId) ?? this.early.get(runId);
    if (
      !trace ||
      trace.scope !== scope ||
      trace.received === undefined ||
      trace.frame !== undefined
    )
      return;
    trace.frame = this.now();
    return this.read(runId);
  }

  read(runId: string): ClientResponseTiming | undefined {
    const trace = this.runs.get(runId);
    if (!trace) return;
    const elapsed = (time?: number) => (time === undefined ? undefined : time - trace.submitted);
    return {
      runId,
      acknowledgmentMs: elapsed(trace.accepted),
      firstTextReceivedMs: elapsed(trace.received),
      firstTextFrameMs: elapsed(trace.frame),
      completionMs: elapsed(trace.completed),
    };
  }

  private prune(scope: string) {
    for (const map of [this.pending, this.runs, this.early]) {
      for (const [key, trace] of map) {
        if (trace.scope !== scope || this.now() - trace.submitted > 30 * 60_000) map.delete(key);
      }
    }
  }
}
export const responseTiming = new ResponseTiming();
