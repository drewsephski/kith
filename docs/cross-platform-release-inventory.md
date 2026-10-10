# Cross-platform release failure inventory

Baseline inspected before implementation: `0759b648403a0a67d2031f00756ac939b56f45da` (local and remote main), 2026-10-10.

## Current failures

| Run / job / step | Log evidence | Confirmed mechanism | Impact / remaining investigation |
| --- | --- | --- | --- |
| [Main CI 38051630314](https://github.com/drewsephski/kith/actions/runs/38051630314), Production builds, Packaged Electron acceptance (job 114211771906, step 11) | `Expected: true; Received: false; Timeout 5000ms`; packaged.spec.ts:142 | Packaged app launches; native minimized state never observed after renderer IPC. | Blocks build, deployment and OTA dependencies. Bare Xvfb has no provisioned WM; WM semantics, window identity and event ordering require reproduction. |
| [PR CI 38051614013](https://github.com/drewsephski/kith/actions/runs/38051614013), Production builds, same step (job 114211725608) | Same assertion and timestamp | Same Linux symptom. | Same gate; not the old SUID error. |
| Main CI, Web E2E / Web E2E (job 114211771997), Run Playwright tests | `Running 287 tests using 2 workers`; 17 recorded failures; `The operation was canceled` after approximately 20 minutes | Multiple real assertion failures precede job cancellation. | Incomplete suite; every failure below requires reproduction. Timing aligns with configured 20-minute job limit; no superseding main run existed. Cancellation must not hide test failures. |
| [Publisher 38034800664](https://github.com/drewsephski/kith/actions/runs/38034800664), publish, Read Playwright job result | `Unexpected Playwright job conclusion: cancelled` | Result switch rejects upstream cancelled job. | Spurious publisher failure before artifact/storage processing; upstream PR Web E2E ended at 20-minute limit. |
| [Publisher 38034799438](https://github.com/drewsephski/kith/actions/runs/38034799438), same step | Same upstream cancelled conclusion | Same state handling defect on main. | Cannot infer upload failure; older tests also failed before cancellation. |

Latest main Web E2E recorded failures (exact test paths and names):

- 1) [chromium] › e2e/bot-crud.spec.ts:11:1 › bot creation, editing, and deletion persist
- 2) [chromium] › e2e/chat-polish.spec.ts:12:3 › chat selection, keyboard tabs, and narrow layout with motion no-preference
- 3) [chromium] › e2e/computer-workspace.spec.ts:33:1 › the computer workspace browses, uploads, and downloads files over the screen
- 4) [chromium] › e2e/chat-polish.spec.ts:12:3 › chat selection, keyboard tabs, and narrow layout with motion reduce
- 5) [chromium] › e2e/disclosure-controls.spec.ts:5:3 › shared disclosures and selects support keyboard and no-preference motion
- 6) [chromium] › e2e/for-you-page.spec.ts:66:1 › the authenticated For you route sends a prompt in a new chat and survives refresh
- 7) [chromium] › e2e/for-you-page.spec.ts:208:1 › an uncertain authenticated launch survives reload without another conversation or prompt
- 8) [chromium] › e2e/golden.spec.ts:57:1 › takeover, routine, plugins, and export are reachable
- 9) [chromium] › e2e/group-chats.spec.ts:15:1 › create group from + and see two bots in one transcript
- 10) [chromium] › e2e/mcp-approval-card.spec.ts:4:1 › keeps the approved MCP card state after the thread remounts
- 11) [chromium] › e2e/load-failure.spec.ts:4:1 › a failed overlay chunk keeps the shell and the draft, and Refresh loads it
- 12) [chromium] › e2e/message-hover-actions.spec.ts:69:1 › message hover shows beside-bubble actions; reply links to parent
- 13) [chromium] › e2e/message-hover-actions.spec.ts:384:1 › hover time shows the date for a message from an earlier day
- 14) [chromium] › e2e/message-hover-actions.spec.ts:484:3 › touch message actions › More exposes actions without simulated hover
- 15) [chromium] › e2e/model-picker-search.spec.ts:4:1 › model dropdown search and provider group headers
- 16) [chromium] › e2e/new-bot-ux.spec.ts:12:1 › create opens form, then empty chat; picker lists bots; sidebar collapses
- 17) [chromium] › e2e/new-bot-ux.spec.ts:121:1 › later bot waits before showing the focus card; sending cancels it

Latest main and PR publishers also failed at the same cancelled-result switch: [38052902406](https://github.com/drewsephski/kith/actions/runs/38052902406) and [38052879797](https://github.com/drewsephski/kith/actions/runs/38052879797). Neither reached artifact publication. The PR Web E2E job 114211725845 recorded 21 failures before cancellation at its 20-minute limit. In addition to shared main failures, it exposed connections-panel (complete catalog), peer-messages (peer chips), resizable-side-panel (desktop resize and phone menus), and routine-crud (editing and model selection). These remain part of the full-suite acceptance; none are excluded.

## Historical failures / preserved fixes

- [CI 38033623608](https://github.com/drewsephski/kith/actions/runs/38033623608): packaged second-instance launch rejected unsafe chrome-sandbox permissions. Current workflow configures root:root / 4755 and gets past launch. Preserve sandboxing and verify actual helper permissions.
- [macOS 38033623372](https://github.com/drewsephski/kith/actions/runs/38033623372): immediate minimize assertion failed; missing screenshot upload then failed because prior test failure prevented capture. [Current macOS 38051630027](https://github.com/drewsephski/kith/actions/runs/38051630027) passed packaged acceptance and capture.
- [Nightly 38038579429](https://github.com/drewsephski/kith/actions/runs/38038579429): Daily web screenshots / Web E2E cancelled; timing/root cause remains to inspect. Not counted as successful verification.
- Older main Web E2E recorded 25 failures before cancellation. Compare all older cases with final full-suite results, including routines, settings shell, sidebar filenames, peers, and resizable panels.

## Production and release gaps

- Vercel production alias is READY at baseline SHA; Fly `kith-api` has one running Machine on persistent storage. Latest backend release predates frontend; internal health revision is null, so running source SHA is unproven. GHCR publication does not prove Fly rollout.
- PRODUCTION_DEPLOY_ENABLED is absent. Legacy SSH deployment is not enabled and points to an obsolete product origin. Repository and Production environment Actions secret-name lists are empty; existing environments have no approval rules.
- Image workflow currently publishes mutable edge independently of CI; a failed source can move a consumer tag.
- Hosted capabilities: passwordAuth=true, passwordReset=false. Fly secret-name inventory contains neither SMTP_URL nor EMAIL_FROM; no delivery test is possible yet.
- No desktop public release or release workflow run exists. Signing credentials and protected desktop-release environment are unavailable. Do not dispatch a publishing workflow or create a tag.
- Mobile screenshot workflow is manual only. Maestro uses obsolete Rakazo headings and older navigation. Native build/runtime results are unverified; IDs, legacy scheme, EAS association and runtime channels must remain stable.

This inventory distinguishes observed failures from hypotheses. Final results belong in the acceptance record; no typecheck, health response, image publication or fixture transport success constitutes cross-platform production acceptance.

## Reproduction evidence (2026-10-10)

- Linux amd64 packaged executable, Electron 44.3.0, disposable Debian/Xvfb container: root-owned sandbox helper mode 4755; renderer sandbox and context isolation asserted true. Bare Xvfb advertised no `_NET_SUPPORTING_WM_CHECK` and the exact minimized-state assertion failed. With the same executable and test plus Openbox readiness, the test passed (22.2 seconds), including native minimize/restore events on the selected main-window ID. This confirms missing window-manager semantics for the observed Linux failure. No production main-process change or timeout increase was necessary.
- Focused Web rerun: both chat motion variants and both disclosure motion variants passed. Remaining failures reproduced: Advanced state persisted during bot editing; MCP fixture incorrectly registered a disabled stdio `echo` command; filtered cmdk selection lacked a valid active descendant. Fixes retain the original behaviors and assertions.
- Expo Doctor initially failed direct expo-modules-core installation, missing expo-asset, and duplicate icon installations caused by differing TypeScript peer contexts in mobile/shared markdown. After using Expo's exported API, adding the SDK-compatible asset peer, and aligning the native renderer's compiler peer: all 21 checks passed. Native dependency/config change increments appVersion runtime to 1.0.6; previous runtime/channel IDs are retained and this revision must not ship as an OTA to 1.0.5.
- Full baseline unit run in isolation completed: 8,222 passed, two workflow topology assertions failed because this patch adds an explicit tested-source prerequisite. Those assertions are updated to require both architecture builds and the additional successful-main gate. Existing database-only skips are unchanged; they are verified by the integration harness, not counted as unit successes.

## First patch CI and hosted acceptance

- Patch SHA `9d17eeaec95784b0efe07d6cdb0a0b2cd4859a16`: [CI 38055177849](https://github.com/drewsephski/kith/actions/runs/38055177849) failed workflow validation before any jobs. The reusable deployment requested `actions: read` while its caller permitted none. The caller now explicitly grants that read-only permission. No build/test success is inferred from this run.
- [macOS 38055177634](https://github.com/drewsephski/kith/actions/runs/38055177634), packaged acceptance: a prior restore callback appeared before the minimize callback. The assertion incorrectly used the first restore event in the entire event history. Acceptance now synchronizes the minimize event with minimized=true before activation and requires a subsequent restore event, retaining native state assertions. Await the next exact-SHA run before declaring macOS green.
- Vercel preview for this patch failed its production build: `Set API_PROXY_TARGET to the public backend HTTPS origin.` Preview configuration is absent; the production alias remains on the baseline. This is a real preview deployment blocker; the validation is retained.
- Hosted acceptance at the baseline origin: fresh password sign-in, configured model readiness, a new harmless prompt, actual model reply, and persisted API retrieval passed. However, the created conversation is absent from active and archived navigation, and browser deep linking redirects to the main assistant despite authorized thread retrieval succeeding. Complete cross-device history acceptance therefore remains blocked. Frontend/backend compatibility and the backend's missing revision need resolution before rollout can be claimed healthy. No private account identifiers, session cookies, or real conversation data are published as evidence.

- Full Web diagnostic run reached 249 cases before being stopped after confirming runaway fixture work. PostgreSQL contained over 1,200 follow-up runs with the identical steering-context task. The executor explicitly omitted `claimSteering` for scripted runtimes; the runtime also never called it. Finalization therefore requeued unclaimed input indefinitely. The fix uses the existing lease-fenced claim contract for scripted execution and answers the claimed input. Unit and PostgreSQL regression coverage require one completed run and no extra continuation. The interrupted diagnostic run is not counted as full-suite success.
- Follow-up local validation: lint passed; workspace typecheck passed all 22 tasks; focused runtime, model settings, publication-boundary and workflow tests passed 41 assertions. The PostgreSQL regression and full Web rerun remain required.
