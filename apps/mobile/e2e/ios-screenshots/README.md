# iOS screenshot catalog

Local, agent-run capture of the Kith iOS app. It is not part of CI.

One command signs into disposable fixture accounts, runs the Maestro flows in
`catalog.json`, and writes PNGs plus a static `index.html` gallery. Add a screen
by dropping a flow under `flows/` and appending one entry to `catalog.json`.

The Kith app (`com.kith.agent`) must already be installed on the simulator in `SIM_UDID`.
The flows retain the `rakazo` URL scheme configured in `apps/mobile/app.json`.
This command does not create or boot a simulator. Point the app at a running
API (`RAKAZO_API_URL`) and Metro bundler before you start. `DATABASE_URL` must
be that API's database so the fixture can insert thread messages.

Use a disposable simulator. The onboarding section and smoke flow deliberately
clear its iOS Keychain as well as app data to exercise a real first-run intro.
The onboarding flow captures all three scenes, resumes an interrupted intro,
signs into an empty fixture account, and verifies automatic assistant preparation.
The seed resets the empty fixture's bot roster before capture. Its sign-in step
does not prove native sign-up; test sign-up separately before release.
The smoke flow exercises Skip, existing-account sign-in, real offline-runtime
responses, relaunch, new bot creation, computer control, and denied notifications.
Set appearance and Reduce Motion in simulator Settings before separate captures.

The share extension requires a rebuilt native app, not Expo Go. Before release,
share a Safari URL, selected text, a Photos image, and a Files document into Kith;
choose a conversation, inspect the draft, cancel, then repeat and send explicitly.
Repeat while signed out, offline, and with a different Space selected. Permission
denial and Settings return, VoiceOver, SSO cancellation, and approval return paths
also require native acceptance evidence; unit tests do not replace those checks.

```sh
SIM_UDID=00000000-0000-0000-0000-000000000000 \
RAKAZO_API_URL=http://127.0.0.1:3110 \
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/rakazo \
RAKAZO_SCREENSHOT_EMAIL=ios-screenshots@example.test \
RAKAZO_SCREENSHOT_EMPTY_EMAIL=ios-screenshots-empty@example.test \
RAKAZO_SCREENSHOT_PASSWORD='replace-with-a-disposable-password' \
pnpm ios:screenshots
```

Run one section:

```sh
pnpm ios:screenshots -- --section settings
```

Output defaults to `test-report/ios-screenshots` (gitignored). Override it with
`IOS_SCREENSHOT_OUT`. Open `index.html` in that folder. Maestro must be on `PATH`.
