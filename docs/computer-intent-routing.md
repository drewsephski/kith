# Computer intent routing and idle resources

Baseline: `544d2678` (PR #16 merged). This work is local; no deployment, native
publication, credential changes, or live provider calls are part of its verification.

## Confirmed causes

The executor already delayed computer provisioning for fresh text-only runs.
Entering the full agent profile did **not** itself start a sandbox. That boundary
and PR #16's lazy catalog, run identity, lease renewal, safe streaming, selected
model and reasoning preferences remain intact.

Web/Electron's Computer panel effect called boot for stopped/missing states and
for missing running-screen URLs. Mobile booted after route readiness. Images
were transported directly to the model **and** copied into the workspace before
inference. Idle detection considered any active run belonging to a computer's
bot; private computers did not acquire the Team execution lease. E2B's generic
connection helper used `Sandbox.connect()`, including from heartbeat/view paths.
That API may resume a paused computer and extend its timeout.

## Activation inventory

The inventory covers production sources, excluding test providers and SDK fixtures.
Electron hosts the web UI; it has no separate E2B boot implementation.

| Path | Classification and behavior |
| --- | --- |
| `assistant.ensure`, signup/onboarding, bot creation, computer assignment | Identity/configuration only. No provider startup. Intro/background runs use the same demand boundary as any other run. |
| Web `Shell` Computer panel effect, saved layout restoration, bot switching | Previously passive boot callers. Now read thread/state and, when running and visible, request its screen. |
| Mobile `computer` readiness and refresh controller | Previously auto-booted. Now state reads only; stopped/suspended states never request a screen URL. |
| Web/mobile Start or Resume | Explicit authenticated `computer.boot`; duplicate client actions are guarded. Existing lifecycle CAS and execution leases remain the server fence. |
| Web full-window/Open, Take control, agent takeover card; mobile Take control | Explicit actions. Existing boot/takeover authorization, screen generation and lease checks remain. Missing screen URL alone does not call boot. |
| Teaching start in `taught-skills`, `TeachComputerOverlay` | Explicit computer workflow. Teaching start can provision; control leases protect recording. Opening a teaching session retains its existing authorized behavior. |
| Executor `ensureComputer`, `ensureToolComputer` | Demand from an available computer-only tool after existing validation, disablement, authorization, approval and effect handling; or a persisted computer/takeover recovery checkpoint. Single flight within a run. |
| Executor current-turn/steering attachments | Metadata and inline vision do not start a computer. Files and images are copied at an authorized computer-tool boundary; historical attachments are restored only when the tool refers to their workspace paths. |
| Automation, routines, messaging, groups, delegated work | Same shared executor and demand boundary; their agent profile does not grant computer startup. |
| `provisionComputer` | Central state/CAS, binding, workspace restore, preparation and lifecycle implementation. All manual, agent and teaching starts use it. Cancellation is checked before provider startup. |
| `replaceComputer`, durable `computer.update`, recovery/reset/update APIs | Explicit recovery or maintenance; checkpoint, teardown, replacement and restore are retained. Maintenance reservation protects the operation. |
| `computer.screenUrl`, terminal, input, list/read/write/download | Screen and terminal require running state; writes/input require existing control. Stopped file browsing uses the saved workspace. These APIs do not provision. Running viewers and explicit live filesystem operations count as activity. |
| `computer.heartbeat`, active executor heartbeat, long E2B commands | Viewing only while visible/focused; executor only after computer demand. E2B keepalive renews a cached handle and never connects/resumes an uncached one. |
| `computer.sleep` Graphile handler | Server-owned idle check, background probe, fenced suspension claim, checkpoint and pause; rechecks after checkpoint. No client idle timer. |
| Explicit stop, bot/child/archive cleanup, workspace stop/replacement | Checkpoint and pause/destroy existing machines. E2B pause/kill use an existing handle or static ID operation, never connect first. |
| E2B `box` | Passive attachment uses the SDK API client's **GET** sandbox details, then constructs a handle with returned envd connection details. It never calls the resume endpoint. Paused state returns a structured suspended error. |
| E2B `provision` | Only demand-owned lifecycle provisioning may call `Sandbox.create` or `Sandbox.connect`; paused state is checked and stale cached handles are discarded before explicit resume. Cancellation signals reach create/connect. |
| E2B timeout renewal | Coalesced/throttled `setTimeout`; long commands renew while pending. Provider timeout is idle interval plus a 60-second checkpoint safety margin, with `onTimeout: pause`, `autoResume: false`. |
| Sandbox factory, provider environment, host-aware dispatch | Composition/translation only. Host computers retain their platform semantics. No inference classification calls or credentials enter clients. |

Provider-neutral computer contracts still separate provider state from portable
workspace state. A passive operation cannot repair a missing computer by creating
its replacement. A legitimate demanded run can do so through the existing lifecycle.

## Routing and attachments

`computer-demand.ts` owns the computer tool set, preparation hints and common
capability preference guidance. Outcomes are `conversation`, `connected_tools`,
`computer_candidate` and `uncertain`. Existing deterministic conversation
eligibility is preserved. Known connected sources improve discovery; persisted
computer tasks and filesystem attachment metadata are preparation signals.
Unknown/ambiguous requests retain the normal full agent and lazy tool catalog.
No textual outcome authorizes a computer, disables a capability, or changes models.

The main model can discover connected tools, memory/history, web search or HTTP
capabilities, or escalate through the existing catalog into a computer tool. The
original execution/approval/effect boundary remains authoritative. Failed/busy
computer setup retries retain the same durable run and fencing behavior.

Images use the existing authorized artifact load, image limits and unavailable
image reporting. File/image metadata supplies deferred workspace paths without
implying that bytes have already been copied. Files do not start a computer before
inference; an authorized file/shell tool materializes them using the existing
artifact authorization and size checks. Steering attachments follow the same
policy. Later turns can restore missing attachments referenced by a workspace
tool, without overwriting an existing or edited copy. File contents still require
a file/shell tool; there is no new inline document reader or speculative parsing.

## Idle policy and races

E2B defaults to `E2B_IDLE_MS=90000`; other providers retain
`SANDBOX_IDLE_MS=300000`. Each setting accepts zero to disable its own group.
The provider-native timeout remains longer than the application idle interval.

`Computer.lastUsedAt` records actual startup, computer tools, viewer heartbeats and
explicit live filesystem operations independently from lifecycle/database updates.
The migration initializes it from each row's previous activity timestamp.

Execution leases now protect both Team and private computers. Noncomputer runs
hold no lease and cannot retain compute. The idle job protects live demanded run
leases, explicit boot/teaching reservations, maintenance, active human control and
provider-observed background work. Unsupported/failed background inspection fails
closed. The suspension CAS checks maintenance, execution leases, control,
provider reference, lifecycle timestamp and last-used timestamp. Checkpoint and
post-checkpoint rechecks are retained. New lease acquisition rejects a live
suspension claim; database fencing prevents late activation from winning it.

Waiting-input and waiting-takeover checkpoints retain their lease records but
do not retain compute when no human/background work is active. The suspension
CAS exempts only the observed dormant lease fences; reacquisition of a higher
fence blocks suspension. Explicit Resume for an authorized waiting takeover uses
its original held run/screen fence without releasing the durable reservation.

Closing/hiding the UI stops viewing heartbeats. Both clients guard duplicate startup and pass cancellation signals to the server.
Mobile callbacks and actions are scoped to the account/Space selection epoch, including A-to-B-to-A switches.
Existing takeover leases and teaching expiry remain authoritative.

## Observability and capacity

Sanitized `computer.resource` events record creation, explicit connection/resume,
timeout renewal, suspension, destruction and failed suspension. Reasons include
manual start, computer tool, teaching, takeover, recovery, active computer and idle.
The resource identifier is an HMAC of the provider ID; raw IDs, URLs, keys, prompts
and connected-account content are not included. `observed_active_ms` is a
process-observed duration and can be unknown after process restart; it is **not**
provider billing. Idle duration is available from the durable last-used timestamp.

The existing transactional `SANDBOX_MAX_COMPUTERS_PER_USER` record quota remains.
An optional `SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER` fleet fuse serializes active
count plus activation claim under a per-owner database advisory lock. It applies
to manual, agent, teaching and recovery starts. Team Computers count once; host
computers are excluded. Zero preserves the previous uncapped operator policy.
The normal uncapped path adds no extra transaction or query.

## Optional Jev evaluation

Jev uses OpenRouter's separate
[Decisions API](https://openrouter.ai/blog/insights/what-is-jev/), not chat completions.
The evaluation-only adapter pins `typesafe/jev-1.13`, validates typed choice,
probabilities/confidence, bounds input and response sizes, uses a 750-ms deadline,
and makes no retries. It requires shadow mode, explicit sharing permission and a
server-side key; failure returns to existing routing. There is no production
request-path caller and no automatic enablement.

The 24 synthetic labeled fixtures cover questions, memory, connected services,
web/API work, GUI/shell tasks, indirect and mixed requests, follow-ups, image/file
attachments, quotations and ambiguity. The offline evaluation found 11 classified
hints matching their labels, 13 abstentions, and zero false computer candidates.
Abstentions preserve full agent capabilities. These authored fixtures do not
establish real-world classifier accuracy or missed-task rate.

```sh
pnpm eval:computer-routing
# Optional paid synthetic comparison, using an explicitly budget-limited server key:
pnpm eval:computer-routing --jev-shadow --max-calls=24 --max-usd=0.01
```

The evaluator never loads application environment files or private history. It
bounds call count and reserves a conservative amount before each bounded request;
unknown cost stops further calls. Returned provider cost is recorded separately
from latency. No live Jev calls have been made, so improvement, live latency and
cost comparison are unverified. It remains disabled; a synthetic and
consent-approved representative comparison is required before considering live use.

## Verification and lifecycle counts

SDK mock counts, authenticated database/worker counts and provider billing are
separate evidence. Baseline entries below are source-audited behavior at
`544d2678`, not a replayed live-provider or timing baseline.

| Operation | Reviewed baseline | Implemented behavior and evidence |
| --- | --- | --- |
| Open/reload a stopped Computer panel or switch to a stopped bot | Panel effect could invoke boot | Zero boot RPCs in web acceptance; explicit double-click Start provisions once. |
| Open stopped/suspended mobile route | Readiness effect invoked boot | Rendered route tests make zero boot calls; explicit Start single flight, Cancel and account/Space epoch tests pass. |
| Image-only vision turn | Attachment copy demanded computer before inference | Zero per-run provisions/preparations in 40 benchmark image trials; image bytes still reach the vision model. |
| File attachment with no computer tool | Eager workspace materialization | No provision for a saved-for-later file; current and later-turn read_file demand copies and reads the real fixture bytes through API/worker/PostgreSQL. |
| Ordinary text-only runs | Already demand-driven after PR #16 | Preserved; 360 noncomputer benchmark trials have zero per-run provisions/preparations. |
| Authorized computer tool | Lazy provision | Preserved; 200 computer-required benchmark trials each provision/prepare once, with the same durable run. |
| Passive paused E2B state read | Generic SDK connect could resume | SDK mocks and GET-only attachment test record zero create/connect/timeout renewals; authenticated screen read retains the ref and emits suspended state. |
| E2B idle threshold | Five minutes by default | 90 seconds, with actual-activity timestamps, dedicated/Team lease fences, control, maintenance and background-work protection. |

The benchmark uses local PostgreSQL, Graphile, the actual API/executor/Pi runtime
and a loopback model emulator. It injects 120-ms provision, 60-ms preparation and
40-ms discovery delays. There are 20 cold and 20 warm trials for each of 14
scenarios, 560 samples total. Warm fixture startup is outside the timed run's
counts. The retained report is `test-report/computer-routing/latency.json`
(ignored local artifact). This establishes the execution boundary and safe-text
latency under controlled delays; it does not establish live inference quality,
provider billing, E2B running duration or physical-device behavior.

The final benchmark completed successfully with the exact command:

```sh
pnpm perf:agent --postgres=local --trials=20 --output=test-report/computer-routing/latency.json
```

Selected first useful safe-text measurements over the loopback SSE connection:

| Scenario | Cold p50 / p95 (ms) | Warm p50 / p95 (ms) | Provisions per run |
| --- | --- | --- | --- |
| greeting | 108 / 118 | 107 / 110 | 0 |
| arithmetic | 109 / 119 | 110 / 113 | 0 |
| memory | 153 / 156 | 153 / 157 | 0 |
| connected-data | 201 / 206 | 201 / 205 | 0 |
| attachment | 154 / 160 | 154 / 159 | 0 |
| browser | 405 / 413 | 403 / 409 | 1 |
| long-agent | 698 / 710 | 696 / 714 | 1 |

The final 560 samples contain zero per-run provisions/preparations in all 360
noncomputer trials; all 200 computer-required trials contain exactly one of each.
These measurements include controlled dependency delays and do not establish a
live-provider or classifier speed comparison.

The following checks passed locally:

- `pnpm lint`: zero errors; the existing 20 warnings and five informational
  diagnostics remain in unrelated test fixtures.
- `pnpm check`: all 22 package checks passed.
- `pnpm --filter @rakazo/mobile check` and `pnpm --filter @rakazo/mobile test`:
  mobile type checking passed; 108 files and 1,007 tests passed.
- Six isolated PostgreSQL API/worker integration suites: approvals, computer
  demand, executor lifecycle, authorization, attachments and connections. The
  final demand suite passed 17 cases; the other five passed 62 cases, 79 total.
- `pnpm test:e2e "--spec=computer-start|screen-error|computer-workspace|computer-update|needs-you|teach-task|team-computer"`:
  all 12 Chromium acceptance cases passed. Desktop-width and 375-pixel Computer
  screenshots were inspected. One existing release-control fixture was updated
  to use explicit Start, as the passive boot behavior was intentionally removed.
- `pnpm --filter @rakazo/web build`: passed, with existing large-chunk warnings.
- Docker/Chromium computer replay: two files and three cases passed, including
  real browser actions and CSV download.
- `pnpm eval:computer-routing`: 24 synthetic fixtures, 11 classified correctly,
  13 abstentions, zero false computer candidates, zero live calls/cost.
- `git diff --check`: passed.

`pnpm run test --maxWorkers=2` passed: 680 files, 8,561 tests. The offline
run skipped 46 database-gated suites (317 cases); the selected database suites
were also executed against isolated PostgreSQL databases as described above.


## Files changed

| Area | Sources and regression coverage |
| --- | --- |
| Shared demand and routing | `packages/adapters/src/computer-demand.ts`, its test, `executor.ts`, `executor-recent-turn-images.test.ts`, `index.ts` |
| Attachment preparation | `packages/adapters/src/thread-artifacts.ts`, its test |
| Lifecycle and actual activity | `packages/adapters/src/computer-idle.ts`, `computer-lifecycle.ts`, `computer-control.ts` and their tests; `computer-update.ts`, `teaching-session.ts` and its test |
| E2B SDK boundary | `packages/adapters/src/e2b-sandbox.ts`, its test |
| Durable activity | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20261011210000_computer_activity/migration.sql` |
| Authenticated API | `apps/api/src/router.ts`, its test |
| Web and Electron UI | `apps/web/src/pages/Shell.tsx`, `apps/web/src/lib/thread-events.ts` and its test; all ten web locale catalogs |
| Native mobile UI | `apps/mobile/app/computer.tsx`, `apps/mobile/lib/computer-refresh.ts`, `computer.ts` and their tests; `computer-screen.test.tsx`; de/ru/zh locale additions |
| Web acceptance | `apps/web/e2e/computer-start.spec.ts`, `team-computer.spec.ts`, `computer-update.spec.ts`, `teach-task.spec.ts` |
| API/worker/database regressions | `packages/testkit/src/computer-demand.postgres.test.ts`, `packages/testkit/src/cli/harness.ts` |
| Evaluation only | `packages/adapters/src/jev-routing.ts` and its test; `packages/testkit/src/computer-routing-fixtures.ts`, `packages/testkit/src/cli/computer-routing-evaluation.ts` |
| Configuration and report | `.env.example`, `package.json`, this report |

## Cost and UX tradeoffs

A passive panel now requires one deliberate Start/Resume action. Legitimate agent
computer demand and teaching remain automatic within their existing authorization.
The 90-second idle threshold saves unused running time, at the cost of more resume
and checkpoint work for intermittent use. Active viewers, human control, teaching,
computer tools and background jobs retain compute. Shared computers retain compute
for another bot's genuine work. No savings percentage or provider billing amount
is inferred from the offline lifecycle counts.

Connected-tool preference is model guidance plus existing discovery and execution
gates. It does not prove that every future model picks the cheapest suitable tool.
The synthetic routing set deliberately abstains on ambiguous intent. Jev has no
verified accuracy/latency advantage yet and adds an extra provider/privacy boundary;
it remains evaluation-only and disabled.

## Release blockers

Live E2B positive/recovery acceptance, live inference/routing comparisons, packaged
Electron acceptance in CI's virtual display, iOS simulator/physical-device and
Android emulator/physical-device acceptance remain separate release gates.
Deployment also requires applying the activity migration; it was tested only in
isolated local databases. No native simulator/device is currently booted, and
Maestro/Android acceptance tooling is unavailable in the inspected environment. The focus-stealing Electron suite is
reserved for CI as required by `AGENTS.md`. This source change does not establish
a production-ready native or live-provider release.
