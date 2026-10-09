# Implementation plans

Generated with the improve skill on 2026-10-09 against commit `a9b3fec2`. The maintainer selected only the most important improvements. This batch includes four concrete production risks from the audit; it excludes roadmap work and general cleanup.

Each plan is self-contained. Read it fully before execution, use its narrow scope and STOP conditions, and update its status only after verification. No source changes, commits, GitHub issues, PRs, merges or deployments were performed by the advisor.

## Execution order and status

| Plan | Outcome | Audit finding | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [001](001-preserve-compose-data.md) | Preserve PostgreSQL data on ordinary shutdown | 2 | P1 | S | — | DONE |
| [002](002-recover-job-publisher.md) | Recover publishing after failed initialization | 3 | P1 | S | — | DONE |
| [003](003-serialize-mobile-session.md) | Prevent stale writes restoring cleared mobile credentials | 4 | P1 | M | — | DONE |
| [004](004-revoke-session-screen-access.md) | Revoke screen/terminal access with its issuing session | 5 | P1 | M | — | DONE |

Status values: TODO, IN PROGRESS, DONE, BLOCKED (with reason), or REJECTED (with rationale). BLOCKED here describes an implementation handoff status, not an autonomous goal.

## Dependency notes

There are no source dependencies among these plans. Execute 001 and 002 first because they address destructive shutdown and persistent worker failure with small diffs. Execute 003 and 004 next; they solve distinct mobile-storage and backend-capability boundaries.

Each executor modifies only its own index row. Shared index edits must preserve other status updates. Do not run several full suites concurrently. The existing UI test-baseline repair is deferred, not a reason to waive new failures in any selected plan.

## Verification baseline

At the audited commit:
- `pnpm lint` passed with 19 warnings and 4 informational diagnostics.
- Direct API, worker, web, mobile, core, adapters and testkit TypeScript checks passed.
- Full offline unit run: 627 files passed, 10 failed, 41 skipped; 7,963 tests passed, 20 failed, 265 skipped.
- Seven selected publisher/mobile-session/API/SSO/core-screen/API-authority/web-gateway files passed all 224 tests in a focused rerun.
- Hosted Node contract tests passed all 13 cases.

The known full-suite failures are:
- Web settings mocks omit appearance-store exports and SelectField; the desktop header assertion expects a removed control (7 tests).
- Mobile computer-screen mocks omit AppState/navigation APIs and include a timeout (6 tests).
- Mobile theme/color assertions expect previous palette values (2 tests).
- Linux focus/helper assertions and compose/eval CLI timeouts require separate isolation (5 tests).

Baseline failures are not acceptance criteria for new code. Focused gates must pass, and any broad-suite failures must be compared and reported accurately. No live providers, real deployment, physical mobile behavior or Electron E2E were exercised. Dependency advisory coverage is incomplete: pnpm audit was stopped after several minutes without a result.

## Deferred findings

These are supported findings excluded from this focused batch, not rejected as false:
- Audit 1: restore UI verification baseline and isolate remaining full-suite failures.
- Audit 6: backup/restore support for custom database identities.
- Audit 7: retain upload receipts across web attachment retries.
- Audit 8: invoke hosted contract tests in routine CI.
- Audit 9: routine deletion needs user ownership checks; reachability is qualified because default flows use personal memberships.
- Audit 10: characterize computer suspension/execution lease races in PostgreSQL before further lifecycle refactoring.
- Direction: scheduled evidence-backed calendar briefings and portable personal memory; both need design/spike plans rather than bundled implementation.

## Findings considered and rejected

- Host-command access in explicitly selected local desktop mode: documented behavior; no evidenced bypass.
- User-configured private connector endpoints: optional self-host configuration is intentional; no blanket SSRF finding.
- Native navigation differing from web: deliberate platform conventions.
- Large Shell file and frequent navigation polling: no measured regression establishing a worthwhile standalone fix.
- Single-machine durable DATA_DIR and long-lived/direct PostgreSQL connections: documented initial deployment constraints, not an accidental serverless/HA defect.
