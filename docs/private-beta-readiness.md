# Kith private-beta readiness

Assessment date: 2026-10-13. Reviewed starting main: `080a5b0dbe840bd81922339da2982ff159e56d72`.
This prepares a private-beta candidate. It does not authorize production migrations,
deployment, distribution, store submission, a release tag, or updater publication.

**External testers are not yet cleared.** Application source `fe5db747` passed required
CI: 13 active checks succeeded and eight release/promotion jobs correctly skipped, including
the canonical identity/bootstrap, self-hosted Codex judge, BYOK retry and channel-quota corrections.
Subsequent review found that cloud-agent wakeups lost their originating model budget;
the per-generation root correction passes focused verification below. The exact final-head CI/review result is recorded in
[PR #20](https://github.com/drewsephski/kith/pull/20); passing checks and completed review on
that head are required before the authorized merge.
The candidate still needs an authorized hosted rollout, budgeted real-provider acceptance
and installed signed-device acceptance before inviting 5–10 testers.
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
Managed defaults say Kith pays; self-hosted deployment defaults accurately say the server pays.

Managed execution also rejects host-credential placeholders for Vertex/Bedrock and live Cursor
execution on the shared server. Explicit user-owned provider keys remain supported. Voice
requests use their existing user-owned voice credentials rather than a deployment fallback.

Managed execution rejects the existing Codex subscription-token connection before initiation,
storage and inference. Local/self-hosted Codex OAuth, device-code and refresh infrastructure
remain available. Kith account authentication remains separate from a model connection.
No identity provider or commercial SIWC client was introduced. Self-hosted team-chat decisions
now recognize explicitly configured host authentication for the exact deployment provider/model;
managed or unrelated model selections cannot acquire ambient host credentials. The team-chat judge also
checks the explicit execution mode and secret policy before auth resolution, blocking legacy
plan tokens misfiled under another provider. Three regressions prove the managed rejection
before inference while preserving valid user keys and self-hosted behavior.

The team-chat judge also uses the existing account-scoped live Codex catalog when static
availability excludes a model that the user's self-hosted connection supports. Authentication
is resolved/refreshed before that lookup, matching ordinary execution. Managed hosting still
rejects the provider before loading its secret. Six new deterministic cases cover fresh and
expired OAuth, an absent/unlisted catalog, API-key substitution and managed rejection. Three
strict assertions failed against the previous judge; the corrected judge/catalog/funding suites
passed all 100 tests, workspace lint and all 22 type-check tasks. No live provider was called.

User-funded calls on managed hosting retain their configured provider retry policy. The
quota observer continues to disable hidden SDK retries for deployment-funded or unattributed
calls, so one funded reservation cannot pay for multiple hidden attempts. Two synthetic-wire
regressions send a retryable 503 followed by success: BYOK makes two requests and succeeds;
deployment funding makes one request and records its failure. The BYOK assertion failed
against the previous stream wrapper. All 52 usage/runtime/quota tests passed afterward.

The official [quickstart](https://developers.openai.com/siwc/quickstart),
[open-source token-sharing guidance](https://developers.openai.com/siwc/token-sharing-open-source)
and [SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/) were reviewed.
The current permitted local/user-controlled execution and token-storage boundaries do not
authorize Kith's shared managed server to hold or execute subscription plan tokens.
Commercial approval must be obtained separately before any future managed implementation.
Before managed rollout, inspect and remove any previously stored managed subscription tokens
through the existing credential controls; this work did not modify production credentials.

Stored default credentials now pass scoped secret policy checks before being reported configured
or admitted to new work. Prohibited legacy plan tokens, missing/corrupt secrets and incompatible
authentication direct the user to reconnect. A secret-store outage remains a server failure.
Effective bot/group model selection preserves independently valid user-owned overrides and
partial group execution; scoped email-card readiness checks the card's actual recipient.
Read-only model selection stays strict. Self-hosted Codex execution readiness lets the existing
executor refresh expired OAuth and verify live entitlements before inference; it never overrides
managed secret policy or performs a new inference/refresh just to render readiness.

Send admission now runs after canonical nonce normalization and durable receipt replay, but
before any new send effects. An accepted request can reconcile after credential disconnection
without creating another run or bypassing per-call authorization. The transaction still validates
actionable email cards and edits. Focused API/replay/model suites passed, including fifteen effective
conversation admission regressions and independent replay/email review. Subsequent review
removed a usable-default shortcut: group and email sends now validate their actual pinned
recipients even when the Space default is available. An entirely unavailable group is rejected
before committing a new message; valid recipients and mixed-group execution remain supported.

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
One validated execution-mode resolver now serves model policy and every quota boundary.
Whitespace-padded managed configuration cannot disable default run, computer or tool limits;
invalid modes and managed zero limits fail closed. The correction passed 63 focused tests,
workspace lint and all 22 type-check tasks. CI subsequently passed that correction at `4a30e26c`; later readiness/recovery fixes require a new head.

Operators must also configure provider spending alerts/limits and E2B billing controls.
Self-hosted execution retains its existing configurable behavior.

Daily-quota exhaustion now durably defers an already-due scheduled routine instead of rolling
back its claim and repeatedly re-enqueuing the same wakeup. One-shot intent is retained until
the next UTC allowance reset; recurring schedules choose their next eligible occurrence.
No run, task, firing event, inference or computer is created while admission is exhausted.
Temporary run concurrency is a separate admission path and is not delayed to the next day.
Application-source CI at `fe5db747` passed 8,971 unit tests, 42 PostgreSQL
suites/331 tests and all 11 offline canaries. Six actual PostgreSQL regressions and 101 existing executor tests
passed for this correction, including eight concurrent stale wakeups, queue-publication failure, resumed one-shot intent,
account isolation and invalid-configuration rollback.

Successful direct and managed calendar connections now survive daily-quota exhaustion in
an optional initial briefing. The quota is checked before briefing task/receipt writes;
only the typed quota outcome is skipped, while genuine storage/configuration failures remain
errors. Finalized OAuth tokens and consumed callback state stay durable. Calendar acceptance
is now registered in the supported full PostgreSQL integration command. A controlled real
PostgreSQL ordinary-send/OAuth race exposed a thread/quota lock inversion. Calendar briefings
now lock the owned thread before quota admission; the regression failed before that fix and
passed afterward, with both sends committed. The earlier 42-suite/329-test run preceded this
last lock-order correction; its 27-case calendar rerun passed, and final CI included the race
in the full 42-suite/330-test integration run.

Terminal cloud-agent status, result cards and cleared polling state also commit when quota
blocks an optional local follow-up. The handled generation is consumed without an orphan
task/run or repeated terminal polling; a later user-authorized generation remains eligible.
Focused actual PostgreSQL suites passed 27 calendar and 22 cloud-agent cases, alongside nine
focused deterministic calendar checks. These fixes do not raise spending limits.

Channel fan-out isolates the typed quota-exhaustion outcome to the affected approved
recipient, including matching routine delivery. Later recipients retain their own account,
Space, thread and existing delivery nonce. Replays use the established receipt and do not
enqueue duplicate work; a failed routine does not fall through to an ordinary conversation.
Genuine storage/configuration errors still propagate for provider retry. Four new deterministic
cases cover ordinary/routine quota isolation and genuine failure propagation; both quota
assertions failed against the previous handler. The focused messaging/admission checks,
workspace lint and all 22 type-check tasks passed. No deferred/background sender or new
metering system was introduced.

Cloud-agent launch and reply now atomically persist the current run's root with each
remote generation. Completion wakeups copy that durable root, including after recovery,
so repeated remote generations cannot acquire a fresh hosted allowance. An independently
authorized user task can start its own root. Legacy card origins are backfilled only when
account, Space, bot and thread agree; unattributable managed rows retain their terminal
result without starting an unbudgeted wake. Self-hosted behavior is preserved. Three strict
actual PostgreSQL regressions failed against the previous service/poller; all 38 cloud,
model-quota and schema cases passed with the correction. The scoped legacy backfill also
passed against real rows, including a cross-account card rejection. All 111 migrations
applied to an isolated fresh database. The API/worker startup probe requires the new column;
no production migration was applied. Thirty-two deterministic cloud/quota/preflight tests passed.


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
creation intent. Clients retain unresolved scoped nonces and offer explicit retry. Pending mobile creation
disables Cancel and swipe/back removal until settlement, while authenticated account/Space
changes remain free to navigate. The screen rechecks the operation scope immediately before
redirecting, including the microtask between request settlement and navigation. A successful
create replaces the route exactly once; a failed request restores Cancel/retry without discarding its uncertain nonce. Durable identity
receipts take precedence over late HTTP failures, so an accepted choice never displays a false
save error. Mounted native and real API-backed web regressions cover that lost-response seam.
Delayed web/Electron creation receipts now respect newer Settings, panel and route intent,
including a panel open/close round trip. Accepted receipts still update the roster and clear
the scoped nonce; failed responses preserve the nonce without reopening a superseded panel.
The strict Settings regression failed before the guard and the complete ten-case API-backed
onboarding suite passed afterward. Ordinary messages remain deliverable before setup finishes. Default Kith, existing/manual/imported/
cloned/helper bots retain their established behavior and advanced editing.

Identity mutations now return the accepted server-owned choice, including its persisted custom
name and role, on both initial acceptance and successful no-op replay. Web/Electron and mobile
render that result rather than assuming their submitted identity won; later durable card updates
retain priority. Fourteen actual PostgreSQL onboarding cases passed, including competing
preset/custom requests, changed custom retries and lost-response replay. Both strict browser
response-only regressions failed against the previous card while the server had accepted another
identity. The shared contract/onboarding suite passed 200 tests; full mobile passed 1,042 tests.
The corrected real API/PostgreSQL browser suite passed all thirteen cases, including both
response-only races and the held-bootstrap guard. Workspace lint and all 22 types passed.
This correction changes JavaScript and API contracts, not native dependencies or runtime.
Browser acceptance also exposed an early New tap before the owning bootstrap settled: the
handler safely rejected the missing scope, but the enabled control silently discarded intent.
The trace recorded zero creation requests. A held-bootstrap regression reproduced the enabled
control. Creation now remains disabled until account/Space context is available, and the browser
helper reuses the established shell-readiness wait. Existing assertions remain intact.

Web and Electron use the shared renderer. iOS and Android render the same durable cards with
native controls, keyboard-aware custom input, accessible labels and localized roles.
Simulator inspection also found a pinned-avatar tap dead zone and a thread focus callback
that refetched the roster whenever a refreshed bot object arrived. The focus loop is fixed:
metadata refresh follows real focus/thread/account/Space changes while using current
read/speech callbacks; refreshed roster objects do not restart focus. Mounted lifecycle
regressions cover refocus, read-only threads and stale entitlement responses. Actual simulator
idle traffic fell from 607 reads in 11.69 seconds to three reads in ten seconds, with no
repeated metadata requests. The first pinned patch still failed native avatar taps. The follow-up places the hit shape
inside the native button label and removes duplicate accessibility descendants. Actual
avatar/label taps, long-press preview, Unpin and ordinary-row navigation then passed.

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
The existing Android notification service has a separate authenticated `HttpURLConnection`;
its requests now disable `useCaches` and send the same no-store/no-cache headers. This is a
tracked native source change, so the fresh Android 1.0.10 build must include it. The Android
native CI harness observes actual auth/RPC/SSE request and response policy, requires successful
bearer-authenticated RPC, and retains only counters, never credentials or payloads.
Old binaries' previously stored private cache entries are not asserted erased. An upgraded
installation needs inspection or a clean install before cache privacy can be certified.

## Verification

Only isolated scripted/emulated providers and disposable local databases are authorized here.
Real-provider canaries require their explicit flags, connection/pricing files, isolated accounts
and budgets. Prior live-provider results do not establish new-policy or final-device acceptance.

| Gate | Status | Evidence / limit |
| --- | --- | --- |
| Reviewed starting-main CI | PASSED | Exact starting SHA and CI link above; not candidate proof. |
| Candidate CI / review | PASSED at fe5db747; final-head merge gate required | Canonical-response/bootstrap, judge and retry source passed 13 active checks. The later cloud-root correction passed focused verification; final exact-head checks, bot signals and answered findings are recorded in PR #20 and must be green before merge. |
| Computer routing evaluation | PASSED | 24 fixtures, 11 correct classifications, 13 conservative abstentions, zero false computer demands, zero live calls. |
| Candidate lint / workspace types | PASSED | `pnpm lint` and all 22 `pnpm check` tasks passed locally and on the exact application source in CI. |
| Mobile types / units | PASSED | `pnpm --filter @rakazo/mobile check`; full mobile suite: 112 files, 1,042 tests, including final focus and pending-creation route regressions. |
| Full unit suite | PASSED | `pnpm run test --maxWorkers=2`: full local rerun at `1808e919` passed 700 files and 8,946 tests with 377 gated tests skipped. Application-source CI at `fe5db747` passed 700 files and 8,971 tests with 368 gated tests skipped, including the deterministic calendar checks. |
| PostgreSQL journeys | PASSED | `pnpm test:integration`: application-source CI at `fe5db747`: 42 suites, 331 tests, all 110 forward migrations. Direct activation-cap tests prove eight simultaneous starts admit one, with account isolation and stop recovery. |
| Offline product canary | PASSED | `pnpm test:canary --offline`: 11 journeys, cleanup passed; 18 scripted model calls, no paid provider calls. Conversation, cancellation, persisted memory, source revocation, computer lifecycle and approval recovery passed. |
| Web creation / recovery acceptance | PASSED | Thirteen real API/PostgreSQL Playwright creation/CRUD cases, including three delayed-navigation cases, two canonical-response races and held-bootstrap creation, and two responsive production-card tests; the retained sidebar collapse/drag test also passed. Exact source `fe5db747` passed 322 web tests plus that separate sidebar regression; final-head checks are enforced through PR #20. Shared browser new-account → Kith → task → preset/custom bot → focus → task → reload passed at 375px without overflow. |
| Packaged Electron candidate | PASSED at fe5db747 | Virtual-display packaged acceptance passed at exact application source `fe5db747`, including the final backend and navigation corrections. Routine focus-stealing local Electron E2E is prohibited. Signed macOS installation remains a separate gate. |
| Android candidate native acceptance | PASSED at fe5db747 | Installed emulator onboarding and actual network-policy recording passed at exact application source `fe5db747`, including the final backend corrections. Physical signed-device acceptance remains separate. |
| iOS candidate simulator | PASSED | Final application source at d4df39a6 ran in the fresh 1.0.10 native app, with zero drift across 322 mobile/shared/config files and verified simulator ad-hoc signing. Normal New → Orbit → focus D → scripted task → cold relaunch → saved reply passed. Earlier detailed preset/custom keyboard, interruption, background/cancel and pinned tap/menu journeys passed separately. The canonical-response JavaScript refresh on the existing 1.0.10 native binary also passed preset Miso, custom Clover, focus and full terminate/relaunch persistence. Three runtime source files changed; the new source scan had zero drift. No setup runs were created. Distribution/device proof remains separate. |
| Native disk/network cache privacy | PARTIAL | Final iOS: 1,716 native-origin private requests used no-store/no-cache, no-store responses and zero cookies; NSURLCache had zero private API entries, with one unrelated Expo Observe response. Android installed wire guard passed at d4df39a6. The earlier 4914834 receipt counted 873 private requests, 24 errors and 12 streams with zero policy failures. Voice and Android/old-install disk-cache inspection remain unexecuted. |
| Candidate real Luna / E2B smoke | UNEXECUTED | No implicit provider funds spent. Explicit operator budgets/configuration required. |

Native final-account evidence included six durable runs (five completed, one canceled), zero
tool events and no explicit computer Start/Resume request. A pre-existing fake computer's
reconciled state could not be attributed conclusively from the fixture metadata. This is not
claimed as real-provider allocation proof. Deterministic onboarding and executor/routing checks
establish their own no-provisioning boundary; real Luna/E2B acceptance remains unexecuted.

Local native preparation encountered disk exhaustion. Only inactive, reproducible build
intermediates were removed; source, signing material, app products and application data were
preserved. Checks interrupted by this environment failure must be rerun, not counted as passes.

Failed first attempts remain recorded rather than being counted as passes: integration found
one missing test import, and an early concurrent unit run observed stale/incomplete edits.
The corrected stable complete runs above passed. A resumed broad run also observed an
in-progress receipt fixture and an interrupted shell `printf` in the unchanged egress smoke;
the complete stable rerun passed. The exact base egress scripts were unchanged and their
standalone fixture rerun passed; no firewall assertions or configuration were weakened. The first PR head also passed required
web and packaged Electron acceptance, but Android failed on a missing custom-field test ID.
Its captured hierarchy showed the Name field visible and focused. The next CI head passed
Android and packaged Electron but failed one MCP-settings navigation assertion after 315
web passes. The strict MCP spec also passed with the actual baseline Shell/dependency restored;
the failed trace showed a click during the existing panel-height transition. The spec now waits
for the real animations to finish and retains every navigation/OAuth assertion. The smoke uses
native keyboard Next/Done and keeps the identity/focus/task outcome assertions. Those corrections
passed at `4a30e26c`; the later backend changes also passed Android acceptance at `d3d09f2e`.
These were separate from the native build
storage failure. The later Android job at `c380d671` failed installing the emulator SDK
archive with an invalid ZIP before app installation or Maestro assertions. Its missing
screenshot artifact followed that setup failure; it was not a storage-gallery publication
failure. The later exact application source `ebfec679` passed fresh installed Android acceptance. A local canonical-response rerun also encountered a stopped container runtime and a missing Chromium binary; both were restored before application assertions. The first corrected browser run then exposed the bootstrap gap described above. Its trace recorded zero create requests; the held-bootstrap case failed on the enabled control before the guard, and all thirteen cases passed afterward.
Live model, signed-device and exact-candidate CI evidence remain distinct.

The subsequent judge source `60ed8b32` passed twelve active checks, including web and packaged
Electron, but Android failed installing NDK 27.1.12297006 because the downloaded archive was
not a ZIP. App compilation, installation and Maestro assertions did not run. This is an SDK
setup failure, not an application assertion or screenshot-publication failure. The later BYOK
retry correction requires a fresh full CI/review pass; no native assertion or release guard
was weakened to accommodate the failed download. Fresh installed Android acceptance passed at `fe5db747`.

Independent source review reported 18 passed requirements, no unresolved source failures and
three cross-platform/provider/release requirements awaiting empirical acceptance. It caught and
helped close quota finalization rollback, missed admission sites, judge funding fallback,
mid-run credential revocation, helper root budgets, creation-receipt deletion, stale mobile
nonce cleanup and the installed Vertex SDK's literal ADC sentinel. The native read loop was
also independently covered by the mounted regression. The rebuilt iOS simulator measured
four reads over ten idle seconds on the final UI bundle, with no repeated metadata reads, compared with 607 reads
over 11.69 seconds before the fix. Review does not certify external gates.

## Error and recovery coverage

These are deterministic regression results from the passing unit, mobile, PostgreSQL and
offline-canary suites, not claims that production outages or physical-device flows were exercised.

| Scenario | Status | Verified behavior / remaining gate |
| --- | --- | --- |
| API or database outage | PASSED locally | Readiness fails without changing liveness or exposing errors; unreachable native fetch gets a readable failure; cold web load does not incorrectly sign out. Hosted outage recovery remains unexecuted. |
| Missing entitlement or disconnected BYOK | PASSED locally | Run admission rejects absent model access; revoked secrets cannot fall back to deployment funding; accepted receipt replay remains available after disconnection; each subsequent attempt rechecks credentials and Space membership. Live provider revocation remains unexecuted. |
| OAuth cancellation | PASSED locally | Only the owning account/Space can cancel; cancellation winning finalization prevents storage. Production local/self-hosted provider return flow remains unexecuted; managed plan flow is blocked. |
| Interrupted bot setup | PASSED locally | Lost create/identity responses replay without duplicate effects; early user messages persist; an uncertain mobile creation nonce is reused only on explicit retry. |
| Failed or offline send | PASSED locally | Frozen target, delivery nonce, routine nonces and artifact IDs survive explicit retry; encrypted delivery state restores after restart; newly edited text is retained. Retry/delete/cancel remain user choices. |
| Expired session / Space switch | PASSED locally | Current rejected sessions clear once; stale 401 and snapshot responses cannot mutate the newly selected account/Space. Final-source controlled API-unavailable cold launch showed a truthful error; restoring the API recovered the inbox and encrypted unsent draft with unchanged run count and zero draft delivery. Recovery preceded a Retry tap; no Retry-tap proof is claimed. Physical offline behavior remains unexecuted. |
| Computer quota and cancellation | PASSED locally | Quota admission and existing idle/cancel cleanup regressions pass; offline lifecycle canary cleans up. Live E2B account limits/cleanup need budgeted operator acceptance. |
| Backgrounded task | PASSED locally | Scoped cursor/thread recovery and stale-callback regressions pass. Simulator background/resume, recovered active task, cancellation and a subsequent reply passed; physical OS termination and notification delivery remain unexecuted. |

Required CI passed at application source `fe5db747`, including quota/finalization,
calendar lock-order, delayed-navigation, canonical identity/bootstrap, judge and retry corrections. The
[CI run](https://github.com/drewsephski/kith/actions/runs/38450874167) recorded
13 successful checks and eight correctly skipped release/promotion jobs. The subsequent
cloud-generation root-budget finding is corrected and verified above. Final-head CI/review evidence is
recorded on PR #20 rather than assuming an earlier green run certifies a later commit.
Review threads remain unresolved because resolving them requires separate operator authorization.
The authorized merge must wait for terminal checks/reviews and answers to every actionable root.

Earlier passing runs at `d3d09f2e` and `0ae0b155` remain historical evidence; their later
review findings were corrected above. Earlier failed Android input, web MCP transition and
Android SDK archive attempts remain failures rather than being relabeled as passes.
[Application-source CI screenshots](https://github.com/drewsephski/kith/actions/runs/38450874167/artifacts/11840999479)
include `conversational-bot-identity.png`, `conversational-bot-focus.png`,
`conversational-bot-custom-persisted.png`, `conversational-bot-preserved-settings.png` and the two `conversational-bot-authoritative-*` response-race captures.
Persistent gallery publication is separate from retained screenshots and application acceptance.

## Release and operator gates

| Gate | Status | Required action |
| --- | --- | --- |
| Hosted anonymous session / auth capabilities | PASSED | Read-only check: session returns null normally; password auth and recovery advertised available. |
| Actual hosted readiness | FAILED | Reviewed app and direct API `/ready` return static HTML rather than readiness JSON. Tracked routing correctly forwards readiness JSON; the exact live revision/configuration mismatch is unverified. Verify matching API/worker/gateway revision during authorized rollout. |
| Production migrations / exact revisions | UNEXECUTED | Apply the four forward migrations below through the existing entrypoint only after authorization; API and worker must be compatible. Read-only startup checks cover the new schema. |
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
`20261013160000_model_call_reservations`, `20261013170000_bot_creation_requests` and
`20261013193000_cloud_agent_root_budget`.
Their account/Space constraints and deletion behavior are exercised against PostgreSQL.

Mobile app version/runtime is prepared as **1.0.10**. Fresh **iOS and Android native builds**
are required because the previous 1.0.8 build predates native dependency/patch changes already
on main, and this candidate hardens the existing Android native notification sender. The late native
change correctly failed the earlier prepared 1.0.9 runtime history check. Advancing to 1.0.10
after all native changes restores compatibility without weakening the gate or rewriting history.
Preserve the existing identifiers, `rakazo` scheme, project and channels. EAS remote
versioning owns archive counters. An OTA to an older runtime cannot substitute for those builds.
Desktop remains on the prepared **0.1.7** infrastructure; no stable tag or updater channel changes.

Before inviting testers: authorize and verify hosted rollout,
run a budgeted new-account Luna/BYOK/revocation journey, verify recovery delivery, and complete
installed native/signed desktop acceptance. Document each failure and retry independently.
Configure the existing signup allowlist for the intended tester group and verify effective
provider/E2B spending caps before enrollment. Public release, merging, tagging, deployment
and store submission remain separate operator actions.

## Files affected

The PR diff is the complete inventory, including regression tests and localized catalogs.
The main implementation boundaries are:

- Funding: `packages/adapters/src/deployment-model.ts`, `model-selection.ts`,
  `model-connect.ts`, `pi-catalog-availability.ts`, `pi-oauth.ts`, `pi-runtime.ts`,
  `executor.ts`, `pi-usage.ts`, `auto-review.ts` and `cloud-agent-factory.ts`; API model router,
  team-chat judge and voice; `apps/api/src/model-setup-target.test.ts`, durable send admission
  in `apps/api/src/thread-target.ts`; web/mobile model settings; managed Fly and Compose configuration.
- Budgets: `packages/adapters/src/model-call-quota.ts`, `model-request-size.ts`,
  delegated/scheduled run admission and durable routine deferral, `routine-quota.postgres.test.ts`,
  optional follow-up guards in `calendar-service.ts` and `cloud-agent-poll.ts`, typed recipient isolation in `messaging-inbound.ts`, calendar/cloud
  regression suites and the integration registry; API/worker composition,
  `packages/db/src/execution-quotas.ts`, computer limits, schema/reservation migration, and the cloud-agent generation root migration/service/poller.
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
