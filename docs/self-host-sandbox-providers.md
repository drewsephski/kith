# Self-host sandbox / computer providers

`SANDBOX_PROVIDER` selects where bot computers run. Workspace bots share a Team Computer by
default; Private Computers are optional. See [computer runtime and isolation](./computer-runtime.md)
for the sharing and persistence contract.

## Quick pick

| Goal | Set | Also need |
| --- | --- | --- |
| Local Docker computers | `SANDBOX_PROVIDER=docker` | `SANDBOX_SUPERVISOR_TOKEN`, computer image, Docker socket for supervisor |
| Chat without computers | `SANDBOX_PROVIDER=none` | No provider credential; published-images Compose still requires `SANDBOX_SUPERVISOR_TOKEN` |
| Managed remote desktop | `e2b` / `daytona` / `box` | `SANDBOX_SUPERVISOR_TOKEN` (published-images Compose), matching API key (and optional URL knobs for Daytona/Box) |

Published-images [Compose](../infra/compose/docker-compose.images.yml) defaults to **`docker`**.
It always starts the supervisor and requires `SANDBOX_SUPERVISOR_TOKEN`, including for `none`
and remote providers. This stack credential does not replace a remote provider's API key.

## `docker` (in-stack supervisor)

Compose starts a **sandbox supervisor** (from the app image) on the internal
network (port `7091` in published-images). It creates sibling **computer**
containers from `RAKAZO_COMPUTER_IMAGE` + `RAKAZO_COMPUTER_IMAGE_TAG`.

Requirements:

- Non-empty `SANDBOX_SUPERVISOR_TOKEN` (distinct from auth / screen / encryption secrets)
- Reachable computer image (GHCR default or your mirror; on arm64 pin multi-arch tags for both app and computer)
- Docker Engine available to the supervisor (socket mount on the Compose path)

Verify:

```bash
curl -fsS http://127.0.0.1:3100/internal/health
# expect sandbox: docker
```

Missing supervisor token is a **setup failure**: do not treat `sandbox: "none"` as success for this path.

Signup and local Docker computers work **without** an E2B (or other remote) account.

## `none`

Runs API, worker, and web without provisioning bot computers. Conversations, model calls,
memory, and configured integrations remain available. Filesystem, shell, and desktop tools
are omitted from runs. A model connection or deployment-wide model credential is still required.

## Remote providers

Set `SANDBOX_PROVIDER` to exactly one of:

| Value | Credential | Notes |
| --- | --- | --- |
| `e2b` | `E2B_API_KEY` | Hosted sandboxes |
| `daytona` | `DAYTONA_API_KEY` | Optional `DAYTONA_API_URL`, `DAYTONA_TARGET`, `DAYTONA_SNAPSHOT` |
| `box` | `BOX_API_KEY` | Optional `BOX_API_URL` (see `.env.example`) |

Remote paths still need a working API/worker; they do not replace Postgres or
the web UI. They require egress to the provider. For air-gapped hosts prefer
`docker` with pre-loaded images, or `none`.

## Idle resources

Computers pause or stop after five idle minutes by default (`SANDBOX_IDLE_MS=300000`).
Visible computer viewers, active runs, and tracked bot-launched background commands keep them
awake. Runs waiting for input can sleep once their checkpoint is durable and no background
work remains. Hidden web/Electron views and backgrounded or unfocused mobile screens do not send
viewer keepalives or renew screen URLs. The next computer action reconnects on demand.

For E2B, idle means **pause**, preserving files and memory under the same sandbox ID. The
shared worker checkpoints the portable workspace before pausing and checks again for active
work before completing suspension. Failed pauses retain the running state and retry. E2B also
auto-pauses if the API/worker disappears; its timeout includes a one-minute grace period for
the worker checkpoint. A provider pause can disconnect network clients; reopening the computer
reconnects the viewer. Provider outages and runtime limits can still interrupt execution.

Delete/reset uses `kill`, including direct deletion of paused sandboxes without resuming them.
Do not kill reusable idle sandboxes: this permanently deletes their process and memory state.
Paused sandboxes are retained by E2B until explicitly deleted. Auto-resume on inbound traffic
is disabled so stale screen URLs cannot wake billable compute.

Existing deployments keep their explicit timeout; change `SANDBOX_IDLE_MS` and restart the
API and worker to adopt the five-minute policy. `0` disables the app-owned idle job, but E2B
still uses its bounded auto-pause timeout. The minimum idle window is 30 seconds. Keep provider
spending limits enabled and monitor running sandboxes in the E2B dashboard. See E2B's
[persistence](https://docs.e2b.dev/sandbox/persistence) and
[billing](https://docs.e2b.dev/billing) documentation.

## Verify a provider change

After changing provider or keys (from the published-images drop directory that
holds `docker-compose.images.yml` and `.env`):

```bash
docker compose --env-file .env -f docker-compose.images.yml up -d
curl -fsS http://127.0.0.1:3100/internal/health
```

Confirm `sandbox` equals the intended provider (`e2b`, `daytona`, or `box`).
HTTP 200 alone does not verify a remote provider: a missing API key falls back to `sandbox: "none"`.
A present but invalid key still reports the selected provider. Open a bot's computer to verify
provisioning and desktop access.
