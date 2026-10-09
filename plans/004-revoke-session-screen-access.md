# Plan 004: Revoke screen and terminal capabilities with their issuing session

> **Executor instructions:** Follow this complete plan and its fail-closed requirements. Use fake credentials and isolated fixtures. Update the index after all available gates pass; record an unavailable integration gate instead of claiming proof.
>
> **Drift check first:** `git diff --stat a9b3fec2..HEAD -- packages/core/src/node/screen-capability.ts packages/core/src/node/screen-capability.test.ts apps/api/src/router.ts apps/api/src/router.test.ts apps/api/src/screen-proxy.ts apps/api/src/screen-proxy.test.ts apps/web/src/screen-proxy.test.ts apps/web/e2e/screen-proxy-isolation.spec.ts packages/testkit/src/authorization.test.ts`. Compare all changed paths against Current state before proceeding.

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** MED; preserve remote reconnect stability and screen isolation while extending authorization.
- **Depends on:** none
- **Category:** security
- **Planned at:** commit `a9b3fec2`, 2026-10-09
- **Audit finding:** 5

## Why this matters

A sealed screen URL is a one-hour bearer capability. Its authority checks computer lifecycle and control leases but not the session that authorized issuance. Revoking or expiring that session therefore leaves viewing—and control while the lease remains active—available through the old URL. Bind the capability to its original session and membership, including terminal capabilities using the same gateway.

## Current state and conventions

`packages/core/src/node/screen-capability.ts:3,13–19`:
```ts
export const SCREEN_PROXY_TTL_MS = 60 * 60_000;
export interface ScreenCapabilityScope {
  botId: string;
  computerId: string;
  botGeneration: number;
  computerGeneration: number;
  controlLeaseId: string | null;
}
```
The AES-GCM payload seals URL and scope. `openScreenCapability` validates the scope. `remoteScreenSealKey` explicitly enumerates scope fields; adding a field to the interface alone will not partition cache entries.

`apps/api/src/router.ts:3045–3057,3097–3109` issues terminal and screen URLs with this scope:
```ts
{
  botId: bot.id,
  computerId: computer.id,
  botGeneration: bot.screenGeneration,
  computerGeneration: computer.screenGeneration,
  controlLeaseId: computer.controlLeaseId,
}
```
RPC context already has `actor` and optional `sessionId` (`router.ts:732–738`). Production `apps/api/src/app.ts:658–678` obtains both from the authenticated request and passes the session's database ID. The push-registration handler already rejects missing sessionId with `ORPCError("UNAUTHORIZED")`; match that convention.

`apps/api/src/screen-proxy.ts:38–70` authorizes with a bot lookup by bot/computer/generation plus computer state and control lease. It lacks session and membership checks. `packages/db/prisma/schema.prisma:53–67` stores Session id, userId and expiresAt. `packages/db/src/scope.ts:23–35` scopes membership by userId and spaceId.

`apps/web/src/screen-proxy.ts:29–34` calls the internal authority using only a sealed path and the proxy's server credential. `watchScreenAuthorization` rechecks each second and closes unauthorized streams. Preserve this design: session identity belongs inside the authenticated sealed scope, not in unsigned request parameters or forwarded browser cookies.

`screen-capability.ts:6–11` documents why remote seals are reused: issuing a new URL on every poll aborts slow handshakes. Keep the same-session cache stability, original expiry, ten-minute renewal threshold, origin/secret/upstream binding and lifecycle generations. Local non-HTTP desktop URLs remain passed through.

## Commands you will need

Run from root, with installed pnpm dependencies and live-provider opt-ins unset.

| Purpose | Command | Expected result |
|---|---|---|
| Shared seal regressions | `pnpm exec vitest run packages/core/src/node/screen-capability.test.ts --maxWorkers=2` | All pass |
| API authority and issuance | `pnpm exec vitest run apps/api/src/screen-proxy.test.ts apps/api/src/router.test.ts --maxWorkers=2` | All pass |
| Gateway revocation | `pnpm exec vitest run apps/web/src/screen-proxy.test.ts --maxWorkers=2` | All pass |
| Core/API/web/testkit types | `pnpm exec tsc --noEmit -p packages/core/tsconfig.json && pnpm exec tsc --noEmit -p apps/api/tsconfig.json && pnpm exec tsc --noEmit -p apps/web/tsconfig.json && pnpm exec tsc --noEmit -p packages/testkit/tsconfig.json` | Exit 0 |
| PostgreSQL authorization | `pnpm test:integration` | All integration tests pass; isolated Docker database |
| Web screen isolation | `pnpm test:e2e -- --spec=screen-proxy-isolation.spec.ts` | All selected web cases pass; isolated harness |
| Lint and diff | `pnpm lint` and `git diff --check` | Exit 0 |

The core/API-authority/gateway tests passed during audit. Whole-suite baseline: 7,963 passed, 20 failed, 265 skipped; existing settings/computer-screen mocks, palette assertions and shell/timeouts are separate work. Do not fix or waive unrelated tests here.

Integration/E2E commands use the repository's Testcontainers harness and fake providers. If Docker/browser prerequisites are unavailable, report the missing gate and leave its verification pending for CI. Never substitute the operator's database. Do not run Electron E2E locally.

## Scope

**Only modify:**
- `packages/core/src/node/screen-capability.ts`
- `packages/core/src/node/screen-capability.test.ts`
- `apps/api/src/router.ts` — session context comment and screenUrl/terminalUrl issuance only
- `apps/api/src/router.test.ts` — affected screen/terminal fixtures and tests only
- `apps/api/src/screen-proxy.ts`
- `apps/api/src/screen-proxy.test.ts`
- `apps/web/src/screen-proxy.test.ts`
- `apps/web/e2e/screen-proxy-isolation.spec.ts`
- `packages/testkit/src/authorization.test.ts`
- This plan's index row

**Out of scope:** database schema/migrations, auth/session creation or deletion logic, provider adapters, computer control acquisition/expiry, frontend screen UI, native client navigation, unrelated router handlers, dependency/env changes, production gateway implementation unless scope is explicitly revised.

## Git workflow

Use `codex/session-bound-screen-access`; message example: `fix: bind screen capabilities to active sessions`. No commits, pushes, PRs, merges or deployment without operator authorization. If later authorized to create a PR, follow repository review and screenshot requirements; do not equate green checks with complete review.

## Steps

### 1. Extend the sealed authority and its identity boundaries

Require nonempty `sessionId`, `userId`, and `spaceId` in ScreenCapabilityScope. Extend parser validation and the remote cache key with all three. Old sealed capabilities missing the identity must fail closed; do not grandfather sessionless access.

Update core and API capability-scope fixtures with the three new identity fields, and add identity rotation, round-trip and old-format rejection tests. The API authority fixture needs the updated sealed scope now; add its database authorization mocks in step 2. Include separate sessions for the same user and same computer: their seals must differ, while repeated polls under one session reuse its seal without extending expiry.

Propagate identity at both router issuance sites from context.actor and context.sessionId. Reject missing session identity before provider screen/terminal connection. Update the context comment and affected router-test contexts; never make sessionId optional in the seal to accommodate mocks. Update the direct-issuer scope in the web isolation fixture.

**Verify:** Shared seal command and API issuance command → all pass. Missing-session issuance returns UNAUTHORIZED and performs no provider connection.

### 2. Enforce current session and membership at the authority

In `mountScreenTarget`, after validating proxy credential and decrypting a valid capability:
- Require a Session matching sealed sessionId AND userId, with expiresAt strictly after the current time.
- Require the user's current membership in sealed spaceId using the existing membership schema.
- Add sealed userId and spaceId to the bot ownership lookup.
- Preserve bot/computer generations, archive status, providerRef, running/booting states and interactive control-lease checks.
- A missing/expired session or membership returns 403 with no target. Database errors must never authorize; preserve gateway fail-closed behavior rather than disguising operational failures as successful responses.

Use direct Prisma queries or the existing membership boundary; add no new generalized auth service. Do not cache positive session validity beyond the existing gateway recheck period.

Extend the Hono/Prisma fixture in `apps/api/src/screen-proxy.test.ts` with session, membership and scoped bot state. Add deleted/expired/wrong-user session, removed/wrong-space membership, wrong-owner bot and unchanged-valid-session cases, for both viewing and interactive/terminal-style target paths.

**Verify:** API authority and issuance command → all pass. Valid identity returns 200; each revoked/mismatched identity returns 403 while lifecycle generations remain unchanged.

### 3. Prove stream and real-session revocation

Extend `apps/web/src/screen-proxy.test.ts` using existing fake timers so an active authorization watch whose authority becomes forbidden closes once and stops polling. Retain rejection-on-authority-error and disposal tests.

In `packages/testkit/src/authorization.test.ts`, reuse signup/signin/authPost and the isolated app's real Prisma fixtures. Obtain actor and session ID from authenticated endpoints, create/boot an owned fake computer, and mint a capability through the real issuer with a synthetic loopback target. Because the fake sandbox returns a non-HTTP screen URL, do not assume its screenUrl RPC creates a seal.

Mount the real `mountScreenTarget` in a test-local Hono app using the same real Prisma database and a synthetic secret. First authorize the sealed target. Sign out through the actual auth endpoint, keeping computer generations/control unchanged, then assert the same capability is forbidden. A second active session of that user must remain authorized only through its own seal. Add an expiry case with the isolated session row, and a membership-removal case using disposable test identities.

Update the web isolation fixture's scope for the new format, preserving sandbox/CSP/cookie isolation and both development/preview modes. Its fake authority is transport/isolation evidence; the PostgreSQL test establishes real auth-row revocation.

**Verify:** Gateway unit command → pass; `pnpm test:integration` → pass; selected web isolation E2E command → pass. Report unavailable infrastructure explicitly.

### 4. Verify and review bounded behavior

Run all type, lint and diff gates. Inspect the scope: identity occurs only in encrypted payloads/internal DB predicates, never logs, plaintext URL query parameters or browser storage. No change to RPC response shape, no migration, no new vendor dependency, no user-facing copy.

**Verify:** Tooling exits 0; only allowed paths changed. Mark index DONE only with required integration/E2E evidence; otherwise record the pending gate accurately.

## Test plan and done criteria

- [ ] Both terminalUrl and screenUrl require and seal the issuing session/user/space.
- [ ] Old sessionless capabilities are rejected.
- [ ] Same-session remote reuse retains original expiry; different session/user/space changes the seal.
- [ ] Deleted, expired, wrong-user sessions and removed membership cannot resolve targets.
- [ ] Existing computer-generation, archive, lifecycle and control-lease revocation tests pass.
- [ ] Gateway closes active revoked streams and stops checking them.
- [ ] Actual sign-out invalidates a seal using the real isolated database.
- [ ] Local non-HTTP provider behavior and browser isolation remain intact.
- [ ] All available commands pass; pending external verification is recorded rather than waived.
- [ ] Only allowed paths change, with no secret values or personal data; index updated.

## STOP conditions

Stop if production RPC issuance lacks a real session ID, the auth provider does not persist revocation in Session as assumed, membership semantics have changed, another issuer exists outside scope, preserving reconnects requires weakening identity or expiry validation, a schema/provider/UI change becomes necessary, or a focused gate fails twice. If integration prerequisites are missing, report that gate pending and do not use an existing database.

## Maintenance notes

Including identity in encryption without including it in the cache key can leak one session's cached grant into another session. Changing TTL alone does not implement revocation. Review both issuance sites and control/view/terminal paths together whenever authority changes. Deployment invalidates old-format capabilities; clients must obtain new URLs through their existing polling/reconnect flows.
