# Kith Desktop 0.1.7 release readiness

Assessment: **BLOCKED**. No public desktop release exists. This implementation prepares the
next unused stable version, 0.1.7; it does not create or push its tag or publish a release.
Evidence collected on 2026-10-09 from reviewed baseline
`494a09500509f4166482a2604a04f1e46494caf2`, plus the local changes described below.

## Confirmed and fixed

- electron-builder 26.15.3 actually produces `mac-universal/Kith.app`, with executable
  `Contents/MacOS/Kith`. Both release and screenshot workflows used obsolete Rakazo paths.
- The screenshot workflow selected a test whose name no longer existed. Existing Electron
  smoke expectations also omitted Quick Ask, and two local-stack assertions attempted a
  stale Continue action or a second click after automatic opening.
- Release builds accepted missing hosted configuration. They now pin `RAKAZO_SERVICE_URL`
  to reviewed `apps/desktop/release-service.json`, reject placeholders and unreviewed origins,
  probe the backend/auth service, and inspect `dist/service-config.json` inside actual ASAR.
- Release publication checked filenames/version lines without checking updater-referenced
  bytes. It now checks sizes, SHA-512 hashes, primary updater paths, complete platform sets,
  stale/unexpected assets, downloaded draft assets, and anonymous public downloads.
- Native preferences opened local infrastructure settings. Settings now opens the shared
  SettingsOverlay, New Conversation uses the existing conversation operation, and local
  management is under Advanced. Cmd/Ctrl+K remains owned by the shared command palette.
- Competing launches had no single-instance lock. The second launch focuses/restores the
  existing profile's window. Isolated acceptance profiles remain independent.
- Hosted cold start had no visible progress during health probing; a saved hosted connection
  fell back to the custom-server form. Opening Kith now has a bounded progress/recovery flow,
  a saved hosted installation selects Retry, and renderer crashes preserve session storage.
- Quick Ask now restores minimized windows, reopens after warm-window expiration, and restores
  bounds using the original display, including a disconnected display or a smaller work area.
- Development packages explicitly report updates as unsupported. Official builds retain the
  stable, upgrade-only policy and the Kith GitHub channel.

No app ID, existing user-data path, session partition hash, signing identity, local executable
compatibility name, or legacy Icon Composer asset filename was renamed. Electron still loads
one shared React application. Provider credentials stay on the server.

## Evidence

| Check | Result | Scope |
| --- | --- | --- |
| Checkout baseline and dirty-work audit | Passed | Clean initial checkout; changes remain local |
| Hosted HTTPS document, POST `/rpc/health`, session endpoint | Passed | Verified actual configured application origin |
| Disposable signup, signin, signout, session restoration | Passed | Hosted HTTP/auth API; fixture account deleted |
| Shared onboarding and personal assistant | Passed | Deployment reports `needsModel=false`; no API key supplied |
| Safe real agent interaction | Passed | Persisted `KITH_ACCEPTANCE_OK` bot response in approximately 29 seconds |
| Threads, bootstrap, memory, routines, files, connections, recent runs | Passed | Hosted authenticated read endpoints; not full UI/provider acceptance |
| Password recovery availability | Failed | `/api/auth/capabilities` returns `passwordAuth=true`, `passwordReset=false`; release preflight blocks |
| Workspace `pnpm check` | Passed | 22 tasks |
| Desktop unit tests and shared Web unit tests | Passed | 365 desktop tests; 690 Web tests |
| Production Web and Desktop builds | Passed | Shared renderer and compiled main/preloads |
| Local universal macOS package | Passed | Deliberately unsigned DMG/ZIP and real bundled resources |
| Local x64 Linux package | Passed | Actual AppImage and bundled resources; launch requires Linux |
| Universal architectures and app identity | Passed | `x86_64 arm64`, `dev.rakazo.desktop` |
| Icon Composer stack and legacy artwork | Passed | Actual Assets.car includes Icon stack and existing artwork |
| Feed origin, artifact sizes and SHA-512 hashes | Passed | Actual local package/feed; not signed-update success |
| Electron tests on this Mac | Skipped | Repository prohibits routine focus-stealing Electron E2E |
| Native-command shared Web E2E | Passed locally | Real isolated backend; SettingsOverlay, Escape and one new conversation |
| Packaged Electron acceptance CI checks | Requires CI | Test discovery passes; no remote execution of these local changes |
| Developer ID, notarization, stapling, Gatekeeper | Requires external verification | Required repository secret names are absent |
| Signed two-version update | Requires external verification | No signed or published versions exist |
| Gmail/Calendar consent, reconnect and revocation | Requires external verification | Dedicated provider acceptance account required |
| Public downloads | Not available | GitHub Releases list is empty; marketing links remain unconfigured |

The existing main CI run had Electron smoke failures. This work corrects their identified
assertions; it does not claim the changed CI run has passed. Live browser session restoration
was observed, but preview snapshots failed; no personal account content or screenshots are
included in release evidence. The focused Web E2E passed against the repository's isolated test harness and captured the
native settings surface. This is shared renderer/backend proof, not packaged Electron proof.
Packaged CI records time to its first usable login fixture; actual installed time to usable chat
still requires the signed acceptance run.

## Actual local artifacts

All paths below are relative to the repository. These are **unsigned validation artifacts**;
never distribute them as the signed production release.

- `apps/desktop/out/mac-universal/Kith.app`
- `apps/desktop/out/mac-universal/Kith.app/Contents/MacOS/Kith`
- `apps/desktop/out/Kith-0.1.7-universal.dmg`
- `apps/desktop/out/Kith-0.1.7-universal.zip`
- `apps/desktop/out/Kith-0.1.7-universal.dmg.blockmap`
- `apps/desktop/out/Kith-0.1.7-universal.zip.blockmap`
- `apps/desktop/out/latest-mac.yml`
- `apps/desktop/out/SHA256SUMS` (actual local installer/feed checksums)

Linux's locally generated release installer is `Kith-0.1.7-x86_64.AppImage`, with unpacked executable
`linux-unpacked/rakazo` and launcher display name Kith. Windows, when signed, produces
`Kith-0.1.7-x64.exe` with application `win-unpacked/Kith.exe`. Verify those platform artifacts
on their supported CI runners. Installer names are explicit builder configuration, and
macOS and Linux names were additionally verified against generated artifacts.

## Operator gates, in order

1. Review these local changes, deploy the changed shared Web UI to the reviewed hosted origin,
   and run CI on the final main commit. Native commands require the deployed shared renderer
   containing the new bridge listener. Obtain the Web E2E native-settings screenshot and the
   native packaged macOS screenshot from that CI run.
2. Configure hosted `SMTP_URL` and `EMAIL_FROM` through the existing server email adapter.
   Do not put them in desktop configuration. Verify password-reset delivery with a dedicated
   test mailbox, reset, old-session invalidation, and successful new signin.
3. Provision the five required repository signing secret names in [desktop release setup](./desktop-release.md).
   The current repository secret-name inventory is empty. Windows certificate/password are
   optional and should remain absent until a valid certificate is available.
4. Create the `desktop-release` GitHub environment with required operator review and protected
   stable tags. Environment protection is not yet configured. `DESKTOP_ACCEPTANCE_SHA` must be
   set to the exact reviewed release commit only after recording the manual matrix below.
   An environment name alone is not an approval rule.
5. On a controlled Mac, build the exact commit/origin with the real signing credentials;
   validate universal architecture, Developer ID authority, hardened runtime, notarization,
   stapling, Gatekeeper, DMG installation into `/Applications`, icons, microphone consent,
   hosted signup/signin, offline/retry, crash recovery, and every required parity gate.
   The release workflow repeats OS checks against both copied DMG and expanded update ZIP,
   and launches the actual packaged executable on CI, before any upload/publication.
6. Run the signed two-version rehearsal below and the dedicated Gmail/Calendar matrix.
   Do not authorize real outbound messages or other consequential provider writes.
7. After acceptance and explicit operator approval of the tag operation, tag the unused
   `v0.1.7` commit on main. Verify the version/tag and successful CI remain exact matches.
   Review the `desktop-release` publication gate only after platform jobs succeed.
8. Independently download the published artifacts, validate SHA256SUMS and GitHub provenance,
   install them on Apple Silicon and Intel, and verify update-feed accessibility. Only then set
   the existing marketing `PUBLIC_DESKTOP_*_URL` variables to the published asset URLs and
   rebuild the marketing site. Do not point download links to drafts or local unsigned files.

## Signed two-version rehearsal

Use an isolated test profile and test accounts, with the same real signing identity and app ID
for both versions. Use a separate controlled GitHub test repository and a stable feed, overriding
builder publish configuration only for those staging test artifacts. The controlled feed must be accessible to the installed updater. Never change the shipping
Kith publish configuration or publish fake/prerelease metadata into its stable channel.

Build/install signed version A, sign in, select a server, create a harmless persisted conversation,
and record its identity plus settings. Publish signed version B with its matching ZIP/feed (and
AppImage/NSIS where supported) in the controlled channel. Confirm A discovers B, downloads verified
bytes, shows progress and Restart, installs B, and reopens the same assistant/session/configuration.
Repeat with offline download, missing feed, corrupt hash, incorrect signing identity, older version,
and prerelease; none may install or destroy the existing profile. Verify a second launch and closing
Desktop do not start duplicate jobs. Restore network and retry the failed download. Confirm the
final shipping build embeds `provider: github`, `owner: drewsephski`, `repo: kith` and no test channel.
A staging rehearsal verifies the signed mechanism; the first real Kith stable-to-stable update must
also be checked when a second public version exists. Mock updater events do not satisfy this gate.

## Native copy added

- “Opening Kith…” is visible only while connecting, preventing a blank launch window.
- “Could not connect to Kith”, “Check your connection and try again. Your session is saved.”,
  and “Retry” appear only after a hosted connection fails.
- “Kith stopped responding. Retry to reconnect. Your session is saved.” appears only on crash.
- “Settings…”, “New Conversation”, and “Advanced” name native menu destinations.
- “Automatic updates only run in a release build.” explains unsupported development packages.
- “Kith uses your microphone for dictation.” is required OS privacy-prompt metadata and appears
  when microphone permission is requested.

Each recovery sentence identifies the available action or confirms session preservation; none is
persistent explanatory chrome. Menu labels and privacy-prompt text cannot be removed without
making those native actions inaccessible or misleading.

## Exact files changed

- `.github/workflows/ci.yml`
- `.github/workflows/desktop-macos-screenshot.yml`
- `.github/workflows/release-desktop.yml`
- `apps/desktop/e2e/local-stack.spec.ts`
- `apps/desktop/e2e/packaged.spec.ts`
- `apps/desktop/e2e/smoke.spec.ts`
- `apps/desktop/package.json`
- `apps/desktop/release-service.json`
- `apps/desktop/scripts/copy-static.mjs`
- `apps/desktop/scripts/verify-artifacts.mjs`
- `apps/desktop/scripts/verify-package.mjs`
- `apps/desktop/scripts/verify-service.mjs`
- `apps/desktop/src/auto-update.test.ts`
- `apps/desktop/src/auto-update.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/package-metadata.test.ts`
- `apps/desktop/src/preload.cjs`
- `apps/desktop/src/preload.test.ts`
- `apps/desktop/src/quick-ask.test.ts`
- `apps/desktop/src/quick-ask.ts`
- `apps/desktop/src/release-artifacts.test.ts`
- `apps/desktop/src/release-workflow.test.ts`
- `apps/desktop/src/setup-config.test.ts`
- `apps/desktop/src/setup-config.ts`
- `apps/desktop/src/setup-ui.test.ts`
- `apps/desktop/src/setup.html`
- `apps/desktop/src/setup.js`
- `apps/web/e2e/desktop-commands.spec.ts`
- `apps/web/src/pages/Shell.tsx`
- `docs/desktop-acceptance.md`
- `docs/desktop-release-notes-v0.1.7.md`
- `docs/desktop-release-readiness.md`
- `docs/desktop-release.md`
- `packages/contracts/src/desktop.ts`
- `pnpm-lock.yaml`
