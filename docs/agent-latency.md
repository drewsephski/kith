# Agent latency

Kith keeps one durable execution path for conversation and autonomous work. These
changes optimize that path rather than introducing an inference endpoint that
bypasses authentication, run leases, quotas, cancellation, or usage accounting.

## Scope and baseline

The baseline is main commit `6882dc6e`, inspected after fetching the remote. The
performance work was isolated from concurrent mobile onboarding work. Both
comparisons use the same benchmark, model emulator, database migrations, API,
Graphile queue, worker executor, Pi transport, and client SSE reader. The baseline
has only benchmark fixtures and an injectable browser adapter added.

The emulator deliberately controls dependency timing: computer provisioning
120 ms, computer preparation 60 ms, connector discovery 40 ms, provider headers
5 ms, first text 25 ms, and subsequent chunks 2 ms. Slow-provider fixtures use
50/250 ms for headers/first text. Background fixtures enqueue four 500 ms jobs.
These are controlled dependency delays, not estimates of production vendors.

Every measured trial creates a fresh synthetic account and bot before measurement.
This avoids repeat-response continuation guards and measures parallel users without
racing account-level model configuration. Cold means a computer that has never
started; warm means that computer is already running. Both use a warmed API/worker
process. Provider prompt caches and physical device cold starts are not simulated.
The benchmark uses real Postgres transactions, Graphile delivery, model HTTP/SSE,
redaction, durable events, and client SSE consumption. API requests use the real
Hono fetch handler in process; the worker host runs in that same process and
model HTTP is loopback. Production process boundaries are not simulated. Ingress/mobile network
transit and physical UI painting are excluded. Client receipt below means harness
SSE receipt, not an observed iOS device. It asserts final answers,
required tool results, saved-memory context, and uploaded image transport.

## Reproduce

Docker with `postgres:16-alpine` (or local `initdb`/`pg_ctl` binaries), the repository's supported Node version, and
installed pnpm dependencies are required. No hosted credentials are needed. The
harness uses synthetic accounts, clears hosted model credentials from its process,
and pins its database and provider configuration. Reports contain numeric measurements and fixture
names, without prompt text, responses, secrets, account identifiers, or run IDs.

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm check:agent-latency
pnpm perf:agent --trials=20 --output=test-report/latency/current.json
pnpm perf:agent --trials=20 --parallel=4 --scenarios=greeting,browser --output=test-report/latency/parallel.json
pnpm perf:agent --trials=5 --reconnect=1 --chunk-ms=20 --scenarios=explanation,slow-provider --output=test-report/latency/reconnect.json
```

Use `--postgres=local` for an isolated temporary loopback-only Postgres cluster
when Docker is occupied. It keeps fsync enabled, chooses a free port, and stops
and removes its own cluster after the run. Record the local Postgres version and
use the same database engine for both comparisons.

Use `--chunk-ms=` to control output chunk pacing. The reconnect example slows
chunks to keep generation active across the 30 ms subscription interruption.

Use `--interactive=0` to compare the shared queue without reserved execution
capacity. `--scenarios=` accepts the names in the results table. p50 and p95 use
nearest-rank percentiles; each scenario and computer temperature has its own
sample population. Reports include individual samples, so tails and failures can
be inspected. The publication sample is the first database poll observing a
durable streaming event (5 ms polling resolution); SSE receipt can precede that
poll. The worker trace measures the actual post-append publication boundary.
Completion means the authoritative durable run status is completed. Worker
cleanup is awaited before another trial but is outside that completion sample.
Message/prompt byte counts include serialized system and conversation messages;
tool-schema bytes are separate. Bytes are not provider token counts.
Partial reports have `complete: false`; they are not successful
benchmark results. Run comparisons serially, avoid builds/tests during measurement,
and record host contention. Earlier development sweeps exposed invalid fixtures
and timed out under competing builds; those incomplete sweeps are excluded from
performance claims, not counted as successful trials. A measurement audit also
found that the first version counted preparation/activity text. Those first-text
reports were discarded. Final runs count only nonempty assistant text/deltas with
`streaming: true`; status and tool activity are excluded.

## What changed

- Fresh text-only runs no longer acquire or provision a computer before inference.
  File materialization, computer tools, takeover, and checkpoint recovery still
  acquire the fenced computer lease. Startup is single-flight within the run;
  conflicts requeue the same durable run before claiming an effect. Tool execution
  renews the run and computer lease, and current computer binding is checked before
  startup. Shared and private computers retain the existing lifecycle implementation.
  Scripted file output also renews both leases before writing.
- A conservative deterministic conversation profile uses the existing lazy tool
  catalog's three schemas. Connector discovery and detailed capability instructions
  are deferred. Saved memory, scratchpad, recent history, retrieval, safety guidance,
  skills, model selection, and approval handlers remain available. Ambiguous,
  resumed, group, attachment, personal-source, and consequential requests use the
  full profile. On-demand catalog activity uses "Finding tools" and "Using a tool"
  only when those operations occur, avoiding internal protocol names. Catalog execution goes through the original validation and effect
  handler; it is not an authorization shortcut or a second tool registry.
- The source message nonce is reused from the history read, with a scoped fallback
  when history does not include it. An exact default credential match is reused
  during run model selection. Independent context operations remain parallel.
  No decrypted-secret or permission cache was introduced.
- Reasoning-capable models without an explicit preference use supported low effort
  for eligible conversation. Existing capability clamping applies; mandatory
  reasoning endpoints do not automatically receive `off`. Explicit settings remain
  authoritative. Tool use or additional user steering raises the implicit policy to the normal agent effort;
  fallbacks recalculate against their own capabilities. Models/providers and output
  budgets are unchanged.
- Missing iOS streaming preferences now enable progressive safe text. Saved `off`
  remains off, and a delayed preference load cannot overwrite a new explicit choice.
  Existing reducers, redaction, reconnect, final-message reconciliation, and scroll
  behavior remain the source of truth. Queued/running/read receipts are the current
  main implementation; optimistic messages do not imply worker execution.
- The worker reserves one of its existing four slots for `run.continue`; the shared
  three slots still handle both runs and background jobs. Both runners share the
  bounded Postgres pool. Reservation is disabled when concurrency/pool headroom is
  insufficient. Graphile task lists support this arrangement; queue names alone
  serialize work and do not reserve capacity. See [Graphile techniques](https://worker.graphile.org/docs/techniques)
  and [run API](https://worker.graphile.org/docs/library/run).
- Acceptance cancels stale optional conversation-suggestion inference and invalidates
  its existing bounded cache. Suggestion cancellation, usage settlement and current
  context checks remain intact. Current For You discovery performs deterministic
  bounded source reads; it does not make a secondary model call.

## Trace coverage

The existing `run response timing` record remains the first-safe-publication
anchor: `queueWaitMs`, `setupMs`, `modelToFirstTextMs`, and `streamDeliveryMs`.
Additional sanitized records extend it:

| Stage | Evidence |
| --- | --- |
| Send tap / API arrival | Local monotonic nonce trace / middleware receive time |
| Auth, validation, model readiness | `run acceptance timing` auth and source-input validation durations; atomic run-state checks remain in transaction time |
| Durable message/run commit | Acceptance commit duration; existing transactional state |
| Enqueue | Acceptance enqueue duration and failure count; durable reconciliation remains |
| Worker pickup and lease | Existing queue wait plus executor lease duration |
| Initial reads | Executor `initialReadsMs` |
| Connector discovery | `connectorMs`, including lazy discovery when invoked |
| Memory, scratchpad, retrieval | Parallel context-stage duration; category byte counts |
| Computer | Binding authorization, lease and provision/preparation duration when demanded; test provider call counters |
| Model request | `run model timing` request marker after provider preparation/reservation |
| Provider headers | Response hook marker where supported, including response count |
| First reasoning / provider text | Timing markers only, before text redaction; hidden reasoning is never recorded |
| Durable first safe text | Existing first publication / delivery timing after redaction |
| Client receipt | Local run-correlated SSE receipt trace; benchmark SSE reader |
| First text frame | First animation frame after React commits text; development diagnostics |
| Model / run completion | Model terminal marker and executor completion duration |

`modelToFirstTextMs` ends at provider text before redaction. `streamDeliveryMs`
includes redaction, buffering and persistence before the safe publication marker;
these are not separately measured sub-stages. Client first-text measurements count
only safe published streaming text.

Frame timing is a rendering proxy, not physical display proof. Client traces are
bounded to 32 entries with a 30-minute TTL and scope invalidation. They contain no
content. Run IDs correlate internal logs only; aggregate dimensions should use
bounded stage, profile, operation and worker class, never run/account/thread IDs.
Model/provider identifiers belong to correlated diagnostics or a configured
allowlist, not unrestricted metric labels.

Context size records include history, memory, scratchpad, recall, skills, tool
schemas, and images. Provider request timing includes system/message/schema bytes,
effective thinking level, model/provider and call identifier. Usage records expose
input/output/reasoning/cache-read/cache-write tokens when the provider supplies
them. Unknown fields stay unknown. Completion records include fallback and model
request counts; response counts identify repeated HTTP responses, not a claim that
all internal SDK retries are observable. No prompt, response, private reasoning,
raw memory, attachment body, email, token or secret is logged.

## Evidence and limits

All timings are milliseconds, shown as p50 / p95. Each row has 20 successful
trials per revision. Main sweeps cover 13 scenarios (520 trials per revision); the
eight-tool long task adds 40 per revision. No failed trial is included as successful.
The updated attachment rows are replaced by a final 40-run rerun after review
restored image materialization and demand preparation for steering attachments.
The original updated attachment trials supplied vision input but omitted the
workspace file; their lower timings are superseded and are not valid evidence
for file-based attachment workflows. Attachment responses now retain the required
computer preparation and show no meaningful speedup. The harness checks both
vision input and an available workspace path before accepting an attachment answer.
The measurements use PostgreSQL 14.19 locally, with fsync enabled. Raw reports
remain in ignored `test-report/latency/`; committed [aggregate results](benchmarks/agent-latency.json)
include their SHA-256 hashes and the complete setup/queue/context distributions.

| Scenario | Computer | First text baseline | First text updated | Completion baseline | Completion updated |
| --- | --- | ---: | ---: | ---: | ---: |
| greeting | cold | 356 / 435 | 113 / 128 | 365 / 443 | 124 / 143 |
| greeting | warm | 345 / 359 | 109 / 126 | 356 / 374 | 119 / 136 |
| background-load | cold | 846 / 1088 | 111 / 120 | 856 / 1173 | 119 / 128 |
| background-load | warm | 908 / 1351 | 116 / 123 | 939 / 1608 | 124 / 135 |
| slow-provider | cold | 617 / 629 | 379 / 389 | 629 / 641 | 389 / 404 |
| slow-provider | warm | 620 / 749 | 378 / 384 | 632 / 758 | 390 / 395 |
| arithmetic | cold | 350 / 536 | 108 / 115 | 357 / 558 | 117 / 123 |
| arithmetic | warm | 358 / 513 | 109 / 116 | 378 / 558 | 117 / 126 |
| explanation | cold | 347 / 479 | 109 / 115 | 378 / 545 | 135 / 142 |
| explanation | warm | 342 / 358 | 106 / 113 | 368 / 385 | 132 / 139 |
| follow-up | cold | 343 / 359 | 109 / 114 | 364 / 379 | 132 / 140 |
| follow-up | warm | 338 / 389 | 108 / 112 | 358 / 410 | 128 / 132 |
| memory | cold | 339 / 345 | 156 / 162 | 354 / 363 | 173 / 183 |
| memory | warm | 343 / 384 | 155 / 161 | 360 / 422 | 171 / 177 |
| connected-data | cold | 389 / 400 | 202 / 213 | 407 / 414 | 220 / 230 |
| connected-data | warm | 390 / 397 | 202 / 221 | 408 / 416 | 219 / 241 |
| tool | cold | 388 / 513 | 388 / 394 | 403 / 540 | 402 / 408 |
| tool | warm | 383 / 411 | 386 / 403 | 398 / 422 | 400 / 413 |
| computer | cold | 394 / 410 | 396 / 412 | 413 / 449 | 412 / 428 |
| computer | warm | 386 / 416 | 410 / 539 | 403 / 434 | 427 / 581 |
| browser | cold | 402 / 421 | 402 / 419 | 421 / 440 | 419 / 439 |
| browser | warm | 394 / 403 | 398 / 411 | 413 / 425 | 416 / 434 |
| attachment | cold | 339 / 348 | 345 / 387 | 363 / 370 | 366 / 410 |
| attachment | warm | 338 / 344 | 339 / 355 | 360 / 368 | 363 / 382 |
| multi-step | cold | 433 / 561 | 433 / 442 | 455 / 609 | 452 / 460 |
| multi-step | warm | 431 / 553 | 428 / 435 | 451 / 579 | 449 / 459 |
| long-agent | cold | 686 / 733 | 697 / 734 | 709 / 758 | 721 / 760 |
| long-agent | warm | 678 / 696 | 684 / 713 | 701 / 721 | 709 / 743 |

For cold-computer arithmetic, first-text p50 fell **350 → 108 ms (69%)** and
completion p50 fell **357 → 117 ms (67%)**. Greeting first-text p50 fell
**356 → 113 ms (68%)**. Greeting setup p50 fell **289 → 59 ms (80%)**.
Under four 500 ms background jobs, queue-wait p95 fell **498 → 6 ms** and
first-text p50 fell **846 → 111 ms (87%)**. These exceed the 30% target in the
controlled simple-conversation fixtures; production/provider/device improvement
has not been measured.

Acknowledgment was already quick: cold arithmetic acceptance p50 was
**10.3 → 9.5 ms** in process. No timer or premature status was used to claim a gain.
Greeting tool schemas fell **53 → 3**, **33,281 → 1,085 bytes (97% smaller)**;
message/system bytes fell **12,292 → 3,660 (70% smaller)**. Cold conversational
runs performed **zero** computer provisions/preparations and connector discoveries.
Baseline cold greetings performed one of each. Warm greetings also avoid the
baseline computer preparation. These deterministic call counts establish the
removed dependencies independently of wall-clock noise.

Complex task completion is broadly stable, not universally faster. Warm computer
write completion p50 increased **403 → 427 ms (6%)**. The nine-model-request
long task increased **709 → 721 ms (2%)** cold and **701 → 709 ms (1%)** warm.
All four file contents were verified from tool results. Fresh lease/binding checks
remain at execution boundaries. Host scheduling, initial process warming and
measurement noise also contribute; these are local serial sweeps, without
confidence intervals or production hardware equivalence. All p95 tails are retained.

### Concurrent users and recovery

Four independent users submit simultaneously after sequential fixture setup.
Both revisions completed 80 parallel trials. Timings are p50 / p95:

| Scenario | Computer | First text baseline | First text updated | Completion baseline | Completion updated |
| --- | --- | ---: | ---: | ---: | ---: |
| greeting | cold | 406 / 830 | 152 / 391 | 421 / 870 | 168 / 410 |
| greeting | warm | 381 / 389 | 149 / 175 | 397 / 404 | 163 / 191 |
| browser | cold | 490 / 580 | 501 / 610 | 514 / 600 | 527 / 640 |
| browser | warm | 471 / 486 | 487 / 516 | 496 / 511 | 513 / 542 |

The reconnect sweep completed 20 trials, each with one subscription interruption
and replay from its durable cursor. Explanation fixtures use 20 ms chunk pacing
to keep generation active across the 30 ms interruption. Slow-provider fixtures
still pay the provider delay; their cold first-text p50 is 386 ms and completion
p50 is 416 ms. Every run reconciled to its authoritative final answer. These
exercise stream recovery, not physical iOS background/foreground transitions.

Both main sweeps processed all 160 injected background jobs. Reserved-capacity
Postgres tests additionally hold background handlers behind gates, prove a run
executes before releasing those gates, and then verify background work drains.

The confirmed architectural bottlenecks were unconditional computer setup,
blocking connector discovery, a large tool inventory and repeated capability
instructions. The default medium reasoning policy and mobile streaming-off default
were confirmed in code; deterministic fixtures can verify policy/rendering behavior
but cannot prove real-model reasoning speed or answer quality.

Provider prefill, reasoning, throughput, actual prompt-cache hit rate, retry tails
and endpoint routing require real provider traces. No provider routing policy,
speculative request, retry removal, timeout reduction or model switch was introduced.
Stable shared safety/context prefixes and capability-aware cache options remain.
The emulator omits token usage: benchmark token/cache fields are null and must not
be interpreted as zero cost or a caching improvement.

The conservative profile may pay catalog discovery/tool-loading round trips when
an initially conversational answer needs a capability. This preserves access; it
does not promise every task is faster. All memory and security-sensitive context
reads remain on the setup path. Reserved queue capacity protects against non-run
background saturation, but cannot preempt four long `run.continue` jobs; scheduled
runs also use that identifier. Background-only maximum concurrency becomes three instead of four, reserving a
slot even when chat is idle. Production interactive/background mix and provider
limits still need operational traces. No native frame-rate, VoiceOver, physical
attachment, hosted provider, or signed-release claim follows from these tests.

## Verification

Focused tests cover profile eligibility, lazy tool escalation/collisions, computer
startup avoidance, streaming/redaction, effort preference/clamping, provider
response hooks, fallback/accounting and queue pool headroom. Postgres integration
covers real lease takeover/recovery, approvals, authorization/revocation, multiple
Spaces, attachments, voice, read receipts, queue reconciliation and reserved
capacity. The Docker computer replay runs actual Chromium, file download and
screenshot behavior using the cached local computer image.

| Check | Result |
| --- | --- |
| `pnpm check` | All 22 package checks passed |
| `pnpm check:agent-latency` | Benchmark CLI type check passed; the normal testkit check excludes CLI files |
| `pnpm --filter @rakazo/mobile check` | Passed |
| Focused adapter, runtime, executor, streaming, suggestion and queue regressions | 244 tests passed; additional fallback/idle-watchdog selection passed 61 tests |
| `pnpm run test --maxWorkers=4` | Integrated revision: 8,466 passed, 300 skipped; one unchanged script test timed out under full-suite load and the deployment/backup selection passed in a focused 28-test rerun |
| `pnpm --filter @rakazo/mobile run test --maxWorkers=2` | All 994 tests passed on the integrated revision, including shared attachment size retention |
| Selected Postgres integration suites | All 81 tests passed |
| `pnpm test:computer-replay --image=rakazo/computer:local` | All three Docker/Chromium replay tests passed |
| Final latency comparisons | 1,300 successful runs: 560 per revision, 80 concurrent per revision, 20 reconnect runs |
| `pnpm lint` | Passed on the integrated revision; existing warnings remain |
| `git diff --check` | Passed |

The isolated performance revision initially encountered existing translation and
formatting failures. Integration of the concurrent mobile hardening commit fixes
those failures while preserving its draft identity and screen-scope protections.
Repository lint, all 22 package checks and benchmark/mobile type checks pass.
The controlled timing comparison remains against the original main baseline.

Review regressions additionally verify lazy reconciliation of pending connected
accounts, revocation racing reconciliation, and peer bot context in conversational
questions. All 47 initial focused executor, connection and scripted-runtime tests pass.
Attachment and steering fixes additionally pass 122 executor tests, including
image-only workspace availability and busy-computer requeue under the same run ID.
The 12 model-settings/bot-navigation browser cases pass with explicit readiness
and finite animation completion checks. The full current-commit Postgres
selection passes all 81 tests.
Shared attachments retain the validated filesystem byte size through staging and
thread capacity checks; a boundary regression keeps a valid padded 10 MiB payload
and rejects an oversized file. Marketing screenshot capture uses built assets and
the Astro preview API, avoiding development-module reloads during hydration.
An additional 80 greeting/arithmetic runs after those fixes complete correctly,
with zero computer startup or connector discovery and three tool schemas. Those
runs shared resources with browser/type-check validation and are recorded as
correctness evidence, not a new controlled latency comparison.

The Postgres selection is reproducible with:

```bash
pnpm test:integration --spec='wakeup.postgres|job-reconciler.postgres|pi-offline.postgres|usage-accounting.postgres|computer-approval.postgres|thread-read-receipts.postgres|history-followup-product.postgres|executor-lifecycle|connections|authorization|attachments|voice|space-membership.postgres|bot-secrets'
```

Native installation/physical-device acceptance, VoiceOver, actual paint latency,
and live-provider quality, reasoning-token and cache measurements were not run.
The concurrently used iOS simulator was left untouched. Electron E2E was not run
on the maintainer's machine, as required by the repository workflow. No deployment
or production release was performed.
