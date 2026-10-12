# Kith mobile release acceptance

Status: **BLOCKED pending native runtime and signing evidence**. Metro exports and TypeScript checks are not native installation proof. Use the existing Expo application; keep `com.kith.agent` on both platforms, the `rakazo` deep-link scheme, EAS project association and preview/production channels. Do not run project initialization or change identifiers on this application.

## Build configuration

`RAKAZO_SERVICE_URL` takes precedence over `EXPO_PUBLIC_API_URL` at configuration time. Production requires a public HTTPS origin with no credentials, path or query. Set the intended Kith hosted origin in the existing EAS environment; check generated configuration before a build. These public origin values may enter the bundle. SMTP, API/model keys, account passwords and backend secrets must never appear in Expo extra or public environment values.

SDK 57 / React Native 0.86 dependencies are pinned in the lockfile. Before building:

```sh
pnpm install --frozen-lockfile
pnpm --filter @rakazo/mobile exec expo install --check
cd apps/mobile
pnpm dlx expo-doctor
pnpm exec expo export --platform ios --platform android
```

Doctor initially found a missing expo-asset peer, direct expo-modules-core use and duplicate native icon installations caused by compiler peer contexts. The reliability patch resolves all three; Doctor passed all 21 checks locally. Keep the shared native markdown compiler peer aligned with mobile. Do not delete the lockfile to suppress diagnosis.

The asset peer/configuration and Expo Observe introduced native runtime 1.0.7. The incoming iOS share extension and app-group configuration require a fresh native build on runtime 1.0.8. Older binaries remain on their compatible runtimes and must not receive these native changes as JavaScript OTA. Channels and application IDs are unchanged.

## Expo Observe

The root enables Expo Router render timings and an Observe error boundary. Inbox, sign-in/sign-up/recovery, server setup, and bot/group thread entry routes mark interactive only after the splash is hidden and their initial data or recoverable error UI is ready. Other routes collect render timings; add interactive markers when their readiness conditions are defined.

Route parameters carrying resource IDs, names, integration endpoints, and authentication codes/tokens are filtered from navigation metrics. Handled startup failures use fixed diagnostic messages without raw exceptions or server responses. Unhandled JavaScript errors and native crashes use Observe's automatic reporting.

Production EAS builds upload JavaScript source maps and require EAS CLI 22 or later. Debug dispatch is disabled by default. Observe requires a fresh native development or release build and does not run in Expo Go. After running the installed app, open the existing project's **Observe** tab for startup metrics, **Navigation** for route timings, and **Errors** for reports. From `apps/mobile`, `eas observe:versions`, `eas observe:metrics-summary`, and `eas observe:routes` query the same data. See the [Expo Observe setup guide](https://docs.expo.dev/eas/observe/get-started/).

## Deterministic native CI

Main/PR CI calls `mobile-android-screenshots.yml` as a required Android native acceptance job. It builds a fresh release APK, installs it in a real emulator and runs the screenshot, notification and smoke journeys against the migrated isolated API/database. Only dependency/Gradle/CLI caches are reused; compiled APKs are not restored from cache.

The smoke retains bot creation, messaging and computer takeover/release, and adds app restart/session persistence and sign-out. Branding matches Kith. Fake fixture accounts and emulated connectors are for deterministic CI only. Hosted OAuth, push delivery, physical permission behavior and cross-device production persistence require separate evidence.

The manual screenshot workflow remains available. Public gallery publication requires its explicit `publish_gallery` input; emulator diagnostics remain retained on failure. Never publish screenshots of a real account.

## iOS and distribution

For a local simulator, generate native configuration using the pinned dependencies, install pods, build the simulator target and run the same core journeys. A successful Metro iOS bundle alone is insufficient. For internal EAS verification, use the existing preview profile/project with operator-owned signing credentials:

```sh
cd apps/mobile
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

After both native builds and runtime journeys pass, an operator may authorize signed production builds using the existing production profile. App Store / Play submission requires separate explicit authorization. Verify sign-in/out, session restoration, messages and reconnect, For You, files/attachments, deep links, Settings/connections, permissions, background/resume and cross-device persisted data on installed native clients. Record exact source SHA, runtime, backend version and device/platform.

## OTA gates

CI retains the full lint/type/build/unit/PostgreSQL/Web gates and adds Android native acceptance before OTA. Native configuration, dependencies, modules and permission changes block OTA publication. The existing `EXPO_TOKEN` must be supplied through authorized private configuration. A compatible manual OTA also requires a green tested commit and operator authorization; never use it to avoid a required new native build.

## External evidence still required

Android compiled/emulator result for the final patch; iOS simulator or internal signed build/runtime result; dedicated production test credentials supplied through ignored local configuration; hosted SMTP recovery delivery; real push/OAuth permissions where configured; store signing and submission approval. None is inferred from dependency checks or screenshots alone.

### Native evidence and current crash blocker

Android release APK compilation passed on `c06d7852` and `bff589c5`. The first emulator run exposed missing Android formSheet header actions; Android now uses a pushed native screen while iOS retains its sheet. The next [native run](https://github.com/drewsephski/kith/actions/runs/38059497241/job/114235628459) failed cold launch with a real SIGSEGV, not an obsolete branding assertion. Retained logcat shows `android_unsafe_frame_pointer_chase`, GWP-ASan's `RecordBacktrace`, and `hoost_make_fcontext+46` in Hermes `250829098.0.17` (build ID `8d927b4d4757e3548fed384ed5666d66ee44c365`). This matches [the upstream defect](https://github.com/facebook/hermes/issues/2225) in that exact binary. Its stable-line [backport](https://github.com/facebook/hermes/pull/2229) is still open. No sanitizer was disabled, failed launch retried into success, or emulator assertion skipped. Native runtime acceptance remains blocked until a compatible engine containing the frame-chain fix is built and verified.

Local iOS native simulator compilation is in progress after successful prebuild, pods and installation of the supported simulator runtime. This is separate from signed device/TestFlight evidence. Dedicated production credentials are available privately; they are never bundled or uploaded in native diagnostics.
