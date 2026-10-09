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
private, ignored `.env.hosted` file; replace the example URLs and secret values:

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
```

Generate each of the three application secrets independently with `openssl rand -hex 32`.
Keep them stable across redeployments; changing `ENCRYPTION_KEY` makes existing encrypted
provider credentials unreadable. `DATABASE_DIRECT_URL` may be omitted when `DATABASE_URL`
already uses a direct endpoint. Never use a transaction-pooled endpoint for both settings.
Optional `REALTIME_DATABASE_URL` must also be a direct endpoint of the same database.

Import the file without putting secret values in command arguments, then deploy:

```bash
fly secrets import --app "$KITH_BACKEND_APP" < .env.hosted
fly deploy --app "$KITH_BACKEND_APP" --config infra/fly/fly.toml --ha=false --remote-only
```

The image installs frozen dependencies, generates Prisma, and builds the gateway. Its static
build uses development-secret defaults only inside the build command; production services
require real runtime secrets. At startup the entrypoint verifies that `/data` is mounted,
repairs ownership without following symlinks, drops to the `node` user, applies Prisma
migrations, and starts the three supervised services. Prisma advisory locks serialize
migration attempts. A child service failure stops the stack, and Fly restarts the Machine.

`SANDBOX_PROVIDER=none` is the default. To enable computers, configure an existing remote
provider as described in [computer providers](./self-host-sandbox-providers.md). The provider
credential remains on Fly; no Docker socket or sandbox supervisor is exposed by this image.
Model connections and other optional services keep their existing setup flows.

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

Set it for every deployment environment that should reach this backend. Use a separate
backend/database for previews that need isolation; production provider credentials belong
only on the production backend.

The build validates a public, credential-free HTTPS root URL and generates the Vercel Build
Output API directory. It copies the built assets, emits external API/RPC/screen HTTP rewrites
with explicit `no-store` headers, forwards `/health`, and keeps SPA navigation working.
Missing or malformed proxy configuration fails the build. Vercel needs no database,
Composio, encryption, or auth signing secrets.

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
Monitor disk capacity, failed jobs, and memory use; the initial Fly Machine requests 2 GB.
Keep deployments at one Machine with the existing volume. Recovering to a new host requires
restoring both stores and importing the same encryption/signing configuration.

References: [Fly app configuration](https://fly.io/docs/reference/configuration/),
[Vercel external rewrites](https://vercel.com/docs/routing/rewrites), and
[Vercel Build Output API](https://vercel.com/docs/build-output-api/configuration).
