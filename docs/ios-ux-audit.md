# Kith iOS implementation and verification

This record distinguishes code and deterministic test evidence from native acceptance.
Production release remains blocked until the native journeys listed below pass.

## Confirmed findings and corrections

| Severity | Reproduction and code evidence | Correction |
| --- | --- | --- |
| P0 | Open `thread.tsx` with an initial snapshot failure: the subscription closure retained its original null snapshot and rejected subsequent tagged events. | `lib/thread-subscription.ts` reacquires an authoritative snapshot before every stream, establishes identity, advances cursors monotonically, rejects foreign/replayed events, and aborts scoped work. History windows retain their cursor. |
| P0 | Leave a conversation or restart with unfinished composer text: component state was the only draft owner. A failed send also settled the composer. | Encrypted `conversation-drafts.ts` storage and `use-conversation-draft.ts` scope drafts by endpoint, account, Space and conversation, flush on background/navigation, fence late hydration, and wipe on sign-out. Successful delivery clears only its matching composer. Temporary attachment handles are not restored. |
| P0 | Restart after a lost send response: a fresh nonce could duplicate accepted work. | Persist validated delivery input with its durable nonce before dispatch. Restore uncertain deliveries as explicit retry actions; reuse the exact request. New edits get their own identity. No work is sent on restoration. |
| P0 | Fail home search, For You context, account data or group membership loading: failures appeared as empty results or missing controls. | Explicit loading/error/retry states and scoped response guards; partial successful For You/account data survives a sibling failure. Artifact refresh errors retain available results with Retry. |
| P1 | Fresh launch went directly to authentication; the old screenshot onboarding flow signed into a fixture and manually created a bot. | Dedicated resumable three-scene introduction, Skip and existing-user Sign in. Screenshot flow exercises fresh Keychain state, interrupted intro and first-assistant provisioning. |
| P1 | Native capture of the initial intro design clipped Continue and moved Sign in below the fold on later scenes. | Keep actions and pagination outside the scrolling scene, and reduce illustration size on dense scenes. Compact/large-text content can scroll while controls stay available. |
| P1 | Change Dynamic Type while the introduction is visible: text can enlarge inside stale native layout bounds. | Remount the introduction's native layout when the font scale changes, preserving the current scene and encrypted progress. |
| P1 | A newly authenticated empty account reached an empty inbox. | Shared authenticated `assistant.ensure` provisions Kith with durable spawn identity, preserving existing assistants. Home awaits the real focus card and opens the real conversation. Concurrent requests and lost responses reuse one assistant. |
| P1 | Home registration could request notification permission before the purpose was apparent. | Silent registration only for previously granted permission. Account uses native Enable/Open system settings controls, OS-derived status and foreground refresh. Denial does not block conversation. |
| P1 | For You hid verified active/recent work. | Show Needs your attention, Working on and Recent work from authoritative run records, with recorded bot/group/message destinations. Refresh on focus/foreground; preserve grounded recommendations and durable launches. |
| P2 | Incoming share-sheet text/files had no reviewed conversation handoff. | Enable the existing Expo share extension; validate raw URLs and app-group file locations including encoded path separators, bound file sizes/count, select an authenticated conversation, and insert a reviewable draft. Explicit Send is still required. |

## Preserved and superseded assumptions

- Shared run projections already prevent settled work from being resurrected by late events. Existing mobile thread feedback, stream reducers and approval controls remain authoritative; no simulated run or completion has been added.
- For You discovery already validates connected accounts, source fingerprints, dismissals and launch identity. It can correctly return zero recommendations. Generic task suggestions remain available without claiming connected services.
- Existing `onboarding/start` deliberately creates no activity; `promptFocus` and `chooseFocus` provide real idempotent cards. Automatic assistant preparation reuses these endpoints rather than fabricating a greeting or starting work.
- Model readiness is backend-derived. A missing model exposes the native model-connection action in context; no model key or hosted integration is required by the introduction.
- Notification cold-start routing, group destinations and auth restoration already existed. Added account/Space fencing around delayed resolution.
- Custom server probing, integration authorization, native image sharing, sandboxed artifact HTML, computer lease ownership and recovery already have real implementations and deterministic tests. Their existence does not establish physical-device acceptance.

## Route review

| Routes | Behavior inspected / delivered | Remaining native checks |
| --- | --- | --- |
| `_layout`, `index`, `intro`, `sign-in`, `server` | Auth/deep-link entry, returning-user bypass, resumed intro, backend probe, home loading/search errors and retry, scoped assistant provisioning. Native sign-up and first assistant passed with an isolated backend. Existing SSO/password-recovery behavior retained. | SSO cancel/return, unavailable server, expired session. |
| `thread`, `group-thread` | Live snapshot/reconnect, foreground refresh, per-conversation drafts, success-only clearing, uncertain delivery retry, mentions/replies, real model readiness, approvals and recorded message navigation. Native send/result and draft restoration after process termination passed. | Offline/reconnect during a run, background delivery, VoiceOver approval/result return, keyboard with large text. |
| `new`, `new-group`, `new-space`, `bot-settings`, `group-settings`, `routine` | Scoped initial reads/mutations, membership loading and retry, disabled unsafe edits, native group fields and keyboard insets. Existing model/voice/routine controls retained. | Group creation/edit, routine edit, Space changes during pending mutations, actual unavailable/revoked provider. |
| `for-you` | Verified attention/active/recent work, authenticated connected accounts, partial failure/retry, grounded discovery and idempotent task launches. | Native launch, approval and artifact return in multiple Spaces. |
| `artifacts`, `artifact`, `image` | List/search/page failure handling, scoped reads, preserved results on refresh failure, detail Retry, existing preview/share/delete and full-screen orientation recovery. | Native Photos/Files export, unsupported files, large image and version picker accessibility. |
| `computer` | Existing refresh controller, scoped lease actions, foreground-only heartbeat, explicit takeover, bounded boot recovery, orientation cleanup. | Physical-device reconnect, background ownership, keyboard/landscape. |
| Settings: `account`, `archived-bots`, `models`, `integrations`, `integration-setup`, `voice`, `change-password`, `ai-data-sharing` | Partial account loading/retry and preserved archived control; contextual notification settings; integration setup retry. Existing settings, integration scope/cache, backend-confirmed authorization, secret storage and optional provider boundaries retained. | Denied/granted permission and Settings return, provider authorization cancellation, VoiceOver, large text and long content. |
| `share-in`, `+native-intent` | Raw payload review, authenticated scope, app-group path/type/size validation, no automatic send, cancellation and signed-out handling. | Safari/Photos/Files extension entry, competing shares, signed app-group access, malformed/large files. |

The phone implementation preserves flexible widths and safe areas. It makes no new
iPad readiness claim; tablet navigation and rotation require a separate review.

## Introduction design

Use the existing canonical blue companion asset, semantic monochrome surfaces and
native action controls. Each scene changes companion placement and context:
“Meet Kith.”, “Hand off the work.” and “Pick up where you left off.” Demonstration
rows are labeled “Examples” so they cannot be confused with connected accounts or
running work. The short fade stops in the background; Reduce Motion uses static
frames. The content scrolls on compact displays and large text. Native buttons,
accessible companion name, scene headings and progress labels provide navigation.
Completion and scene progress are local encrypted preferences, independent of auth,
and authenticated returning users bypass the intro.

New copy explains an otherwise invisible decision only where needed: “Examples”
identifies illustrative work; “Connect a model to give Kith work.” appears when the
backend reports missing configuration; notification purpose appears with opt-in;
draft/import errors appear only on failure. No persistent onboarding instructions
were added to the ordinary conversation.

## Verification record

Results are updated after final validation. Tests use disposable offline fixtures;
no provider credentials, production data, deployment or publication is part of this work.

- Mobile suite: 106 files and 987 tests passed, including draft restart/nonce recovery,
  initial snapshot failure/replay, permission denial/silent registration, stale
  notification routing, share validation and partial For You failure/retry.
  This includes three encoded traversal/control-character cases. A focused
  39-test run covering sharing, delivery identity and translations also passed.
- Mobile/API/shared-contract/testkit type checks: passed, including the final mobile
  recheck after scoped assistant retry refinements.
- Lint: repository check and changed-source check passed with existing warnings.
- iOS Expo export, configuration and dependency check: passed, including the new
  incoming-share native configuration. Final export produced the iOS Hermes bundle.
- iOS prebuild and CocoaPods installation: passed. Release build and launch passed;
  simulator ad-hoc signing is needed to exercise SecureStore. Unsigned installation
  showed a storage error; proper simulator signing restored persistence. Native
  interrupted intro resumed scene two after process termination. Final layout
  rebuild passed, including the share extension.
- Native iPhone simulator with an isolated PostgreSQL/backend fixture: sign-up,
  automatic first assistant, focus selection, explicit task send, streamed scripted
  result, authenticated relaunch and unfinished draft restoration passed. This
  exercises real orchestration/storage with the offline scripted runtime; it does
  not demonstrate a live model performing a useful task. No notification prompt
  interrupted this journey. Native captures are in `test-report/ios-ux` (ignored).
- Compact 375px iPhone: light/dark intro captures, Reduce Motion enabled, and live
  Dynamic Type changes through the accessibility-extra-large category exercised.
  Large content scrolls to its end while Continue/Sign in remain available. Native
  process termination/resumption also passed on the rebuilt intro.
- PostgreSQL: 17 For You durable launch, 3 assistant provisioning and 2 thread read
  receipt tests passed in isolated databases with no external providers.
- Full repository unit suite: completed with 8,401 passed, 6 failed, 296 skipped,
  and one web worker startup timeout. Isolated reruns passed every failing file:
  deployment smoke/script, secret-loader, desktop-runtime, text rendering and
  computer reuse (52 passed, 2 skipped). Screenshot catalog and the web recording
  worker also passed separately (7 tests). Timing failures coincided with concurrent
  native compilation; the original full run remains red.
- Native automation: T3 device access is disabled; using available Xcode simulator tools.
- Maestro is absent from this environment. Updated first-run/smoke/screenshot flows
  remain unexecuted; the screenshot catalog remains local rather than ordinary PR CI.

## Native captures

Local, ignored evidence is in `test-report/ios-ux`:

- `01-intro-light.jpg`, `02-intro-light.jpg`, `03-intro-light.jpg`: the three compact
  introduction scenes.
- `04-first-task-light.jpg`: actual conversation/run delivery against the scripted
  offline fixture, with its recorded result.
- `05-restored-draft-light.jpg`: the same result and unfinished draft after process
  termination and authenticated relaunch.
- `06-intro-dark-large-text.jpg`: live Dynamic Type reflow and scrolling to the end.
- `07-intro-dark-reduced-motion.jpg`: dark intro with Reduce Motion enabled in Settings.

These are simulator acceptance artifacts, not ordinary PR CI screenshots or signed
physical-device evidence. Keep them local; publish sanitized CI captures with a UI PR.

## Release gates

Native screenshots and an ad-hoc signed simulator build cannot prove a signed release.
Require the updated Maestro journeys, a useful task with a configured live model,
native failed-send retry and account/Space transitions, foreground/offline recovery,
SSO/integration cancellation, push delivery and
permission return, VoiceOver/Reduce Motion/large-text checks, and share extension
acceptance on a signed physical device. The Expo incoming-share implementation is
experimental ([Expo Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/));
validate its app-group entitlement and Apple distribution acceptance
before enabling a production release. Retained deep-link scheme and application
identity avoid breaking existing links. No deployment or app publication occurred.
