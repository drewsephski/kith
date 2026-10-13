# Native mobile acceptance

Pull-request CI runs **Android native acceptance** through
[`mobile-android-screenshots.yml`](../../../.github/workflows/mobile-android-screenshots.yml).
It builds and installs the current app, starts a disposable fixture backend, and runs screenshots,
notifications, and the shared Maestro smoke flow. `pnpm test:mobile-screenshots` uses the same
Android fixture harness; it expects an already installed app and running emulator, and defaults to
`http://10.0.2.2:3110`. The harness seeds disposable accounts and uses deterministic provider
emulators. It does not spend model-provider funds.

The [iOS screenshot catalog](ios-screenshots/README.md) is a separate local simulator command:
`pnpm ios:screenshots`. It requires the existing installed app, running API/worker and disposable
database described there. Its compose flow checks conversational identity with the native keyboard's
Next and Done actions. iOS capture is not part of the Android CI job.

## Run the shared smoke flow directly

`pnpm --filter @rakazo/mobile test:e2e` invokes `.maestro/smoke.yaml`. A direct run needs an existing,
seeded disposable fixture; it does not create the backend or seed its initial Researcher conversation.
Install Maestro, start the emulator/simulator, and install the current native app first. The computer
portion also requires the fixture's configured sandbox and supervisor. Use the isolated scripted
runtime/provider setup for deterministic acceptance.

Pass fixture values at invocation time. Never use a production account or store its credentials in
tracked files. For example, against an existing Android fixture:

```sh
pnpm --filter @rakazo/mobile exec maestro test \
  -e RAKAZO_API_URL=http://10.0.2.2:3110 \
  -e RAKAZO_SCREENSHOT_EMAIL=mobile-smoke@example.test \
  -e RAKAZO_SCREENSHOT_PASSWORD='replace-with-a-disposable-password' \
  -e RAKAZO_SCREENSHOT_BOT_ID=replace-with-the-fixture-researcher-id \
  .maestro/smoke.yaml
```

Use `http://127.0.0.1:3110` when that fixture is running locally for an iOS simulator. Supply the
actual fixture endpoint when its port differs. The shared flow keeps Android's field identifiers and
uses iOS Name autofocus, keyboard Next to Role, and Done to save the custom identity.

The flow deliberately clears app data and the iOS Keychain. This does not delete server-side bots;
reset the disposable fixture before a repeat acceptance run. The obsolete `RAKAZO_E2E_*` variables
are not consumed by this flow.

## Screenshot artifacts

CI uploads native diagnostics and screenshots. The manually dispatched **mobile Android
screenshots** workflow runs the same fixture capture. Gallery publication remains separate from
native application acceptance; missing publication credentials do not prove an application failure.
