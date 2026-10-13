# Kith private-beta readiness

Assessment date: 2026-10-13. Reviewed starting main: `080a5b0dbe840bd81922339da2982ff159e56d72`.
This prepares a private-beta candidate. It does not authorize production migrations,
deployment, distribution, store submission, a release tag, or updater publication.

**External testers are not yet cleared.** The candidate must pass its own checks,
an authorized hosted rollout, and installed native acceptance before inviting 5–10 testers.
Existing credentials are available; remaining signing work is configuration and acceptance,
not a request to obtain another Apple account or application identifier.

## Already implemented

Kith already has authenticated accounts and Spaces, the persistent Kith personal assistant,
durable run execution, encrypted mobile drafts and delivery nonces, stream recovery,
partial-result persistence, memory receipts, connector authorization, approvals, cancellation,
computer-demand routing and 90-second idle suspension. This work preserves those systems.
The previous production report records sampled real-model/E2B acceptance and controlled
performance benchmarks; those results are historical evidence rather than proof of this candidate.

The exact starting main passed [required CI](https://github.com/drewsephski/kith/actions/runs/38364205048),
including web, PostgreSQL, Android native and packaged Linux Electron acceptance.
Its [screenshot publisher](https://github.com/drewsephski/kith/actions/runs/38367402186)
failed at the missing storage credential, after application acceptance passed. Publication
failure is separate from an application failure; neither is silently relabeled green.

## Changes and fixed bugs

### Model access and funding

Deployment funding is bound to the configured provider **and exact model**. Managed Kith
funds only OpenRouter's `openai/gpt-6-luna`. Another selection needs a supported user-owned
connection. The backend preserves explicit selections when credentials are absent and
rejects them before inference; it no longer substitutes the default or recycles a deployment
key after a saved credential disappears. Stored credentials remain account-owned and
selected through authenticated Space preferences.

The same resolution rules cover bot and run pins, groups, routines, retries, helper agents,
fallbacks and model-backed routing. Runtime fallback cannot implicitly acquire an environment
key or change provider to escape authorization. Existing provider usage records remain the
accounting source. Settings identify the provider, connection action and funding source.

Managed execution also rejects host-credential placeholders for Vertex/Bedrock and live Cursor
execution on the shared server. Explicit user-owned provider keys remain supported. Voice
requests use their existing user-owned voice credentials rather than a deployment fallback.

Managed execution rejects the existing Codex subscription-token connection before initiation,
storage and inference. Local/self-hosted Codex OAuth, device-code and refresh infrastructure
remain available. Kith account authentication remains separate from a model connection.
No identity provider or commercial SIWC client was introduced.

The official [quickstart](https://developers.openai.com/siwc/quickstart),
[open-source token-sharing guidance](https://developers.openai.com/siwc/token-sharing-open-source)
and [SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/) were reviewed.
The current permitted local/user-controlled execution and token-storage boundaries do not
authorize Kith's shared managed server to hold or execute subscription plan tokens.
Commercial approval must be obtained separately before any future managed implementation.
Before managed rollout, inspect and remove any previously stored managed subscription tokens
through the existing credential controls; this work did not modify production credentials.

### Hosted spending safeguards

Managed defaults bound daily admitted tasks, concurrent runs, model attempts per user/day
and root task, concurrent model requests, serialized request size, completion tokens,
tool calls and active computers. Durable pre-call reservations complement existing usage
accounting; failed or uncertain calls retain their quota charge. Child work shares its root
task budget. Existing entitlements and account/Space authorization remain authoritative.

The effective managed defaults are 100 admitted tasks/user/day, two simultaneous independent
root tasks, 200 funded model attempts/user/UTC day, 40 attempts/root task and four active
funded provider calls/user. A funded request permits 8 MiB serialized payload, 128 KiB text,
4,096 output tokens including reasoning, and a five-minute provider timeout. Tool calls have
an existing per-turn fuse of 40. Computer limits are three live records/user and one active
remote computer; the established 90-second idle suspension remains intact. User-owned model
calls retain their existing accounting and are not charged to the funded model budget.
Steering and optional call recaps cannot roll back completion, cancellation or hangup when
an admission quota is exhausted.

These controls bound requests; they are not a claim about a provider's final invoice.
Operators must also configure provider spending alerts/limits and E2B billing controls.
Self-hosted execution retains its existing configurable behavior.

### Conversational additional-bot creation

New → Bot immediately creates and opens a durable temporary bot. Its first message asks
“What should my name be, and what's my role?” with Miso / Inbox assistant,
Pippin / Research assistant, Orbit / Planning assistant and Pixel / Coding partner.
Custom exposes explicit Name and Role fields inside the conversation.

The server validates and saves the name, title, description and initial role instructions,
then atomically inserts the existing focus question and A–D options. Identity and focus
cards have explicit stage identifiers. Identity selection cannot consume an unrelated
choice, reconfigure another bot or insert duplicate follow-ups. Existing permissions,
connections and approvals do not change. Setup spends no model tokens and starts no computer.

Durable account/Space creation receipts survive lost replies and cleared history. Concurrent
empty setup attempts coalesce, while an already-started conversation does not hijack a new
creation intent. Clients retain unresolved scoped nonces and offer explicit retry. Ordinary
messages remain deliverable before setup finishes. Default Kith, existing/manual/imported/
cloned/helper bots retain their established behavior and advanced editing.

Web and Electron use the shared renderer. iOS and Android render the same durable cards with
native controls, keyboard-aware custom input, accessible labels and localized roles.
Simulator inspection also found and fixed a pinned-avatar tap dead zone and a thread focus
callback that refetched the roster whenever a refreshed bot object arrived. Metadata refresh
now follows real focus/thread/account/Space changes while using current read/speech callbacks;
refreshed roster objects do not restart focus. Mounted lifecycle regressions cover refocus,
read-only threads and stale entitlement responses. Final native idle-network evidence remains
a separate acceptance gate.

### Targeted mobile reliability

Compared [upstream offline recovery](https://github.com/elie222/rakazo/pull/1334) against
Kith's encrypted drafts, delivery identity and uncertain-send reconciliation. No automatic
background outbox was added: an interrupted send still requires explicit user intent.
One missing guarantee was upload replay identity. Optional scoped upload nonces now reuse
the accepted artifact after a lost response and reject changed payloads or targets.
If the app reloads before an upload completes, text remains recoverable but the user may
need to reattach the file; this does not claim encrypted durable attachment-byte storage.

Compared [upstream native-cache protection](https://github.com/elie222/rakazo/pull/1351)
with the actual Expo networking implementation. Private auth, RPC and voice responses now
carry `Cache-Control: no-store`, including rejection and streaming responses. Native private
requests send real `no-store, no-cache` headers and omit implicit shared cookies while
retaining explicit authentication. Public asset caching is preserved. No cache module or
native dependency was added; a JavaScript `cache` option alone would not prove native safety.
Old binaries' previously stored private cache entries are not asserted erased. An upgraded
installation needs inspection or a clean install before cache privacy can be certified.

## Verification

Only isolated scripted/emulated providers and disposable local databases are authorized here.
Real-provider canaries require their explicit flags, connection/pricing files, isolated accounts
and budgets. Prior live-provider results do not establish new-policy or final-device acceptance.

| Gate | Status | Evidence / limit |
| --- | --- | --- |
| Reviewed starting-main CI | PASSED | Exact starting SHA and CI link above; not candidate proof. |
| Computer routing evaluation | PASSED | 24 fixtures, 11 correct classifications, 13 conservative abstentions, zero false computer demands, zero live calls. |
| Candidate lint / workspace types | PASSED | `pnpm lint` and `pnpm check`; final integration rerun and exact-head CI also required. |
| Mobile types / units | PASSED | `pnpm --filter @rakazo/mobile check`; full mobile suite: 110 files, 1,029 tests. Final native fixes additionally receive focused regressions. |
| Full unit suite | PASSED | `pnpm run test --maxWorkers=2`: 695 files, 8,876 tests; 358 explicitly gated tests skipped. Later narrow fixes have focused checks and require candidate CI. |
| PostgreSQL journeys | PASSED | `pnpm test:integration`: 39 suites, 286 tests, all 110 forward migrations, including scoped creation, replay, quotas, authorization and schema compatibility. |
| Offline product canary | PASSED | `pnpm test:canary --offline`: 11 journeys, cleanup passed; 18 scripted model calls, no paid provider calls. Conversation, cancellation, persisted memory, source revocation, computer lifecycle and approval recovery passed. |
| Web creation / recovery acceptance | PASSED | Seven real API/PostgreSQL Playwright creation/CRUD tests and two responsive production-card tests; the retained sidebar collapse/drag test also passed. Shared browser new-account → Kith → task → preset/custom bot → focus → task → reload passed at 375px without overflow. |
| Packaged Electron candidate | PENDING | Required CI virtual-display job; routine focus-stealing local Electron E2E is prohibited. |
| Android candidate native acceptance | PENDING | Required CI emulator job, including changed onboarding. |
| iOS candidate simulator | PENDING | Current-source native build and isolated scripted journey; export alone is insufficient. |
| Native disk/network cache privacy | UNEXECUTED | Header/JS tests do not establish physical old-cache erasure or native disk inspection. |
| Candidate real Luna / E2B smoke | UNEXECUTED | No implicit provider funds spent. Explicit operator budgets/configuration required. |

Local native preparation encountered disk exhaustion. Only inactive, reproducible build
intermediates were removed; source, signing material, app products and application data were
preserved. Checks interrupted by this environment failure must be rerun, not counted as passes.

Failed first attempts remain recorded rather than being counted as passes: integration found
one missing test import, and an early concurrent unit run observed stale/incomplete edits.
The corrected stable complete runs above passed. These were separate from the native build
storage failure. Live model, signed-device and exact-candidate CI evidence remain distinct.

## Release and operator gates

| Gate | Status | Required action |
| --- | --- | --- |
| Hosted anonymous session / auth capabilities | PASSED | Read-only check: session returns null normally; password auth and recovery advertised available. |
| Actual hosted readiness | FAILED | Reviewed app and direct API `/ready` return static HTML rather than readiness JSON. Verify matching API/worker/gateway revision during authorized rollout. |
| Production migrations / exact revisions | UNEXECUTED | Apply the three forward migrations below through the existing entrypoint only after authorization; API and worker must be compatible. Read-only startup checks cover the new schema. |
| Password recovery delivery | UNEXECUTED | SMTP configuration exists; dedicated mailbox reset, old-session invalidation and new sign-in still need proof. |
| Hosted effective funding / quotas | UNEXECUTED | Verify managed mode, exact Luna default, entitlements and finite effective limits after authorized rollout. |
| Signing credential availability | PRESENT | Metadata confirms existing local Developer ID and authenticated existing EAS/ASC configuration; no secret values inspected or published. |
| Desktop workflow credential wiring | FAILED | Required signing secret names and protected `desktop-release` environment still need operator configuration. |
| Signed macOS DMG / notarization / updater | UNEXECUTED | Build exact candidate with existing credentials after authorization; inspect installation, stapling, Gatekeeper and signed update compatibility. Existing unsigned artifacts are not distributable. |
| iOS signed internal / TestFlight candidate | UNEXECUTED | Existing project/application only; verify archive, share extension, account deletion/recovery, permissions, background/resume and model funding. Separate approval for distribution/submission. |
| Android signed internal candidate | UNEXECUTED | Existing application identifier/project; green emulator CI is not installed device proof. |
| Privacy/support metadata and payment policy | PARTIAL | Public pages respond; existing ASC metadata and final native review notes still require operator inspection. No new external-payment UI added. |
| Notifications / OAuth / share extension on devices | UNEXECUTED | Physical permission, return-link, delivery and cross-device acceptance remain separate. |

The new forward migrations are `20261013110000_artifact_client_nonce`,
`20261013160000_model_call_reservations` and `20261013170000_bot_creation_requests`.
Their account/Space constraints and deletion behavior are exercised against PostgreSQL.

Mobile app version/runtime is prepared as **1.0.9**. Fresh **iOS and Android native builds**
are required because the previous 1.0.8 build predates native dependency/patch changes already
on main. Preserve the existing identifiers, `rakazo` scheme, project and channels. EAS remote
versioning owns archive counters. An OTA to an older runtime cannot substitute for those builds.
Desktop remains on the prepared **0.1.7** infrastructure; no stable tag or updater channel changes.

Before inviting testers: complete exact-candidate CI/review, authorize and verify hosted rollout,
run a budgeted new-account Luna/BYOK/revocation journey, verify recovery delivery, and complete
installed native/signed desktop acceptance. Document each failure and retry independently.
Public release, merging, tagging, deployment and store submission remain separate operator actions.

## Files affected

The PR diff is the complete inventory, including regression tests and localized catalogs.
The main implementation boundaries are:

- Funding: `packages/adapters/src/deployment-model.ts`, `model-selection.ts`,
  `model-connect.ts`, `pi-catalog-availability.ts`, `pi-oauth.ts`, `pi-runtime.ts`,
  `executor.ts`, `auto-review.ts` and `cloud-agent-factory.ts`; API model router,
  team-chat judge and voice; web/mobile model settings; managed Fly and Compose configuration.
- Budgets: `packages/adapters/src/model-call-quota.ts`, `model-request-size.ts`,
  delegated/scheduled run admission call sites, API/worker composition,
  `packages/db/src/execution-quotas.ts`, computer limits, schema and reservation migration.
- Onboarding: `apps/api/src/onboarding.ts`, shared choice/RPC/event contracts,
  `packages/core/src/onboarding-focus.ts`, `bot-creation-attempt.ts`, database repository,
  scoped creation migration, `apps/web/src/pages/Shell.tsx`, shared identity/message cards,
  `apps/mobile/app/new.tsx`, `thread.tsx`, identity cards and scoped client creation helpers.
- Mobile reliability: `apps/api/src/private-response-cache.ts`,
  `apps/mobile/lib/private-api-fetch.ts`, auth/RPC/voice callers, artifact contracts,
  `apps/api/src/artifacts.ts`, upload replay migration, native inbox menu and thread focus lifecycle.
- Release and acceptance: `apps/mobile/app.json`, `docs/mobile-release.md`, this report,
  web Playwright specs/fixtures, Android Maestro flows, iOS screenshot flows and
  `apps/desktop/e2e/frontend.acceptance.ts`.

Each domain has focused deterministic regressions. API and worker use the same read-only
schema preflight in `packages/db/src/schema-preflight.ts`.
