# Plan 002: Recover job publishing after failed initialization

> **Executor instructions:** Implement only this plan, run each verification, and update its index row. Use deterministic offline mocks; do not interrupt a real database or replay external actions.
>
> **Drift check first:** `git diff --stat a9b3fec2..HEAD -- packages/adapters/src/wakeup.ts packages/adapters/src/wakeup-graphile-host.test.ts`. Compare changed code with the excerpts. Stop if the failure mechanism has changed.

## Status

- **Priority:** P1
- **Effort:** S
- **Risk:** LOW; preserve shared initialization, successful reuse, and closed-state guarantees.
- **Depends on:** none
- **Category:** bug
- **Planned at:** commit `a9b3fec2`, 2026-10-09
- **Audit finding:** 3

## Why this matters

A database outage during the publisher's first initialization permanently poisons its cached promise. Later publishing and cancellation keep rejecting after PostgreSQL recovers, and reconciliation uses the same publisher. Failed initialization can also make shutdown throw before later resources are closed.

## Current state and conventions

`packages/adapters/src/wakeup.ts:18–20,40–49`:
```ts
export class GraphileJobPublisher implements JobPublisher {
  private utils: Promise<WorkerUtils> | undefined;
  private closed = false;

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.utils) await (await this.utils).release();
  }

  private getUtils(): Promise<WorkerUtils> {
    if (this.closed) throw new Error("Background job publisher is closed");
    this.utils ??= makeWorkerUtils({ pgPool: this.pgPool });
    return this.utils;
  }
}
```

`enqueue` and `cancel` await `getUtils()` before performing their operation. Graphile initialization connects to PostgreSQL and can reject. Clearing only a failed initialization permits future operations to initialize again; it must not retry `addJob` or database mutations automatically.

`packages/adapters/src/wakeup-graphile-host.test.ts:14–18` already mocks the boundary:
```ts
vi.mock("graphile-worker", () => ({
  run: (...args: unknown[]) => run(...args),
  makeWorkerUtils: vi.fn(),
}));
```
Its `deferred()` fixture has explicit resolve/reject handles. Follow that pattern, resetting `makeWorkerUtils` between publisher cases. Prefer a typed minimal utility fixture over broad new casts. New type imports must be top-level.

`apps/worker/src/index.ts:298–307` sequentially closes the reconciler, job host, publisher, secrets and realtime. Keep this plan inside the publisher; do not redesign worker shutdown.

The core product supports optional providers and long-lived API/worker processes. Keep the existing caller-owned shared PostgreSQL pool and provider-neutral JobPublisher contract.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Publisher regressions | `pnpm exec vitest run packages/adapters/src/wakeup-graphile-host.test.ts --maxWorkers=2` | All pass after implementation |
| Related queue tests | `pnpm exec vitest run packages/adapters/src/wakeup.test.ts packages/adapters/src/job-reconciler.test.ts --maxWorkers=2` | All pass |
| Typecheck | `pnpm exec tsc --noEmit -p packages/adapters/tsconfig.json` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Diff hygiene | `git diff --check` | Exit 0 |

Run from root with existing pnpm dependencies and no VERIFY_PROVIDERS or VERIFY_DATABASE opt-in. The focused publisher test passed during audit. The whole-suite baseline separately had 20 failures; do not repair unrelated UI fixtures or change timeouts here.

## Scope

**Only modify:**
- `packages/adapters/src/wakeup.ts` — GraphileJobPublisher only
- `packages/adapters/src/wakeup-graphile-host.test.ts` — publisher tests/fixtures only
- This plan's row in `plans/README.md`

**Out of scope:** JobWorkerHost supervision, InMemoryJobQueue, reconciliation, worker/API shutdown wiring, Graphile SDK/dependency versions, pool ownership, job keys, persisted payloads, maxAttempts, schema and migrations.

## Git workflow

Use an isolated branch such as `codex/recover-job-publisher`; message example: `fix: retry failed job publisher initialization`. Preserve unrelated edits. No commit, push, PR, merge or deployment without operator authorization.

## Steps

### 1. Capture rejected initialization

Extend the existing publisher describe block. Mock `makeWorkerUtils` to reject first and succeed second. Assert first enqueue rejects with the original error; a later enqueue succeeds and initialization was called twice. Repeat recovery through `cancel`, supplying a minimal `withPgClient` mock.

Add a case where initialization rejects and subsequent `close()` resolves instead of rethrowing that historical failure. Attach rejection observers before rejecting deferred promises; do not introduce unhandled-rejection noise.

**Verify:** Publisher regression command → new recovery and failed-initialization-close cases fail against current code, while existing cases still pass.

### 2. Clear only the failed initialization

In `getUtils()`, capture each initialization promise and attach rejection cleanup. Clear `this.utils` only when it still refers to that same initialization. Store and return the same rejection-aware promise: do not create a separate unobserved rethrowing promise. Preserve rejection for callers awaiting it; do not swallow it, retry an operation internally, or initialize more than once concurrently. Successful initialization remains cached.

Make `close()` safely distinguish a failed initialization from failure of `release()`: ignore only initialization rejection because there is no initialized utility to release. Continue to propagate a genuine release failure. Mark the publisher closed before awaiting pending initialization; never allow it to reopen afterward.

**Verify:** Publisher regression command → all pass.

### 3. Prove concurrency and shutdown behavior

Add barrier-driven cases:
- Concurrent enqueue/cancel callers share one pending initialization.
- Concurrent callers observing the same rejected initialization can recover through one later initialization.
- Close while initialization is pending waits for success and releases exactly once.
- Close while initialization is pending and later rejects resolves without reopening.
- Repeated close does not release twice.
- New enqueue/cancel after close reject without calling `makeWorkerUtils`.
- An `addJob` failure does not clear a successfully initialized utility or replay the job.

Use the existing deferred fixture; avoid timing sleeps.

**Verify:** Publisher regressions and related queue tests → all pass.

### 4. Verify scope and tooling

Run typecheck, lint and diff hygiene. Inspect changed files and confirm worker-host behavior and caller-owned pool closure remain untouched.

**Verify:** All commands exit 0; only allowed paths changed. Update the index with verification results.

## Test plan

Mock only Graphile's initialization/utility boundary. Assert meaningful call counts, original error propagation, successful subsequent operations, and exactly-once utility release. Preserve payload wrapping, delay/key/maxAttempts forwarding, and current host lifecycle cases.

## Done criteria

- [ ] All focused commands above pass.
- [ ] Failed initialization can be followed by successful enqueue and cancel.
- [ ] Concurrent initialization remains shared.
- [ ] Closed publishers never reopen.
- [ ] Close tolerates failed initialization but still reports a release failure.
- [ ] No automatic replay of job mutations or out-of-scope changes.
- [ ] Index updated after successful gates.

## STOP conditions

Stop if Graphile initialization in the installed version is not retry-safe, releasing failed initialization requires hidden resources not covered by the existing boundary, a fix needs changing job mutation semantics or worker supervision, drift changes the cached-promise pattern, or a focused gate fails twice.

## Maintenance notes

A failed initialization and a failed operation are different: resetting on operation failure could replay ambiguous mutations or discard a healthy utility. Review cache cleanup by promise identity and the close-during-initialization tests whenever initialization or pool ownership changes.
