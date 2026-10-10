# Docker-free host deployment

Run Kith's web app, API, and worker directly with Node and pnpm. PostgreSQL can be a native
installation or a managed service such as Neon. Bot computers can use an existing remote
provider, or be disabled. This deployment does not start Docker or the sandbox supervisor.

The API and worker remain long-running processes: agent execution, Graphile jobs, and recovery
must continue after a browser request ends. This is not a serverless-functions deployment.

## Setup

Use a Node version supported by the root `package.json` and pnpm 9. From the checkout root:

```bash
pnpm install --frozen-lockfile
# Only if .env does not exist; otherwise edit the existing file.
cp .env.example .env
```

Configure `.env`:

```dotenv
DATABASE_URL=postgresql://example:REPLACE_WITH_PASSWORD@db.example.test/rakazo?sslmode=require
DATABASE_DIRECT_URL=
REALTIME_DATABASE_URL=
SANDBOX_PROVIDER=none
DATA_DIR=./data
BETTER_AUTH_URL=http://127.0.0.1:5173
WEB_ORIGIN=http://127.0.0.1:5173
API_URL=http://127.0.0.1:3100
```

Replace `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, and `SCREEN_PROXY_SECRET` with three independent
random values (generate each with `openssl rand -hex 32`). Keep the environment file private.
`POSTGRES_*`, the Docker socket, and `SANDBOX_SUPERVISOR_TOKEN` are not required by host mode.

`none` disables bot computers while leaving chat and other non-computer capabilities available.
For browser, shell, or desktop work, choose an existing remote provider and set its credential:
`e2b` / `E2B_API_KEY`, `daytona` / `DAYTONA_API_KEY`, `createos` / `CREATEOS_SANDBOX_API_KEY`, or
`box` / `BOX_API_KEY`. See [computer providers](./self-host-sandbox-providers.md). A missing
credential disables that provider; verify provisioning with a real bot before relying on it.

```bash
pnpm db:generate
pnpm db:migrate
pnpm dev:host
```

Open `http://127.0.0.1:5173`, create an account, and connect a model. Model credentials are optional
at startup. Host mode refuses `SANDBOX_PROVIDER=docker`; use `pnpm dev` for the local Docker stack.

## Neon and transaction pooling

Create a PostgreSQL database and copy its connection URLs into `.env`. For Neon, the Connect
dialog supplies a pooled URL and a direct URL when you toggle connection pooling. Retain the TLS
options supplied by the provider. Both URLs must point at the same database and use a role with
permission to apply the application and Graphile migrations.

| Setting | Use |
| --- | --- |
| `DATABASE_URL` | API application queries; pooled or direct |
| `DATABASE_DIRECT_URL` | Prisma migrations, API job/realtime publication, and the worker's database pool; direct only |
| `REALTIME_DATABASE_URL` | Optional direct listener override; otherwise uses the direct URL |

When no direct URL is set, all paths retain the existing `DATABASE_URL` behavior. An empty value
counts as unset. On direct-only deployments, the API reuses its existing pool. When the endpoints
differ, it opens a bounded direct pool for jobs and realtime publication. The worker shares a
single direct pool across Prisma, Graphile, and reconciliation leadership.

Do not use a transaction-pooled URL for the worker or realtime listener. They depend on `LISTEN`
and session advisory locks. A Neon database is compatible with these PostgreSQL features through
its direct endpoint; the serverless HTTP query driver does not replace these persistent sessions.
See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

Continuous listeners and worker polling can keep managed database compute active; do not assume
this deployment scales to zero. Size the database for both processes' pools and listener sessions.
`DB_POOL_MAX` limits each pool, not the total connection count across services.

## Production

Set the public HTTPS origin and a durable data location:

```dotenv
BETTER_AUTH_URL=https://app.example.test
WEB_ORIGIN=https://app.example.test
API_URL=http://127.0.0.1:3100
API_HOST=127.0.0.1
RAKAZO_HOST=app.example.test
DATA_DIR=/srv/rakazo/data
```

The API and worker must share that directory. A single host with a persistent disk works;
separate hosts need the same shared filesystem. An ephemeral function filesystem is unsuitable.
Back up both PostgreSQL and this directory. The existing Compose backup scripts are for Docker
deployments; use the managed database's backup facilities or `pg_dump` on the direct endpoint,
and back up the shared directory separately.

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @rakazo/web build
pnpm start:host
```

`start:host` forces production mode, preserves externally supplied configuration, resolves
`DATA_DIR` relative to the checkout, and runs only the API, worker, and built web app. It does
not run migrations automatically. Supervise this command with your host's process manager and
restart on failure. A service startup failure stops the other services through Turbo.

The web process uses the same Vite preview entrypoint as the existing application image, including
the authenticated API/RPC and screen proxies. Put HTTPS in front of port 5173 and forward WebSocket
upgrades for computer viewing/control. Keep API port 3100 private. Host mode has no Docker updater;
deploy source updates, run migrations once, rebuild, and restart the processes.

Electron connects through **Existing instance**, and Expo mobile connects to the same HTTPS
server. No separate database or orchestration changes are needed for native clients.

## Verification

```bash
curl -fsS http://127.0.0.1:3100/internal/health
curl -fsS http://127.0.0.1:3100/health
curl -fsS -o /dev/null http://127.0.0.1:5173/api/auth/get-session
```

The internal response should report `runtime: pi`, `jobs: graphile`, `realtime: postgres`,
`degraded: false`, and your selected sandbox (or `none`). The public endpoint returns only
`ok: true`. Confirm the worker logs `worker ready`. Finally, connect a model and send a message;
remote computer provisioning needs its own live check when computers are enabled.
