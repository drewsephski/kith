# Hosted Kith

Downloaded apps connect to the operator's hosted service. Users sign in and click an app's
**Connect** button; the provider asks them to approve account access. They do not create a
Composio project or copy developer credentials. The operator configures the service once.
Self-hosted deployments retain the existing provider setup controls.

## Deployment layout

- Vercel serves the web app and proxies authenticated `/api` and `/rpc` requests to Fly.
- One always-running Fly Machine runs the API, worker, and existing web gateway. Both backend
  processes share the `kith_data` volume mounted at `/data`. Port 3100 stays on loopback.
- PostgreSQL stores accounts, configuration, jobs, and application records. Use a direct
  PostgreSQL connection for the worker, migrations, and realtime listeners; a transaction-pooled
  endpoint is suitable only for ordinary application queries.
- Computer capabilities use `SCREEN_PROXY_ORIGIN` to reach the Fly gateway directly. HTTP and
  WebSocket screen connections share the same signed capability and existing revocation checks.
  They do not depend on Vercel's proxy duration or WebSocket function lifecycle.

The service deliberately does not scale to zero: scheduled tasks and recovery run without an
open browser. This single-volume topology has downtime during updates and is not a multi-host
high-availability deployment. Do not clone or scale it to multiple Machines without first
replacing the filesystem with shared storage and updating the deployment architecture.

## Backend

Run the following from the repository root. Choose an available app name beginning with `kith`:

```bash
export KITH_BACKEND_APP=kith-example-api
fly apps create "$KITH_BACKEND_APP"
fly volumes create kith_data --app "$KITH_BACKEND_APP" --region ord --size 5
```

Use a PostgreSQL database in the same region where possible. Put server configuration in a
private, ignored `.env.hosted.local` file; replace the example URLs and secret values:

```dotenv
DATABASE_URL=postgresql://example:REPLACE_WITH_PASSWORD@db.example.test/kith?sslmode=require
DATABASE_DIRECT_URL=postgresql://example:REPLACE_WITH_PASSWORD@direct-db.example.test/kith?sslmode=require
WEB_ORIGIN=https://kith-example.vercel.app
BETTER_AUTH_URL=https://kith-example.vercel.app
SCREEN_PROXY_ORIGIN=https://kith-example-api.fly.dev
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_VALUE
ENCRYPTION_KEY=REPLACE_WITH_RANDOM_VALUE
SCREEN_PROXY_SECRET=REPLACE_WITH_RANDOM_VALUE
COMPOSIO_API_KEY=REPLACE_WITH_SERVER_SIDE_KEY
AUTH_PROXY_SECRET=REPLACE_WITH_ANOTHER_RANDOM_VALUE
```

Generate each of the three application secrets independently with `openssl rand -hex 32`.
Generate the proxy secret independently too, and configure the same `AUTH_PROXY_SECRET` in
Vercel's production environment as a sensitive server-side build setting. It authenticates
only the auth-route proxy handoff. The static asset build does not receive this secret.
Keep them stable across redeployments; changing `ENCRYPTION_KEY` makes existing encrypted
provider credentials unreadable. `DATABASE_DIRECT_URL` may be omitted when `DATABASE_URL`
already uses a direct endpoint. Never use a transaction-pooled endpoint for both settings.
Optional `REALTIME_DATABASE_URL` must also be a direct endpoint of the same database.

Import the file without putting secret values in command arguments, then deploy:

```bash
fly secrets import --app "$KITH_BACKEND_APP" < .env.hosted.local
fly deploy . --app "$KITH_BACKEND_APP" --config ./infra/fly/fly.toml \
  --dockerfile ./infra/fly/Dockerfile --ignorefile ./.dockerignore --ha=false --remote-only
```

The positional `.` keeps the entire monorepo as the build context. The Dockerfile and ignore
file are passed explicitly relative to that context; do not add a `[build].dockerfile` path
to the nested Fly configuration, because flyctl resolves that setting from the configuration
directory.

The image installs frozen dependencies, generates Prisma, and builds the gateway. Its static
build uses development-secret defaults only inside the build command; production services
require real runtime secrets. At startup the entrypoint verifies that `/data` is mounted,
repairs ownership without following symlinks, drops to the `node` user, applies Prisma
migrations, and starts the three supervised services. Prisma advisory locks serialize
migration attempts. A child service failure stops the stack, and Fly restarts the Machine.

`SANDBOX_PROVIDER=none` is the default. To enable computers, configure an existing remote
provider as described in [computer providers](./self-host-sandbox-providers.md). The provider
credential remains on Fly; no Docker socket or sandbox supervisor is exposed by this image.
For an operator-funded initial deployment, add these settings to the private backend file:

```dotenv
SANDBOX_PROVIDER=e2b
E2B_API_KEY=REPLACE_WITH_SERVER_SIDE_KEY
OPENROUTER_API_KEY=REPLACE_WITH_SERVER_SIDE_KEY
PI_DEFAULT_PROVIDER=openrouter
PI_DEFAULT_MODEL=openai/gpt-6-luna
SANDBOX_IDLE_MS=300000
SANDBOX_MAX_COMPUTERS_PER_USER=4
```

Import them with the same `fly secrets import` command. Fly secrets override the image's
`none` default. Users can start conversations and use computers without bringing API keys;
user model connections retain their existing precedence over the deployment fallback.
The caps limit computer counts, not model spending. Idle computers pause, retaining files
and browser profiles; active runs keep their computer awake.

Keep these settings only on Fly, never in `VITE_*` variables or Vercel's frontend environment.
Verify a real model reply, computer file write/read, external browsing, and a screen connection.
A successful `/health` alone does not validate either vendor credential. End-user OAuth
account authorization remains necessary for their personal email, calendar, and other apps.

With `SANDBOX_PROVIDER=none`, conversations still work with a model connection; shell,
filesystem, and desktop tools are unavailable. See the dated
[provider comparison](../outputs/kith-computer-provider-comparison.md) for the initial
E2B choice and Daytona's account-tier network restrictions.

## Composio

The operator supplies one Composio project API key on the backend. End-user connections use
stable, server-derived user identities and remain scoped to their account and space. No
Composio key is included in web, desktop, or mobile releases.

To use operator-owned OAuth applications, configure their auth configurations in Composio,
then save the toolkit-to-auth-configuration mapping in the deployment owner's integration
settings. Gmail, Calendar, HubSpot, Google Analytics 4, and Google Sheets require suitable
provider scopes and any provider review required for a public OAuth application. Users still
see the provider's normal consent screen. LinkedIn profile access depends on the provider's
approved API permissions; connecting LinkedIn does not grant arbitrary profile enrichment.
See [task starters](./task-starters.md) for each starter's prerequisites and behavior.

## Vercel

Create the **Kith** project with Root Directory `apps/web`, framework **Other**, and include
source files outside the Root Directory. The checked-in `apps/web/vercel.json` installs with
pnpm and runs `build:vercel`.

Set one non-secret build environment variable for the frontend:

```dotenv
API_PROXY_TARGET=https://kith-example-api.fly.dev
```

Set the matching sensitive `AUTH_PROXY_SECRET` as described above. The generated auth route
uses a server-side request-header transform; it never places this value in browser assets
or response headers. Fly verifies the handoff before trusting Vercel's client-IP header.
Direct Fly requests use Fly's edge-injected address. Client-supplied IP/token headers cannot
replace the normalized auth address. These settings preserve per-client auth rate limits.

Set it for every deployment environment that should reach this backend. Use a separate
backend/database for previews that need isolation; production provider credentials belong
only on the production backend.

The build validates a public, credential-free HTTPS root URL and generates the Vercel Build
Output API directory. It copies the built assets, emits external API/RPC/screen HTTP rewrites
with explicit `no-store` headers, forwards `/health`, and keeps SPA navigation working.
Missing or malformed proxy configuration fails the build. Database, Composio, encryption,
and auth signing secrets stay exclusively on Fly.

For a local build check:

```bash
API_PROXY_TARGET=https://kith-example-api.fly.dev pnpm --filter @rakazo/web build:vercel
node --test apps/web/scripts/vercel-build.test.mjs infra/fly/start.test.mjs
fly config validate --app "$KITH_BACKEND_APP" --config infra/fly/fly.toml
```

After the production Vercel alias is known, update the backend's `WEB_ORIGIN` and
`BETTER_AUTH_URL` to that exact HTTPS origin. Provider OAuth callback URLs must use the same
public service configuration. Use the stable production alias in downloaded apps, rather
than a deployment-specific preview URL.

## Downloaded apps

Build desktop and mobile releases with `RAKAZO_SERVICE_URL` set to the stable Vercel production
origin. The mobile build also supports the existing `EXPO_PUBLIC_API_URL` setting. These are
public addresses, not secrets. The default hosted path opens sign-in and account connection;
advanced server selection preserves self-hosting. See the desktop and mobile release
configuration for their platform-specific build commands.

## First owner and registration

Before exposing a fresh service, restrict `SIGNUP_ALLOWLIST` to the operator's email.
The first admitted account claims deployment ownership. Once that account exists, enable
public registration and clear the allowlist in the owner's settings, then remove the
bootstrap `SIGNUP_ALLOWLIST` environment secret so a later restart does not restore it.
Keep registration restricted when operating a private service.

## Verify and operate

```bash
curl -fsS https://kith-example-api.fly.dev/health
curl -fsS https://kith-example.vercel.app/health
curl -fsS https://kith-example.vercel.app/api/auth/get-session
fly checks list --app "$KITH_BACKEND_APP"
fly logs --app "$KITH_BACKEND_APP"
```

Health returns `{"ok":true}`; an unauthenticated session returns no user session. Confirm
`worker ready`, then verify sign-in, app connection, starter execution, realtime updates, and
an actual computer session when a remote computer provider is enabled. An HTTP page build
alone does not prove provider authorization or worker execution. Keep API/RPC responses
uncached, and never publish logs containing account or provider data.

Back up PostgreSQL and the Fly volume separately. Volume snapshots do not back up the
PostgreSQL database, and database backups do not contain uploaded or generated files.
Monitor disk capacity, failed jobs, and memory use; the initial Fly Machine requests a dedicated
performance CPU and 4 GB. Shared CPUs can throttle cold starts when the API and worker load
their provider adapters concurrently.
Keep deployments at one Machine with the existing volume. Recovering to a new host requires
restoring both stores and importing the same encryption/signing configuration.

References: [Fly app configuration](https://fly.io/docs/reference/configuration/),
[Vercel external rewrites](https://vercel.com/docs/routing/rewrites), and
[Vercel Build Output API](https://vercel.com/docs/build-output-api/configuration).

## Marketing → application handoff

Deploy `apps/www` (Astro) and `apps/web` (Vite) as **separate Vercel projects**. The main
marketing origin serves `/` as the Astro homepage. The application origin serves `/start`,
`/sign-up`, `/sign-in`, `/onboarding`, and `/app` and keeps the existing backend proxies.
Marketing Web links require an explicit `PUBLIC_APP_URL`; no hosted application is assumed.
An unconfigured local build shows the setup-status page. Deployment builds fail closed.

Set these **public, non-secret** environment variables on the marketing project before building:

```dotenv
PUBLIC_SITE_URL=https://www.example.test
PUBLIC_APP_URL=https://app.example.test
```

Both must be distinct HTTPS origins: no path, credentials, query, fragment, private IP, or
internal hostname. Deployment builds fail when either is missing or invalid. Local builds
may use loopback HTTP origins; without site configuration they are unindexed. Environment
loading follows the shared root `.env` convention;
only the explicit public configuration is emitted into marketing links and metadata.
Vercel previews require `PUBLIC_PREVIEW_APP_URL` pointing to an intentional staging application;
they never fall back to `PUBLIC_APP_URL`. Set `PUBLIC_SITE_URL` for the preview origin as well,
and scope installer URLs to production until staging assets are deliberately available.
Verify `/start` and sign-in on the chosen application before publishing the marketing build.
The configured marketing origin drives Astro's canonical URLs, sitemap, robots and social
metadata. A `www` alias redirects only when the configured canonical origin is the apex.
Configure any additional aliases in the hosting project's domain settings.

The Web CTA goes directly to `PUBLIC_APP_URL/start`. That route ignores arbitrary `next`
values, sends signed-out visitors to signup, and resumes signed-in visitors through the existing
assistant/onboarding gate. Sign in uses the same application origin. The marketing middleware
excludes API, RPC, OAuth, MCP, files and screen routes; it does not proxy application traffic.
**Do not attach the application hostname to the marketing project.**

Optional installer links are configured separately:

```dotenv
PUBLIC_DESKTOP_MAC_URL=https://github.com/example/project/releases/download/v1.0.0/Kith.dmg
PUBLIC_DESKTOP_WINDOWS_URL=https://github.com/example/project/releases/download/v1.0.0/Kith.exe
PUBLIC_DESKTOP_LINUX_URL=https://github.com/example/project/releases/download/v1.0.0/Kith.AppImage
```

Leave each unset until the exact asset exists and its signing/support details have been checked.
These URLs must be credential-free public HTTPS paths, without query strings or fragments.
An unset platform offers release status and the source-build guide. It never guesses an installer.
The public GitHub and release links refer to `drewsephski/kith`; upstream image installers and
historical comparisons are explicitly separate from fork releases.

### Domain and OAuth checklist for the operator

1. Provision the application Vercel project, Fly backend, persistent volume and PostgreSQL,
   following the sections above. Keep `API_PROXY_TARGET` and the auth handoff secret server-side.
2. Attach the chosen application hostname and update Fly's `WEB_ORIGIN` and `BETTER_AUTH_URL`
   to **that application origin**. Keep the screen gateway on its separately configured origin.
3. Keep Better Auth callbacks under the app's `/api/auth/*`, direct Calendar's displayed
   `/api/calendar/oauth/callback`, integration completion at `/integrations/callback`, SSO at
   `/sso/callback`, and MCP's existing callback route. Use the exact redirect URI shown by
   each provider/settings surface; retain provider-specific callback paths. Never substitute
   the marketing origin. Register the application origin/redirects in OAuth provider consoles
   and managed integration settings, and complete scope verification/provider review as required.
4. Configure a working deployment model through the existing model connection/defaults and
   optional integration adapters. Verify a real model response before advertising immediate chat.
   OAuth consent and AI data-sharing consent remain necessary for private-source synthesis.
5. Deploy the marketing project with the two public origins above, then attach the chosen main
   domain/DNS. The landing page can be built without moving application or backend routes.
6. Supply the service operator's privacy, terms, support and retention policies before public
   service activation. The repository's legal pages do not claim the upstream operator runs Kith.
7. Build Desktop with `RAKAZO_SERVICE_URL` equal to the application origin, publish verified
   installers/update feeds, and only then populate the marketing download variables.

DNS, provider consoles, hosted credentials, signing and release publication require operator
action. No deployment or public service availability follows from a successful local build.

## Reliability audit and exact-source promotion (2026-10-10)

The inspected production alias is `https://kith-agent-app.vercel.app`; Vercel reported the frontend at `0759b648403a0a67d2031f00756ac939b56f45da`. Its API proxy is backed by the existing Fly `kith-api` application with persistent storage and supervised API/worker processes. Fly's running image predates that frontend and reports a null source revision. A healthy public `/health` response and independently published GHCR image do not prove backend/frontend source compatibility.

The legacy SSH deployment was disabled (`PRODUCTION_DEPLOY_ENABLED` absent). The reliability patch replaces that disabled job with an exact-source Fly deployment, preserving all critical gates and adding Android native acceptance. The protected Production environment must have required reviewers. Before enabling it, an operator must configure `KITH_FLY_APP`, the intended `RAKAZO_SERVICE_URL`, and an app-scoped `FLY_API_TOKEN` in that environment. Keep the token private. Add reviewer protection first, then enable `PRODUCTION_DEPLOY_ENABLED=true`. No credential modification or production rollout was performed by this audit.

The workflow checks the exact current main SHA and every required job in the same run. The Fly image embeds that source SHA. It records the prior immutable image digest, updates the existing persistent Machine, retries internal API/worker readiness within a bound, then validates public proxy liveness and password-recovery capability. If deployment or post-deploy acceptance fails, it restores the prior image on the existing Machine and checks public recovery; the job still fails. Worker source/process checks do not replace a durable task acceptance test. The separate deployment summary distinguishes disabled, blocked and deployed states.

GHCR promotion requires the latest main CI for the exact source to have succeeded; a newer failed or incomplete rerun cannot borrow an older success. Pull requests retain read-only validation without publishing authority. Immutable manifests and attestations complete for every image before a shared serialized job preflights the entire set. That job checks main and the latest exact-source CI once at the write boundary, then promotes all edge tags from the same source decision. A stale source cannot move any edge tag. Individual registry writes are sequential; pin the same full SHA tag across images for a fixed release. Production Fly builds are source-addressed and do not consume mutable GHCR edge tags.

### Restore password recovery using existing SMTP

At the audit baseline, hosted capabilities reported password recovery disabled and the secret-name inventory lacked `SMTP_URL` and `EMAIL_FROM`. The later preview probe reports `passwordReset=true`; actual mailbox delivery and reset-link acceptance are still unverified. When recovery is disabled, supply the existing SMTP transport and verified sender through an ignored private file or Fly's secret input; never put values in a command committed to Git, public logs, mobile extra or a frontend environment.

For example, prepare a private, untracked file containing `SMTP_URL=<existing SMTP connection>` and `EMAIL_FROM=<verified sender>`, restrict its permissions and confirm `git check-ignore` accepts its path. An authorized operator can import that file with `fly secrets import --app kith-api < <private-file>`. This changes production credentials and requires explicit operator authorization. Do not add another email vendor.

After configuration, verify `/api/auth/capabilities` returns `passwordReset=true`, request recovery for a dedicated test mailbox, inspect actual delivery privately, consume the link once and verify the previous session/reset security behavior. Record only status, timestamps and source SHA in public evidence. No mailbox, reset URL, token or message body belongs in CI artifacts. The deployment preflight blocks rollout while known password-recovery incompatibility remains.

### Rollback without replacing data

The protected Ubuntu deployment uses process deadlines: ten minutes for the new image, thirty seconds per SSH probe, ten seconds per public request, and five minutes to restore the prior image. Five acceptance attempts remain bounded, leaving recovery time within the thirty-minute workflow. A timeout follows the same failed-deployment recovery path.

Use the prior immutable digest recorded in the deployment summary:

```sh
fly deploy --app kith-api --config infra/fly/fly.toml --image <previous-registry-image@sha256:digest> --ha=false
```

Check rollback compatibility before approving the protected deployment. Automatic recovery restores application code only and leaves forward-applied migrations in place. Do not reverse migrations, replace the volume, destroy the Machine or rotate app secrets. Verify internal API/worker revision and a harmless persisted-task journey after rollback; public liveness alone is not complete recovery acceptance. Retain failed rollout diagnostics without publishing secrets.

### Preview configuration and acceptance

The branch's Preview environment now has the existing server-only `API_PROXY_TARGET`; the app build succeeds and its auth-capabilities endpoint responds. The marketing branch preview also has explicit public site and app origins. These configuration changes do not alter production. Authenticated preview acceptance remains separate: `AUTH_PROXY_SECRET` must match the intended backend's protected handoff, and an isolated acceptance backend is preferred. Do not prefix server secrets with `VITE_` or `EXPO_PUBLIC_`, expose them to contributor code, or remove build validation. Verify actual auth proxying before calling the preview fully ready.
