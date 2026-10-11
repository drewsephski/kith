# Tester hardening

## Behavior

Execution status is separate from streamed reply content. An acknowledgement does
not finish a run. Queued, starting, running, reconnecting, approval/input pauses,
completed, failed and cancelled states follow durable run state and actual events.
Tool labels describe operations without exposing arguments or private reasoning.
Group conversations keep each active or paused agent visible. Terminal snapshots
retain results, failure context and a bounded ledger that rejects late activity.

Drafts belong to their conversation. Consumed suggestion identities survive keyed
composer remounts; accepted text cannot return through a retained parent suggestion.
Revision checks preserve newer typing and uncertain-send recovery. Reply settlement
checks the originating scope and reply identity. Stream subscriptions reject wrong
threads, duplicate sequences and stale events before invoking UI side effects.

For you separates **Recommended** from optional **Explore** starters. Recommendations
use exact upcoming calendar events and unfinished saved work; explicit recent intent
and saved preferences help ranking. Chat follow-ups use visible conversation context
and only prefill an editable draft. An empty or failed generation remains empty.

Discovery performs no model call or external mutation. Each request reads at most two
calendar connections, two calendars and one page per connection, with twelve events
per connection over the next 48 hours. Saved work and recent conversation reads are
bounded. Results share a short cache, retain their original retrieval timestamp and
expire after five minutes. Provider reads have a timeout and concurrent discovery
is bounded. Partial calendar failure can retain supported saved-work opportunities.

Cards expose their source, freshness and event date when applicable. Dismissal,
one-day snooze, completion, revocation, expiry and accepted launches suppress cards.
Launch rechecks calendar evidence; rescheduling or cancellation invalidates the old
card. Local source state is locked during atomic acceptance. The server owns the
recommendation revision and operation identity; different client retry identities
recover the same conversation, message, task and run. Retrieved content remains
untrusted data. Discovery and launch never grant permission to send email, edit
calendar events or schedule routines.

Signup displays “At least 8 characters” beside the password field and exposes
Support. Privacy links use the operator's configured `PRIVACY_POLICY_URL` or the
shared Kith privacy destination; Support uses the shared support destination.
Separately operated servers still need their own truthful policy configuration.
Web and Electron share the
web implementation; mobile shares contracts and recommendation/draft behavior with
native controls and localized status copy.

## Setup and proof boundaries

- Apply the `20261010190000_for_you_recommendations` migration before running the
  updated API, then generate the Prisma client through the existing scripts.
- Configure `PRIVACY_POLICY_URL` with the deployment operator's actual policy.
  Configure the existing email delivery or SSO recovery path before public testing.
- Discovery needs authorized, connected calendar accounts or unfinished saved work.
  Gmail-only connections provide optional Explore starters; email/calendar matching
  is not implemented. No inbox-wide discovery scan is performed.
- A configured model and the existing AI-sharing consent gate are still needed to
  execute model-backed work. Offline tests use scripted runtimes and synthetic data.
- Authenticated local browser acceptance proves the real API, database and app path
  with offline providers. It does not prove a deployed provider connection, delivery,
  physical mobile behavior, signing, notarization or native packaged acceptance.
- Repository instructions reserve Electron tests that open native windows for CI.
  Local unit tests, web acceptance, TypeScript/build checks and Expo export do not
  replace that native acceptance.

## Regression coverage

`tester-hardening.spec.ts` exercises the actual authenticated app: a source-grounded
saved-work launch and retry, signup guidance at phone width, and typed/suggestion
drafts through A → B → A navigation, continued work, reload and cancellation.

The shared subscription/reducer tests cover replay, stale hydration, terminal-run
events, reconnect and overlapping work. RunStatus tests cover acknowledgements,
generation fallback, tool activity, approval pauses and card-only completion.
Recommendation tests cover grounding, unsupported detail avoidance, changed events,
revocation, dismissal/snooze, stale evidence, isolation, injection and outages.
PostgreSQL launch regressions prove atomic retries and rollback when disposition or
saved-work state changes between validation and acceptance.

Run `pnpm test`, `pnpm test:integration`, `pnpm check`, `pnpm lint`, `pnpm build` and
the relevant `pnpm test:e2e --spec=...` suites. Keep provider and signed/native release
acceptance separate from these deterministic local checks.

## Local verification, 2026-10-10

- Final focused regressions: 449 tests passed across 15 suites.
- Full offline PostgreSQL integration: all 222 tests in 32 suites passed, including
  the 17 durable launch cases. Each suite used its own freshly migrated database.
- Authenticated browser acceptance: 37 selected cases have passing results. The
  expanded run passed 36 cases; password recovery passed a clean rerun after a
  development reload interrupted its first attempt. Tests use the real app/API and
  disposable database with scripted models, synthetic connections and an email
  emulator. Manual authenticated inspection also covered returning to running work
  and selecting a source-grounded saved-work opportunity.
  After reconciling concurrent shared auth-link changes, all twelve auth/navigation
  and grounded-launch browser cases passed again; 127 auth/route unit tests passed.
  The shared public privacy and support destinations both returned HTTP 200.
- The final broad unit command passed 8,341 tests and skipped 294, with three timing
  failures in deployment scripts, CLI environment loading and favicon streaming.
  All affected suites subsequently passed serially in isolation, with their original
  assertions and timeouts. The broad invocation itself was not green.
- Final type checking passed all 22 tasks. Lint passed with 20 warnings and five
  informational diagnostics. The production build passed all five tasks; final Expo
  iOS export and whitespace checking passed.
- This hardening work performed no production deployment, release publication or merge. Native
  packaged acceptance remains a CI gate under [AGENTS.md](../AGENTS.md). Live model,
  provider delivery, physical mobile and signed update acceptance remain unverified.

This evidence does not establish tester readiness for a deployment lacking verified
privacy/recovery configuration or the required live-provider and native journeys.

Concurrent changes to marketing privacy/support, hosted deployment checks and
release configuration were preserved. Their policy assertions and release behavior
need review by their owner; they are not approvals granted by this hardening work.
