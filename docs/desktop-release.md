# Desktop releases

The `release-desktop` workflow builds, signs, notarizes, attests, and publishes
the Electron app from a `vMAJOR.MINOR.PATCH` tag on `main`. Publishing the
Docker images triggers from the same tag.

## Repository secrets

macOS (required):

| Secret | Value |
| --- | --- |
| `DESKTOP_MAC_CSC_LINK` | Base64 of the `Developer ID Application` certificate exported as `.p12` |
| `DESKTOP_MAC_CSC_KEY_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_API_KEY_ID` | App Store Connect API key ID (the `XXXXXXXXXX` in `AuthKey_XXXXXXXXXX.p8`) |
| `APPLE_API_ISSUER` | Issuer ID shown on App Store Connect > Users and Access > Integrations |
| `APPLE_API_KEY_P8` | Contents of the `AuthKey_*.p8` file |

The API key needs the Developer role. The workflow writes it to a mode 600 file
in the runner's temp directory for the packaging step and deletes it afterwards.

`patches/app-builder-lib@26.15.3.patch` carries electron-builder PR #10101:
without it `CSC_LINK` signing fails while creating the temporary keychain. Drop
the patch once an electron-builder release includes that fix.

Windows (optional):

| Secret | Value |
| --- | --- |
| `DESKTOP_WIN_CSC_LINK` | Base64 of the Authenticode certificate as `.p12`/`.pfx` |
| `DESKTOP_WIN_CSC_KEY_PASSWORD` | Its password |

When `DESKTOP_WIN_CSC_LINK` is unset the Windows build and its release assets
are skipped. macOS and Linux always build, and the release is only published
when every platform that was built produced its installer and update feed.

Set a secret from a file without echoing it:

```sh
base64 -i devid.p12 | gh secret set DESKTOP_MAC_CSC_LINK
gh secret set APPLE_API_KEY_P8 < AuthKey_XXXXXXXXXX.p8
```

## Cut a release

1. Complete [release readiness](./desktop-release-readiness.md) and the
   [acceptance matrix](./desktop-acceptance.md). Provision signing credentials and working
   hosted password recovery. Deploy the matching shared Web renderer and obtain passing CI.
2. Review `version` in `apps/desktop/package.json` on `main` and prepare matching
   `docs/desktop-release-notes-v<version>.md`. Version 0.1.7 is prepared locally and is unused.
3. Configure a protected `desktop-release` environment requiring operator approval. Set its
   `DESKTOP_ACCEPTANCE_SHA` variable to the exact accepted release commit after manual acceptance.
4. Obtain explicit operator approval of the release/tag operation.
5. Tag that commit `v<version>` and push the tag:

```sh
git tag v0.1.7
git push origin v0.1.7
```

The workflow refuses tags that do not match the desktop version, are not on
`main`, or are not newer than the latest published release.

## Fork publishing and update compatibility

The publish target and workflow feed checks are `drewsephski/kith`. The fork had no published
release assets when checked on 2026-10-09. The marketing download page therefore defaults to
release status and source builds; it does not advertise signed or notarized installers.
Check the release asset list again immediately before configuring installer links.

The workflow requires a matching stable tag on `main`, repository release permissions, macOS
signing/notarization secrets, complete platform artifacts, and successful feed verification.
Windows is included only when its signing certificate is configured. Publishing runs after
all selected platforms succeed and the exact commit has passed CI and operator acceptance; update YAML files and installers belong to the same release.
Do not upload an incomplete feed or reuse a released version/tag.

`RAKAZO_SERVICE_URL` is a **public application HTTPS origin**, supplied through the repository
Actions variable of the same name. It is validated and bundled as public service configuration.
The release origin must equal the public origin reviewed in `apps/desktop/release-service.json`.
`verify-service.mjs` requires backend health, authentication endpoints and password recovery
when password signin is enabled. `verify-package.mjs` checks the bundled origin in actual ASAR;
`verify-artifacts.mjs` checks stable installer names, versions, paths, sizes and SHA-512 hashes.
A fresh hosted build uses that origin immediately and opens authentication without asking for
Docker or a pasted address. Production release builds require this origin and `RAKAZO_RELEASE_BUILD=1`; a missing,
placeholder, or unreviewed origin fails the build. Local developer builds without the release
flag retain local/remote setup choices and report automatic updates as unsupported.
The same origin must be used by Web so the account, assistant and conversations are shared.
Server/model/integration secrets never belong in this variable or in the desktop bundle.

Application identity (`dev.rakazo.desktop`), executable naming, user-data storage, saved setup
format, per-server session partitions, Quick Ask, and local-stack configuration stay compatible.
Saved local/remote configuration takes precedence over a newly bundled hosted origin. Switching
servers remains an explicit setup action. New fork builds check the fork feed; an older installed
upstream build retains its embedded upstream feed and is **not automatically migrated** by this
source change. Moving an installation between release channels requires a verified installer
and compatible signing identity; never weaken Electron update signature checks to force it.
Test upgrades and retained sessions with a real signed release before general distribution.

## Build from source

Install the repository's supported Node version and pnpm, then:

```sh
git clone https://github.com/drewsephski/kith.git
cd kith
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @rakazo/web build
pnpm --filter @rakazo/desktop build
```

For a hosted build, set the verified public application origin before building Desktop:

```sh
RAKAZO_SERVICE_URL=https://app.example.test pnpm --filter @rakazo/desktop build
```

Run `pnpm --filter @rakazo/desktop exec electron .` to launch your local build. This opens an
Electron window; it is an explicit human launch, not routine automated verification. To create
an unpacked local app, use `pnpm --filter @rakazo/desktop pack:dir`. A source/unpacked build is
not a signed or notarized installer. Cross-platform distribution requires the workflow and
signing prerequisites above. Without a hosted origin, use the existing advanced local-stack
or remote-instance setup, with the documented self-hosting requirements.

Local verification uses desktop unit tests and type checking/build. The Electron Playwright
suite belongs in CI's virtual display; it must not steal focus during routine work on a Mac.
