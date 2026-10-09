# Contributing to Rakazo

Thanks for helping improve Rakazo. Keep changes focused and testable.

## Run locally

You need Node.js 22.22.2 or newer in the 22.x line, Node.js 24.x, or Node.js 26+;
pnpm 9; and Docker. Node.js 23.x and 25.x are not supported.

```bash
git clone https://github.com/elie222/rakazo.git
cd rakazo
cp .env.example .env
```

Set `POSTGRES_PASSWORD` (for example `openssl rand -hex 16`), then put the same value in
`DATABASE_URL`. Set `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, and `SCREEN_PROXY_SECRET` to
independent long random values. Docker sandboxes also need a dedicated
`SANDBOX_SUPERVISOR_TOKEN`. You can also set `OPENROUTER_API_KEY`, or connect a supported
model provider during onboarding.

For host-side development with Docker Desktop, set `SANDBOX_CONTROL_VIA_LOOPBACK=true`
in `.env`. The supervisor discovers Docker Desktop's user socket automatically;
`DOCKER_HOST` or `DOCKER_SOCKET` can override it for another Docker runtime.

Managed app catalogs are optional. Set `COMPOSIO_API_KEY` for Composio, or the
`PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET`, and `PIPEDREAM_PROJECT_ID` trio for Pipedream
Connect. Users can add an HTTPS MCP server, Treg endpoint, or OpenAPI JSON document from
**Integrations** without enabling either managed catalog. Connector credentials are encrypted on the
server and are never returned by the API.

Treg is usage-metered. Self-hosters supply their own Treg token; operators embedding Treg in a
hosted product should review [Treg's integration terms](https://treg.to/integrate.md), which require
a written agreement for hosted resale.

```bash
docker compose --env-file .env \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.postgres-host.yml \
  up postgres -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build
pnpm dev
```

Postgres stays network-internal in the default Compose file (same as published images). The
`postgres-host` overlay publishes loopback `127.0.0.1:5433` for host-side `pnpm` and DB tools.
If that port is occupied, change `POSTGRES_HOST_PORT` and the port in `DATABASE_URL` in `.env`.
Without the overlay, open a shell with
`docker compose --env-file .env -f infra/compose/docker-compose.yml exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.
Use a URI-safe `POSTGRES_PASSWORD` (`openssl rand -hex 16`). An existing `pgdata` volume keeps the
user, password, and database from first init, so keep those values in `.env`, or change them in
place with `ALTER ROLE` / rename. Recreate the volume only after a backup (or when the data is
disposable); `docker compose down -v` deletes all Postgres state.
`pnpm compose:down` preserves data; `pnpm compose:reset` deletes PostgreSQL data and requires a
backup or a disposable database.

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), create an account, connect a model, and create
your first bot.

For deployment, provider selection, backups, and upgrades, see the
[self-hosting guide](./docs/self-host.md).

To use CreateOS, set `SANDBOX_PROVIDER=createos` and `CREATEOS_SANDBOX_API_KEY`.
Optional `CREATEOS_SANDBOX_BASE_URL`, `CREATEOS_SANDBOX_SHAPE`, and
`CREATEOS_SANDBOX_ROOTFS` default to `https://api.sb.createos.sh`, `s-2vcpu-2gb`,
and `desktop:1`.

For a setup without Docker, follow the [host deployment guide](./docs/host-deployment.md).

## Checks before you open a PR

| Command | When to run |
| --- | --- |
| `pnpm test` | Default. Units, properties, and in-process contracts. Scripted runtime, fake sandbox, in-memory wakeup — no live connector or model-provider calls. |
| `pnpm test:integration` | Postgres via Testcontainers: product journeys, authorization, executor lifecycle, Graphile / LISTEN/NOTIFY. Needs Docker. |
| `pnpm test:e2e` | Playwright against the emulated API. Needs Docker. |
| `pnpm test:topology` | Local product-path smoke: Docker computer + Graphile worker recovery. Needs Docker. Not PR CI. |
| `pnpm test:canary` | Live provider canaries. Needs keys. Not PR CI. |
| `pnpm test:pi` | Real Pi against a local HTTP model fixture: streaming, tool round trips, failures and cancellation. No keys. |
| `pnpm test:computer-replay` | Real Pi and Docker Chromium against a local model fixture. Needs the computer image; no keys or Electron windows. |
| `pnpm test:evals --list` | List agent-quality cases. Add `--live` and a model connection to measure repeated real-model task success. |
| `pnpm test:computer` | Real vision model + E2B desktop. Needs keys; see [computer verification](docs/computer-runtime.md#verification). Not PR CI. |
| `pnpm check` | TypeScript (`tsc`) across the monorepo. |
| `pnpm lint` | Biome lint and format check. |

CI runs `pnpm lint`, `pnpm check`, production builds (including Electron preload smoke), `pnpm test`, `pnpm test:integration`, and `pnpm test:e2e` on every PR.

Ordinary test processes (`NODE_ENV=test`) do not load the checkout's `.env`.
Verification CLIs load configuration before starting isolated test processes;
live canaries explicitly enabled with `VERIFY_PROVIDERS` also opt into loading it.

## Adding a UI language

The web and Electron-hosted UI use Lingui catalogs. To add a locale, register it in
`apps/web/lingui.config.ts`, `apps/web/src/lib/ui-locale.ts`, and
`apps/web/src/lib/i18n.ts`, then run `pnpm --filter @rakazo/web intl:extract`, fill the new
`apps/web/src/locales/<locale>/messages.po` catalog, and validate it with
`pnpm --filter @rakazo/web intl:compile`. Keep message IDs, placeholders, JSX markers, and
ICU plural branches intact; do not commit generated `*.js`/`*.mjs` catalog files.

Expo mobile has its own catalog and locale registry. Add the locale to
`apps/mobile/lib/ui-locale.ts`, add `apps/mobile/lib/locales/<locale>.ts`, and register the
catalog in `apps/mobile/lib/i18n.ts`. Web PO entries do not translate mobile automatically.
Update the locale unit tests and a UI E2E scenario for each supported surface. The marketing
homepage in `apps/www` and the native Electron setup window have separate localization paths;
scope and test those changes explicitly instead of assuming the web catalog covers them.

See [agent verification](docs/agent-verification.md) for the distinction between
deterministic execution tests, computer replay, and real-model quality evals.

## Optional live-provider checks

The default Playwright suite uses the fake sandbox. To run the same scripted-agent suite against
real computers, set the matching `E2B_API_KEY`, `DAYTONA_API_KEY`, or `BOX_API_KEY` and choose a provider:

```bash
pnpm test:e2e -- --sandbox=e2b
pnpm test:e2e -- --sandbox=daytona
pnpm test:e2e -- --sandbox=box
```

The Playwright workflow also accepts these providers through its manual **Sandbox provider** input.
These runs provision real machines and destroy them after the suite. Automatic runs use `fake`.
For the separate real-model desktop acceptance test, see
[computer verification](docs/computer-runtime.md#verification).

## Secrets and configuration

- **Never** commit `.env` files or secrets.
- **Never** paste API keys, tokens, or passwords in issues or PRs.
- Use placeholders in examples (`your-openrouter-key`, etc.).

The product path is **Pi + Docker + Graphile**. Emulator settings (`AGENT_RUNTIME=scripted`, `SANDBOX_PROVIDER=fake`, `WAKEUP_DRIVER=memory`) are for tests only.

**Integrations** can use [Composio](https://composio.dev/) or Pipedream Connect as optional managed
app catalogs. Users can also install HTTPS MCP servers (including Treg) and bounded OpenAPI tool
sources. Connector tests must stay deterministic and offline. Never put connector credentials in
capability config, fixtures, logs, or snapshots; use the encrypted secret store and fake placeholders.

## Pull requests

- Keep PRs small and easy to review.
- Target the `main` branch.
- Describe why the change is needed, what changed, and **how you tested** (e.g. `pnpm test`, manual steps).
- Link related issues when applicable.

## Contact

| Address | Use for |
| --- | --- |
| [security@rakazo.com](mailto:security@rakazo.com) | Vulnerabilities only — see [SECURITY.md](SECURITY.md) |
| [support@rakazo.com](mailto:support@rakazo.com) | User and support questions |
| [elie@rakazo.com](mailto:elie@rakazo.com) | Maintainer |
