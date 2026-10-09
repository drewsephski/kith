# Plan 001: Preserve database data during ordinary Compose shutdown

> **Executor instructions:** Read this entire plan. Implement only its scope, run each verification, and update this plan's row in `plans/README.md`. Do not run a real shutdown/reset against an operator's stack.
>
> **Drift check first:** `git diff --stat a9b3fec2..HEAD -- package.json CONTRIBUTING.md packages/testkit/src/compose-shutdown.test.ts`. Compare any changed files with the excerpts below. Stop if the implementation assumptions no longer hold.

## Status

- **Priority:** P1
- **Effort:** S (hours, including regression coverage)
- **Risk:** LOW; users deliberately resetting a database must use an explicitly destructive command.
- **Depends on:** none
- **Category:** dx / bug
- **Planned at:** commit `a9b3fec2`, 2026-10-09
- **Audit finding:** 2

## Why this matters

The root shutdown command removes named volumes, including PostgreSQL's durable database. An ordinary stop can therefore delete accounts, conversations, settings, and jobs. Preserve volumes by default and keep intentional deletion available through an explicitly named reset.

## Current state and conventions

`package.json:37–38`:
```json
"compose:up": "docker compose --env-file .env -f infra/compose/docker-compose.yml up --build",
"compose:down": "docker compose --env-file .env -f infra/compose/docker-compose.yml down -v"
```

`infra/compose/docker-compose.yml:8–12` configures PostgreSQL through `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`, and mounts `pgdata:/var/lib/postgresql/data`. The database is not backed up by the separate application data directory.

`CONTRIBUTING.md:53–56` already says: “Recreate the volume only after a backup (or when the data is disposable); `docker compose down -v` deletes all Postgres state.”

The project uses pnpm 9 and TypeScript/Vitest. Match offline repository-contract tests: `infra/updater/src/compose-images.test.ts:22–27` resolves the repository root with `path.resolve(import.meta.dirname, "../../..")` and reads tracked configuration with `readFileSync`. Use top-level `import type` if types are needed; introduce no dependency. This is tooling documentation, with no product UI or copy change.

## Commands you will need

Run from the repository root with existing dependencies.

| Purpose | Command | Expected result |
|---|---|---|
| Targeted regression | `pnpm exec vitest run packages/testkit/src/compose-shutdown.test.ts --maxWorkers=2` | All tests pass after implementation |
| Typecheck | `pnpm exec tsc --noEmit -p packages/testkit/tsconfig.json` | Exit 0 |
| Lint | `pnpm lint` | Exit 0; existing warnings may remain |
| Diff hygiene | `git diff --check` | Exit 0 |

Do not install packages or regenerate a lockfile for this change. The audit's whole unit baseline was 7,963 passed / 20 failed / 265 skipped. Existing UI fixture and shell/timeout failures are separate work; never weaken their assertions to make this plan appear green.

## Scope

**Only modify:**
- `package.json`
- `CONTRIBUTING.md`
- `packages/testkit/src/compose-shutdown.test.ts` (create)
- This plan's status row in `plans/README.md`

**Do not modify:** Compose YAML, database schema/migrations, deployment scripts, backup/restore scripts, desktop stack teardown, native clients, dependencies or lockfiles. Do not actually execute `compose:down` or `compose:reset` during verification.

## Git workflow

Use an isolated branch such as `codex/preserve-compose-data`. Match conventional messages, e.g. `fix: preserve database volumes on compose shutdown`. Preserve other work. Do not commit, push, open a PR, merge, or deploy without operator authorization.

## Steps

### 1. Add the offline safety contract

Create `packages/testkit/src/compose-shutdown.test.ts`. Parse the real root manifest and examine command arguments without executing them. Assert:
- `compose:down` targets the existing env file and Compose file, invokes `down`, and contains neither `-v` nor `--volumes`.
- `compose:reset` targets the same stack and explicitly invokes `down -v`.
- Ordinary shutdown does not hide volume deletion in a chained command.

Use Vitest's `describe/it/expect` and Node file reads, following the exemplar above. These tests defend a destructive boundary rather than snapshotting the whole manifest.

**Verify:** Run the targeted regression command. Before step 2, the new safety assertions must fail because ordinary shutdown is destructive and reset is absent. If they pass unexpectedly, stop and recheck drift.

### 2. Separate shutdown from explicit reset

Remove only `-v` from `compose:down`. Add `compose:reset` containing the former destructive command. Preserve all existing env/file flags. Add one concise operational sentence in CONTRIBUTING explaining that `pnpm compose:down` preserves data and `pnpm compose:reset` deletes PostgreSQL data and requires a backup or disposable database.

**Verify:** Targeted regression command → all pass. `pnpm lint` → exit 0.

### 3. Check the complete narrow diff

Run the typecheck and diff-hygiene commands. Inspect `git diff --name-only` and confirm only the allowed files changed. Update the index to DONE only after its required gates pass.

**Verify:** Typecheck and diff hygiene → exit 0; scope inspection contains only allowed paths.

## Test plan

The new contract tests must read the actual root script definitions, prove safe shutdown, and prove the explicitly named reset retains deletion. No Docker daemon, database, real env file, or subprocess execution is necessary. Do not add marketing/UI tests.

## Done criteria

- [ ] Targeted regression, typecheck, lint and diff-hygiene commands exit 0.
- [ ] `compose:down` has no volume-removal argument.
- [ ] `compose:reset` retains the original destructive command.
- [ ] CONTRIBUTING distinguishes shutdown from reset.
- [ ] No changes outside the allowed scope; index status records the result.

## STOP conditions

Stop if script definitions have drifted, a supported wrapper now performs shutdown, fixing this requires changing desktop/backend teardown, or the targeted gate fails twice after a reasonable correction. Do not run a real reset to prove correctness.

## Maintenance notes

Keep default lifecycle operations nondestructive. Review future script aliases for hidden volume deletion. Backups honoring custom database identities are a separate finding and deliberately deferred.

