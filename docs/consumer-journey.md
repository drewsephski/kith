# Kith consumer journey

Implementation and local verification record, 2026-10-09. Started from `main` at
`b0b38040`. No release, deployment, DNS change, secret rotation, push or merge is part
of this work.

## Journey

Previously, the homepage foregrounded agent ownership and self-hosting, first-run
setup foregrounded model configuration, and the assistant welcome showed a static
list of tasks. Returning work and verified outcomes required more exploration.

The homepage now introduces one personal assistant and offers Web and Desktop in
the first viewport. Web goes to the independently configured application `/start`:
signed-out visitors enter signup; signed-in visitors resume the existing assistant
or required model setup. The workspace offers four optional focus choices and an
optional assistant name. A working deployment model skips model setup entirely.
Typing freely remains available.

“Organize my day” offers the existing Calendar connection. Managed accounts are
reused; OAuth and private-context AI consent stay explicit. Authorized connection
uses the existing durable, read-only briefing pipeline, with verified events,
coverage, conflicts, suggestions and an inspectable receipt. Missing access or
events remain accurate partial/unavailable outcomes. Email focus offers the
existing Gmail source picker and task starter; research and chatting begin with a
simple conversation prompt.

Returning Web/Desktop users see a short “For you” list of their persisted work,
ordered by attention, active work, failures and completion. Each item opens its
conversation. Connected accounts determine available suggestions; additional
starters are under “More tasks.” Memory, connections and settings retain their
existing authoritative surfaces.

Completed email searches, inbox to-dos and meeting preparation can become routines
after explicit confirmation of frequency, time, timezone and sources. No suggestion
alone schedules work. Existing approved analytics publishing retains its destination
and approval behavior. The existing worker executes schedules and records history;
revoked or unavailable sources are revalidated.

Desktop has an honest release-status/source-build page. There were no published
fork release assets at verification time. A correctly configured future hosted build
already bypasses manual server selection through the existing bundled service URL;
saved local/remote configuration still takes precedence.

## Boundaries and files

| Boundary | Main changes |
| --- | --- |
| `apps/www` | Existing Astro homepage, header, platform dialog and demo; new localized `/start` and `/download`; `public-config.mjs`, `site.ts`, Astro/middleware/Vercel canonical routing, sitemap/robots/social metadata; honest fork support/legal attribution. |
| `apps/web` | `/start` handoff in `App.tsx`; auth/onboarding identity and required-model retry; `assistant-focus`, `focus-next-action`, `assistant-for-you` and contextual welcome; shared receipt header and `RepeatTask`; empty welcome scrolling and stale navigation-response guards in `Shell.tsx`; Lingui catalogs. |
| `apps/api` | Existing onboarding thread operations now atomically persist focus and one relevant optional app card, preserving thread locks, actor checks and first-assistant spawn safeguards. |
| Shared core/contracts/adapters | Focus identifiers and legacy-question compatibility; durable highlight ranking; safe repeat plans; additive optional receipt repeat metadata; task-starter trigger contract alignment; existing authorized scheduling/worker path supports read-only starters. |
| `apps/mobile` | Same focus meanings and authoritative choice operations; native Calendar/task source controls and explicit read-only routine confirmation; existing Tasks/Memory/Connections remain the native contexts. |
| `apps/desktop` and release workflow | Fork publishing/feed checks and documentation only. Application/storage identity, saved config, hosted/local/remote setup, session partitions and Quick Ask are retained. |
| `packages/ui-tokens` | Functional primary/link/ring/selection tokens use ink in light and dark appearances. Companion identity remains blue. Generated CSS and relevant expectations updated. |

No database migration, replacement framework, second Calendar engine, receipt store,
memory store, permissions system, mandatory hosted vendor or frontend secret was added.
The existing Vercel-to-Fly authenticated API/RPC proxy was not replaced.

Focus persists in the existing thread choice, rather than a second browser-only
onboarding record. Its answer and optional connection card commit together so a
lost notification/response is safe to retry. Creating a conversation invalidates
older navigation responses so stale lists cannot undo the new route. Empty welcome
screens start at the top; streaming conversations retain existing tail-following.

## Verification

- Workspace `pnpm check`: 22 of 22 tasks passed. Astro reported zero errors and
  warnings, with one existing deprecated-Zod hint. Subsequent Web checks passed
  after navigation and welcome-scroll fixes.
- `pnpm lint`: zero errors, 19 existing warnings and four informational diagnostics.
- Astro production build with explicit sample marketing/app origins: 34 pages built.
  Local unconfigured builds were also checked; they do not invent a hosted service.
- Web production build passed. The existing large-chunk warning remains; this is not
  a claim of production performance measurement.
- Desktop TypeScript/static build passed; no real Electron windows were opened.
- Lingui catalogs compiled. New journey copy is translated in supported marketing,
  Web and native locale resources; legacy untranslated catalog entries remain.
- Database-backed offline Calendar and task-starter tests: 35 passed across two
  suites using temporary PostgreSQL. They cover briefing recovery/deduplication,
  focus concurrency/lost response, confirmed read-only routine idempotency, worker
  execution, isolation and revoked connections.
- Web offline integration browser matrix: 27 passed. After the finish-review scroll
  correction, all six affected consumer/task/memory browser scenarios passed again.
  Four consumer/memory scenarios passed after the final assistant-name correction,
  including saved custom-name labels across reload and a second tab.
  Coverage includes safe auth handoff, concurrent tabs/reloads, required/missing
  models, auth recovery, optional/reused Calendar, source-backed receipts, persistent
  work, drafts, memory edits/deletion, explicit task sources and routine confirmation.
- Existing marketing screenshot workflow passed. Headless inspection confirmed both
  platform choices above the fold at 1440×900 and 375×812, loaded images, no horizontal
  overflow, working illustrative demo input, mobile menu dismissal and honest downloads.
- Every newly introduced Web message has a translation in all ten supported
  catalogs; the compile step passed. This does not claim legacy catalogs are complete.
- Final focused configuration/onboarding/highlight/repeat conformance check: 33
  tests passed across five suites. Public URL validation uses no Node-only import
  in marketing middleware and rejects canonicalized IPv4 and IPv6 literals.
- Full `pnpm exec vitest run --maxWorkers=2`: 8,029 passed, 17 failed and 271 skipped
  (8,317 tests); 634 passed, eight failed and 41 skipped test files; 358.63 seconds.
  New configuration, focus, highlights, repeat-plan and changed UI/localization
  tests passed. Remaining failures are listed below; the full suite is not green.
- Impeccable finish reviewer scored all three listed fixes resolved, with `ship`
  at that verdict scope. Desktop/narrow returning captures prove the corrected
  companion composition. Web and marketing design records describe shipped tokens.

### Remaining unit-suite failures

These test files and their failing fixture surfaces were not changed by this work,
apart from `Shell.tsx` where the tested toolbar markup was already inconsistent with
the static expectation at the starting commit. The same failures reproduced in
focused/serial checks; one Linux launcher timing case passed in the final run.

| Test family | Failed tests | Cause observed |
| --- | ---: | --- |
| Mobile computer screen | 6 | Existing React Native mock lacks `AppState`/focused-navigation behavior; suspended-wake case times out. |
| Account settings | 5 | Existing appearance mock lacks `subscribeUiAppearance`. |
| Voice settings | 1 | Existing UI mock lacks `SelectField`. |
| Adapter tool index | 1 | Static built-in tool expectation omits the existing `request_app_connection` tool. |
| Linux desktop and supervisor focus | 2 | Platform/launcher fixture command and timing expectations. |
| Web desktop toolbar | 1 | Static class-string regex does not match existing header markup. |
| Compose installer smoke | 1 | Smoke command exceeds its 30-second test limit in this environment. |

No green full-suite claim is made. These fixture/platform failures remain separate
from the passed offline database and browser journey checks.

Browser screenshots use synthetic isolated accounts and source fixtures, or persisted
scripted test runs. They are not proof of live OAuth, a production model or customer data.
The collaborative preview explicitly reported unavailable; the existing headless
Playwright workflow provided the browser evidence.

The existing screenshot workflow publishes the marketing and Web gallery in CI.
Local inspected captures cover desktop/narrow landing, release status, default and
personalized first run, returning work, Calendar onboarding/receipt, memory and
read-only routine confirmation. They are generated artifacts, not tracked customer data.

## Scope remaining

- Native mobile retains its existing Tasks screen rather than gaining the new Web
  “For you” strip. Focus and repeat behavior use shared authoritative contracts and
  native controls, but new native visuals and physical-device behavior are unverified.
- One-click repeat is available for the supported completed task starters. Calendar
  briefing-to-routine conversion was not added; existing routine editing is retained.
- Highlights show current/recent persisted runs. A separate future-briefing prediction
  or inferred-memory influence view was not invented. Existing receipt memory revision
  references remain available where the pipeline actually supplies them.
- Electron upgrade/signature behavior, real Quick Ask windows, physical mobile keyboards,
  live production performance and public-service activation require their real environments.
- Operator privacy/terms/support policies are required before offering a public hosted
  service; upstream legal identity and support addresses are not presented as the fork's.

## Deployment and release prerequisites

Follow [hosted deployment](hosted-deployment.md) and [Desktop releases](desktop-release.md).

1. Choose actual marketing and application origins. Provision independent Astro and
   Web hosting projects and attach DNS only after operator approval.
2. Configure marketing `PUBLIC_SITE_URL` and `PUBLIC_APP_URL` as distinct public HTTPS
   origins. Deployment builds reject missing/unsafe configuration. Leave each optional
   `PUBLIC_DESKTOP_*_URL` unset until its exact published asset is verified.
3. Provision the existing persistent Fly API/worker, PostgreSQL and data volume. Preserve
   server-only auth/encryption/proxy secrets and the separate screen gateway. Configure
   registration/owner bootstrap and a real deployment model or user model connections.
4. Register OAuth allowed origins and exact provider callback URIs on the application
   origin, including existing auth, Calendar, integration, SSO and MCP paths. Complete
   any provider scope review; end-user account and AI-sharing consent still apply.
5. Set the existing public Desktop `RAKAZO_SERVICE_URL` to the verified application
   origin. Supply signing/notarization credentials and release permissions, then publish
   complete installers and compatible update feeds. Older upstream builds retain their
   embedded upstream feed; they are not silently migrated.
6. Verify a real model reply, authorized Calendar first result, revoked-source handling,
   closed-browser worker execution and signed upgrade/session retention before launch.

No successful local build establishes that DNS, hosted providers, OAuth consent,
signed installers or a production release are available.
