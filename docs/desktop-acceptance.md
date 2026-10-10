# Web and packaged Desktop acceptance matrix

Use the same dedicated hosted account and origin in a browser and installed Kith. The shipping
renderer is shared; shared source is architectural parity, not evidence of end-to-end parity.
**Release gate:** every Required row needs both surfaces verified on the final release candidate,
or a truthful, explicitly accepted availability limitation. Record version, commit, platform,
architecture, date, expected result, actual result, and reproduction steps. Never include account
emails, cookies, provider codes, screenshots of personal data, or secret values in public evidence.

Current evidence: hosted HTTP signup/signin/signout, default model, shared onboarding, persisted
agent reply, assistant identity after signin, and read-only API surfaces passed. Packaged resources,
security/unit tests, and artifact hashes passed locally. The focused native-command Web E2E passed locally with the isolated backend.
Post-merge packaged CI ran and failed on Linux sandbox-helper permissions and an immediate
macOS minimized-state assertion. The local workflow/test follow-up requires a remote rerun;
real signed Desktop acceptance remains pending. See [release readiness](./desktop-release-readiness.md)
for the exact failed runs. Password recovery is currently unavailable and blocks release.

| Area | Required journey and expected behavior | Web evidence now | Desktop evidence/gate |
| --- | --- | --- | --- |
| Account | Signup → deployment model → personal assistant, no API key/server setup | Hosted API passed | Startup resolver/unit; real signed first launch pending |
| Account | Signin/signout and expired-session login recovery | Hosted API passed; expiry unverified | Packaged transport fixture in CI; real auth/expiry pending |
| Account | Restart preserves cookies and correct assistant; another origin stays isolated | Assistant ID after signin passed | Source partition tests; packaged restart fixture in CI |
| Account | Password recovery email, token expiry, reset, old session invalidation | Failed: passwordReset=false | Configure hosted email, repeat both surfaces |
| Account | Account settings, password/security controls, existing space/account switching | Shared Web unit coverage | Native SettingsOverlay Web E2E and signed manual check |
| Assistant | Personal assistant loads with same identity/history on both surfaces | Hosted bootstrap passed | Shared renderer; real signed comparison pending |
| Assistant | New conversation, repeated native command creates one conversation | Passed against isolated backend | Native menu fixture plus shared E2E in CI |
| Assistant | Streaming reply/progress, disconnect/reconnect, retained history | Safe persisted hosted reply passed; live streaming unverified | SSE/renderer reconnect and manual signed gate |
| Assistant | History/search and command palette via Cmd/Ctrl+K | Existing shared E2E | Verify shortcuts, selection and results in packaged app |
| Assistant | File/artifact upload, preview, download and reopened artifact | Hosted artifact list passed | Native chooser/save/download and shared UI gate |
| Assistant | Personal memory view/edit, scope isolation, later recall | Hosted memory list passed | Dedicated safe memory fixture in both surfaces |
| Integrations | Gmail connect through real provider consent, return, read fixture data | Dedicated account needed | System-browser/provider popup and session gate |
| Integrations | Google Calendar connect/consent/callback, read a fixture event | Dedicated account needed | Same account/session, exact origins and scopes |
| Integrations | Revoke; expired authorization; reconnect without duplicate identity | Not exercised | Dedicated account/manual gate |
| Integrations | Other existing integrations, truthful configured/unavailable state | Hosted empty connection list passed | Repeat supported-provider flows; do not add vendors |
| Agent work | Tool execution, live progress, approvals, receipts and source links | Basic real reply passed; tools unverified | Safe fixtures plus real signed acceptance |
| Agent work | Background task continues with Desktop closed; correct restored state | Hosted worker produced reply | Close during safe delayed run, compare Web and reopened Desktop |
| Agent work | For You suggestion creates one persisted conversation/task | Shared unit/E2E coverage | Real signed safe suggestion; no consequential writes |
| Agent work | Saved routine, run, history, missed/retried schedule recovery | Hosted routine list passed | Operator-controlled fixture schedule; durable worker proof |
| Desktop | File chooser, download/save, clipboard and external links | Shared browser implementation | Native dialogs, non-draggable buttons and OS browser gate |
| Desktop | Microphone/dictation consent, denied/revoked access, no camera grant | Shared implementation | Permission unit tests; macOS usage description verified; OS gate |
| Desktop | Completion notification, foreground action, denied permission | Existing shared implementation | Origin-aware permission tests; real OS gate |
| Desktop | Browser/computer screen, authenticated HTTP/WebSocket, reconnect | Not exercised | Safe remote fixture; availability truthful when disabled |
| Desktop | Stable update discovery, download/progress, restart, retained state | Not applicable | Real signed two-version gate; no published feed yet |
| Desktop | Native close/minimize/maximize/fullscreen, Dock reopen, second instance | Not applicable | Packaged fixture CI; signed native inspection pending |
| Desktop | Quick Ask focus, Escape, same session, original bounds and displays | Shared compact mode/focus | Unit tests; real native multi-monitor/fullscreen gate |
| Desktop | Crash recovery, slow/failed mount, offline/retry, saved custom/hosted target | Existing Web recovery | Source tests plus actual packaged fixture CI |
| Desktop | Narrow widths, dark/light theme, reduced motion and focus visibility | Shared Web layout tests | Inspect installed app at narrow sizes and OS themes |

## Exact pending reproductions

- **Password recovery:** GET `/api/auth/capabilities` at the reviewed application origin. Observe
  `passwordAuth=true` and `passwordReset=false`. Anonymous signin offers no functioning reset flow.
  Configure SMTP through the existing backend adapter and verify delivery/reset with a test mailbox.
- **Hosted install and command bridge:** install the signed DMG in Applications using a fresh test
  profile. Verify no setup form appears, authenticate, press Cmd+, and check shared SettingsOverlay.
  Deploying only the Electron main process without the changed hosted renderer leaves that command
  without a listener. Deployment and real native menu acceptance are mandatory before publication.
- **Provider return:** from both surfaces connect Gmail/Calendar using dedicated accounts. Record
  final application origin, provider consent scopes, callback completion and connection status.
  Restart Desktop before/after callback; confirm the same persistent partition and account.
  For loopback model OAuth, reject mismatched state, wrong port/path, duplicate callbacks and cancel.
- **Durable work:** start a harmless delayed task, close Desktop, wait for Web to show completion,
  reopen Desktop and compare the task/run/result. Do not infer worker durability from window hiding.
- **Signed update:** follow the two-version rehearsal in [release readiness](./desktop-release-readiness.md).
  An empty public release feed is expected today; neither mocked events nor local YAML prove an update.

## CI boundary

`apps/desktop/e2e/packaged.spec.ts` launches an actual packaged executable and uses isolated,
synthetic login cookies. It covers restart retention, native preferences intent, second-instance
focus, minimize/restore, a state-checked loopback OAuth callback with OS browser opening stubbed,
and crash/retry. It deliberately does not claim Better Auth, Google consent, live model streaming,
or signed updater acceptance. `verify-package.mjs` inspects actual bundled service/preload/web/stack
resources, metadata and stable feed. Release OS checks additionally verify the installed DMG and
update ZIP signatures/tickets and universal architecture.

`apps/web/e2e/desktop-commands.spec.ts` injects only the native command bridge into the shared
application against the existing isolated backend fixture. It verifies the SettingsOverlay,
Escape, and deduplicated conversation creation, and captures `desktop-native-settings` for CI.
Use the real packaged manual gates above to connect these fixture checks to production evidence.
