# Plan 003: Make mobile session clearing win over older token writes

> **Executor instructions:** Follow the steps and gates, preserve the storage-failure behavior below, and update the index. Use fake tokens and offline SecureStore mocks. No physical-device proof is implied by these tests.
>
> **Drift check first:** `git diff --stat a9b3fec2..HEAD -- apps/mobile/lib/session.ts apps/mobile/lib/session.test.ts apps/mobile/lib/api.test.ts apps/mobile/lib/sso.test.ts`. Compare changed code with Current state; stop if its invariants have changed.

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** MED; token replacement, unreadable storage and server-switch recovery must remain correct.
- **Depends on:** none
- **Category:** security / bug
- **Planned at:** commit `a9b3fec2`, 2026-10-09
- **Audit finding:** 4

## Why this matters

Session-token saves and deletes are asynchronous and independent. An older save can finish after sign-out completes, putting credentials back into storage and resetting the in-memory invalidation gate. The race was reproduced using the actual module and a deferred synthetic SecureStore write; it is module evidence, not a device Keychain scheduling claim.

## Current state and conventions

`apps/mobile/lib/session.ts:111–117`:
```ts
export async function saveSessionToken(token: string) {
  sessionGeneration += 1;
  const clearingScope = invalidateIntegrationsScope();
  await SecureStore.setItemAsync(SESSION_KEY, token);
  await clearingScope;
  sessionInvalidated = false;
  sessionFallback = undefined;
}
```

`clearSessionToken` increments generation, invalidates the integrations scope, awaits notification shutdown, clears the stored token, and clears avatar style. The token mutations have no shared queue. `replaceSessionTokenIfCurrent` checks generation before saving but returns true after the save even if a newer clear started during it. `restoreSessionToken` can install a fallback after a failed save without checking for a newer session change.

`snapshotSessionToken` checks the fallback/invalidation gate before asynchronous reading, with no generation check afterward. A read begun before clearing must not return a stale bearer afterward.

Existing safe patterns:
- `apps/mobile/lib/session.ts:18–21` serializes integration-scope mutations:
```ts
const next = scopeWrites.then(task, task);
scopeWrites = next.catch(() => undefined);
return next;
```
- `apps/mobile/lib/avatar-style.ts:13–23` chains writes and lets the chain continue after failure. Its save/clear completion state is revision-gated.
- `apps/mobile/lib/session.test.ts:59–91` uses a Map and deferred write to prove an older avatar write cannot survive clearing. Follow its barriers and fake data.

Reachable callers remain unchanged: password replacement in `apps/mobile/lib/api.ts:566`, sign-out at `api.ts:624`, server-switch credential clearing, and SSO replacement in `apps/mobile/lib/sso.ts:91`.

## Required invariants

1. Mutations of SESSION_KEY execute in invocation order; failures do not poison the queue.
2. Clear increments generation and immediately gates reads/fallback credentials before awaiting notifications or storage.
3. Old completion handlers never change the current generation's fallback/invalidation state.
4. Old reads do not return a token after a newer session change; an invalidated session reads as empty.
5. A later deliberate new save can establish a new session after clear.
6. Replacement retains its in-memory fallback on persistence failure only while its generation still owns the session, and continues to report the persistence error.
7. Clear preserves delete-then-empty-overwrite fallback, returns false only if neither succeeds, and leaves unreadable/uncleared credentials unusable in memory.
8. Preserve verified-scope invalidation and avatar cleanup. Do not create a queue dependency cycle by awaiting a public mutation from inside that same mutation queue.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Session tests | `pnpm exec vitest run apps/mobile/lib/session.test.ts --maxWorkers=2` | All pass after implementation |
| Caller/storage regressions | `pnpm exec vitest run apps/mobile/lib/api.test.ts apps/mobile/lib/sso.test.ts apps/mobile/lib/avatar-style.test.ts --maxWorkers=2` | All pass |
| Typecheck | `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Diff hygiene | `git diff --check` | Exit 0 |

Use installed pnpm dependencies; ordinary tests are offline. Session/API/SSO tests passed at the audited commit. The unrelated full-suite baseline had 20 failures, including mobile computer-screen mocks and palette assertions. Do not edit those tests or product styling here.

## Scope

**Only modify:**
- `apps/mobile/lib/session.ts`
- `apps/mobile/lib/session.test.ts`
- `apps/mobile/lib/api.test.ts`
- `apps/mobile/lib/sso.test.ts`
- This plan's index row

**Do not modify:** production API/SSO callers unless scope is explicitly revised, server settings, backend auth, avatar-style implementation, notification implementation, SecureStore dependency/configuration, native modules, UI, RPC contracts, schema or migrations. Read those callers to preserve behavior.

## Git workflow

Use `codex/serialize-mobile-session`; conventional message example: `fix(mobile): serialize session token mutations`. Preserve others' work. No commit, push, PR, merge or release without operator authorization.

## Steps

### 1. Add deterministic token-ordering regressions

Extend session storage tests with Map-backed fake SecureStore and deferred barriers. Start a save and wait until its token write is blocked; start clear. Assert reads become empty immediately while the old write is still pending. Release the save, await both operations, then assert stored and loaded credentials remain empty.

Also delay a read until after clear; that read must return empty, not its captured pre-clear token. Test an older failed restore/replacement completing after clear without installing a fallback.

**Verify:** Session test command → new cases fail against current source. Existing sequential save/clear and scope tests must still pass.

### 2. Serialize token mutations and fence completion state

Add a small module-local token mutation chain modeled on existing scope/avatar queues. Keep generation changes synchronous at public entry points. Route token writes, delete and overwrite through this chain. Use private helpers accepting the operation generation so restore/replacement do not recursively enqueue public saves or increment generation unexpectedly.

Immediately clear fallback and invalidate token reads when clearing starts. Change fallback/invalidation state only when the completion belongs to the current generation. Make replacement return false when superseded; preserve its error/fallback contract for a current-generation persistence failure.

Fence snapshot reads by the captured generation and recheck invalidation/fallback after the storage await. If generation changed, use the current state or return empty conservatively; never expose the old read. Preserve { ok: false } for genuinely unreadable current storage.

**Verify:** Session test command → all pass.

### 3. Exercise replacement and caller edge cases

Cover: save-save ordering; clear-then-new-save; rejected write followed by successful mutation; failed delete with successful empty overwrite; both clearing methods failing; superseded successful and failed replacement; stale restore fallback; verified scope still invalid after clear.

In api/sso tests, add a delayed replacement-store scenario followed by session clearing and assert the replacement cannot restore credentials or resume notifications for the superseded generation. Use existing mocks, fake tokens, and explicit promises; no real storage or network.

**Verify:** Session and caller/storage regression commands → all pass. No timeout increases or relaxed security assertions.

### 4. Check type safety and narrow scope

Run typecheck, lint and diff hygiene. Confirm exported function signatures remain compatible and no token is logged. Mark the index complete only after targeted gates pass.

**Verify:** Commands exit 0; `git diff --name-only` contains only allowed paths.

## Test plan and done criteria

- [ ] Every invariant listed above has a deterministic regression.
- [ ] All focused test commands and typecheck/lint/diff gates pass.
- [ ] The token mutation chain continues after rejection.
- [ ] Reads become empty as soon as clear starts, and remain empty after old writes finish.
- [ ] Current-generation persistence fallback still works; stale fallback never resurrects a session.
- [ ] Scope and avatar cleanup behavior remains intact.
- [ ] No production caller, public contract, UI or native dependency changes; index updated.

## STOP conditions

Stop if preserving existing caller contracts requires edits outside scope, a queue deadlocks in a deferred regression, current generation accounting cannot be preserved without changing api/SSO behavior, persistence guarantees require a native storage redesign, source has drifted, or a focused gate fails twice.

## Maintenance notes

Review every asynchronous completion that sets sessionFallback/sessionInvalidated. Server switching, password replacement and SSO share this module. Do not claim the backend revoked an old token merely because local storage cleared, and do not claim physical-device proof from mocked tests.

