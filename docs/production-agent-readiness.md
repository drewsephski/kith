# Production agent readiness

Evidence date: 2026-10-12. Base: `708482e55c78123ebec1172c772db6bfbe6e82e6`.
This is an implementation and acceptance record, not release authorization.
No production deployments, production migrations, app publication or releases were performed.

## Confirmed findings and changes

- Quiet model streams observed Stop only at the lease heartbeat, up to 60 seconds later. The executor now follows the authoritative, scoped cancellation event and aborts inference promptly. Stop also cancels the task and attempt, clears the lease, and is reused by teaching cancellation. Existing effect fencing and idempotency remain authoritative.
- Failed inference discarded already streamed text and completed tool steps. Failure finalization now persists sanitized partial blocks and the terminal failure atomically. A real API/Postgres/emulated-stream regression independently verifies the saved file and completed effect after disconnect; the run remains failed.
- Real E2B idle acceptance exposed a provider contract mismatch: the SDK throws `CommandExitError` for nonzero commands, including the intentional exit-1 idle sentinel. The adapter now emits the actual stdout, stderr and exit code. Cancellation and other errors still propagate. Real idle suspension and resume then passed.
- A repeated live trial completed a fresh explicit memory request without persisting the preference. The existing bounded continuation guard now requires a successful supported memory-write receipt for a fresh `Remember …:` directive. It requests missing execution at most twice, never automatically repeats an attempted failed or uncertain write, and fails honestly without persisting unsupported confirmation prose. This is a conservative directive guard, not universal semantic task verification; existing memory, recall and honest blockers remain terminal.
- API and worker startup now check the computer activity column before accepting work. Missing schema fails with an actionable migration requirement. The probe is read-only; its regression temporarily renames the column only inside a rolled-back disposable transaction.
- Exact-base CI had stale computer UI expectations: web expected maintenance controls to disappear and Android expected takeover before explicit Start. Acceptance fixtures now follow the existing demand-driven interface. No application identifiers, URL schemes, runtime channels, tokens or native UI were redesigned.

The selected model and reasoning settings, existing provider fallback, durable execution path, approvals, connector isolation, capacity limits, lazy discovery, streaming and computer-demand contracts remain in use. No competing runtime was introduced.

## Product request path

Web/Electron and native composers persist intent through authenticated `threads/send`, with nonce deduplication and human-visible prompts distinct from execution prompts. Thread targeting owns account/Space authorization, model pins and task/run creation. Graphile dispatches `run.continue`; the shared executor claims a fenced lease and resolves execution profile, context, memory and catalog. Pi streams safe text and dispatches tools back through that executor. Connected resources retain authorization/revocation checks and durable effect receipts. Computer-demand checks precede provisioning; only computer work or explicit Start/Resume can provision. Approval cards pause durable runs and replay the exact pending effect after authorization. Terminal events and messages reconcile existing shared web and native renderers, reload and cross-device snapshots. Notifications consume durable completion; physical push delivery remains a separate gate.

## Controlled provider acceptance

`pnpm test:canary` defaults to **NOT RUN** and does not load `.env` or contact providers.
`pnpm test:canary --list` lists cases. `pnpm test:canary --offline` exercises the product with protocol emulation and a fake sandbox; ordinary CI runs only this mode.

Live mode requires both `VERIFY_PRODUCT_ACCEPTANCE=1` and `--live`, a private connection compatible with `ModelConnectInputSchema`, explicit pricing, and all four budgets:

```sh
VERIFY_PRODUCT_ACCEPTANCE=1 pnpm test:canary --live \
  --connection=/private/acceptance-connection.json \
  --pricing=/private/acceptance-pricing.json \
  --sandbox=e2b --max-usd=0.50 --max-model-calls=60 \
  --max-computer-starts=4 --max-runtime-ms=600000
```

The operator must export `E2B_API_KEY` for real computers. Model credentials are read only from the explicit connection; the provider/model are configurable. Keep both files outside tracked content. Pricing uses the existing evaluation format: `source`, `version`, and USD-per-million `input`, `output`, `cacheRead`, `cacheWrite` rates. Missing credentials/configuration are **NOT RUN**, never passed. Legacy direct provider tests additionally require their existing explicit flags and a disposable-database assertion for database cases.

The CLI owns Docker Postgres 16 and a temporary workspace; it never uses an operator database. It removes deployment/connector/host/telemetry credentials from its environment. API, database, Graphile worker host, executor, Pi and adapter paths are the real product implementations. The suite uses in-process HTTP requests and a separate Graphile pool; it does not prove separately deployed process topology. External integrations are synthetic fixtures, so no production-connected account is accessible through the fixture catalog. Live fetches are restricted to the configured model origin and E2B domains, with actual model HTTP retries counted. This restriction is a harness guard, not a network firewall around an E2B guest.

Budgets bound model reservations, request count, computer creation/resume requests and runtime. `max-usd` bounds model spend using supplied pricing; it does not guarantee E2B billing. Missing usage retains conservative spend reservations rather than pretending zero cost. Provider quota/billing controls remain necessary for E2B. Tracked sandbox references are destroyed even when preparation fails; any cleanup failure fails acceptance. Reports contain statuses, counts, durations and sanitized error categories, never prompts, responses, credentials, memory, service contents or remote IDs.

Eleven scenarios verify conversation/stream reconnect, cancellation and aggregate state, persisted memory after worker/API recreation with cleared chat history, connected API preference, revocation, exact independently read file bytes, computer lifecycle, approval allow/deny across recreation, and rejected late approval after cancellation. Approval expiration is covered by existing deterministic lifecycle tests rather than by waiting for real expiry in this suite. The real computer case also requires a 95-second foreground command, observed successful completion and no suspension during activity. Offline mode does not claim this timing proof.

## AI quality regressions

The provider-neutral quality catalog now contains 20 scenarios. New cases assert ordinary-answer/no-computer behavior, connected-source outcome/no-computer behavior, honest unavailable authorization and delegated file content. Existing research, scheduling, routines, files, browser, approvals, failure, partial success, ambiguity and prompt-injection cases remain. Sandbox provisioning counts are evidence, so plausible prose cannot hide an unnecessary startup. Tool sequences stay flexible except at authorization/capability boundaries.

Four new cases also passed one real-model trial each using an isolated connector and fake computer. This is a small sampled result, not a production failure-rate estimate.

## Verification record

Local environment: macOS arm64, Node 26.3.0, pnpm 9.15.0, Docker Postgres 16, configured OpenRouter `openai/gpt-6-luna`; live max output 4096 tokens. Live credentials/configuration and detailed artifacts remain ignored. Builds and other tests overlapped early live trials, so their response timings are not controlled latency comparisons.

| Evidence | Outcome |
| --- | --- |
| Exact-base CI | Failed: web computer assertion and Android explicit-start screenshot expectation. Lint, types, unit, Postgres and builds passed. [CI run](https://github.com/drewsephski/kith/actions/runs/38205988282) |
| Exact-base macOS screenshot | Passed. [Run](https://github.com/drewsephski/kith/actions/runs/38205987857) |
| Exact-base web report publication | Failed; a passing test job cannot establish artifact publication. [Run](https://github.com/drewsephski/kith/actions/runs/38207592765) |
| Lint / type checking | Passed; lint retains existing warnings. Acceptance CLI is now included in type checking. |
| Full unit suite | 685 files / 8579 tests passed before the final memory guard; 47 gated suites / 319 tests skipped. Final-source rerun pending. |
| Mobile types / unit | Passed; 108 files / 1007 tests. |
| Focused memory/runtime regressions | 63 tests passed, including bounded missing-write recovery and no uncertain mutation retry. |
| Full Postgres integration | Final-source rerun pending. Focused partial failure, preflight, cancellation, computer demand and approvals passed. |
| Shared web/Electron renderer journeys | 12 browser E2E tests passed: bot CRUD, failures, computer start, approvals and Spaces. Uses actual isolated API with emulated model. |
| Computer replay | 2 files / 3 Docker Chromium replay tests passed with `rakazo/computer:local`. |
| Computer routing evaluation | 24 fixtures: 11 correct decisions, 13 conservative abstentions, zero false computer demands, zero live calls. |
| Latency, 20 trials | Pending final quiet benchmark. |
| Combined real model + E2B | One full 11/11 passing invocation before extended active-work/memory regressions; final-source invocation pending. See observations below. |
| iOS installation | Release binary built, installed and launched on iPhone 17 Pro / iOS 26.5. Runtime acceptance pending properly signed simulator rebuild. |
| Packaged Electron / Android native | Final-head CI acceptance pending. Local focus-stealing desktop E2E was not run. |

Earlier failures are retained rather than relabeled as passes: a receipt assertion rejected valid shell execution and was corrected to independently observable file content; real idle detection failed until the SDK mismatch was fixed; identical approval fixture payloads were legitimately treated as already completed and were made unique; a later memory-save trial failed its persisted-outcome assertion and led to the receipt guard. A takeover-expiry fixture now permits an absent screen after the resumed run releases its lease, while still requiring a remaining screen to be read-only and rejecting input.

The complete live invocation made 28 model calls/HTTP requests, one creation and one explicit resume, two stops (idle and explicit), and one destroy; cleanup passed. Its conservative model-spend upper bound was USD 0.0141568164. Total provider token/cost accounting remained unknown because cancellation did not return usage. E2B running/idle observations do not establish E2B billed duration. One trial per scenario does not establish p50/p95 or statistically meaningful reliability. No repeated production failure-rate claim is made.

## Remaining release gates

- Final-head PR CI and review, web screenshot publication, packaged Linux Electron acceptance and Android installed-app journeys must complete; signing, notarization, updater and distribution remain separate operator gates.
- Real installed native acceptance must cover durable sessions, drafts, approvals and restart; physical iOS/Android push notifications, production OAuth return, share extensions and cross-device provider sessions are not established by emulator exports or backend tests.
- Production must apply existing migration `20261011210000_computer_activity` before upgrading API/worker. This change adds no migration and executes no production migration.
- Production revision/health, exact auth origins, actual password recovery delivery, operator provider access/billing and supported older-client compatibility must be verified at deployment time. Repository configuration is not hosted acceptance.
- Existing local observability records response stages, model/tool counts, provider usage, cancellations and computer resource/lifecycle events without payload logging. This work consumes those records and does not add a dashboard. Parallel-user capacity/security regressions remain part of deterministic integration acceptance; real fleet load and bill reconciliation are not established.

Next improvements should come from repeated guarded outcome trials across the supported model/provider set, recovery fault injection and real native critical journeys. Broader semantic task completion needs observable receipts and outcome-specific checks; heuristic prose scoring is insufficient.
