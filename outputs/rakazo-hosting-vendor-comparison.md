# Rakazo hosting comparison

Research date: October 8, 2026. USD, before tax.
Use case: hosted Rakazo with background agents, routines, memory, integrations, remote computers, and shared web/desktop/mobile access.
Budget: unspecified. Estimates assume a small beta, one developer seat, one region, and modest concurrency; they are not capacity guarantees.

## Recommendation

Use Vercel for the frontend, Fly.io for persistent backend processes and the authenticated computer gateway, Neon for PostgreSQL, and an existing remote-computer adapter such as Daytona. This preserves the architecture with deployment and gateway changes. It is managed hosting, not a deployment that scales entirely to zero.

For the first deployment, keeping the web server alongside API and worker on Fly is the smallest change. The existing Vite server performs authenticated screen proxying, so publishing only its static build on Vercel would omit runtime functionality. Move that gateway to the backend before separating the web frontend.

## Repository evidence

- `apps/worker/src/index.ts` starts Graphile workers and continuous reconciliation, creates local home/artifact stores, and runs Pi with a disk-backed session root.
- `apps/api/src/app.ts` creates the same local stores and PostgreSQL realtime service and enables inbound messaging polling.
- `apps/web/vite.config.ts` implements HTTP and WebSocket computer proxies in development and preview middleware.
- `docs/host-deployment.md` requires persistent processes, a shared data directory, and direct database connections for the worker/listeners.
- `docs/computer-runtime.md` documents portable workspace checkpoints and shared/private computers across remote adapters.

These are code/document findings, not evidence of a working hosted deployment. Existing uncommitted host-deployment work was inspected and preserved.

## Comparison

Judgment scores weight core fit 40%, cost 25%, integration fit 20%, and operational risk 15%. They assess the current repository, not general platform quality.

| Option | Pricing basis | Core fit | Integrations | Support / operational considerations | Overall |
| --- | --- | --- | --- | --- | --- |
| Vercel + Fly + Neon | Estimated $60–100/month base | Persistent API/worker and gateway; limited initial scaling | Reuses Graphile, Pi, Postgres, remote sandbox adapters | Community support; optional paid Fly support; initial machine is a single failure domain | 9/10 |
| Vercel + Railway + Neon | Resource usage; Railway Pro has a $20 minimum including usage credit | Similar fit; easiest with backend processes colocated | Existing Node/container stack | Pro includes Railway support; volume deployments have scaling constraints | 8/10 |
| Vercel-centric serverless redesign | Vercel plan plus functions, workflows, storage, database, and sandbox usage | Technically plausible; substantial orchestration/storage changes | New workflow, persistence, and sandbox adapters needed | Some relevant capabilities are beta; checkpoint/reconnect/replay behavior needs proof | 5/10 |

Best overall: Fly hybrid. Budget option: keep the app web/API/worker together on Fly and avoid a separate paid frontend plan if it is unnecessary. Railway is a reasonable alternative for deployment convenience. Highest-risk choice for immediate parity: an all-functions rewrite.

## Storage and deployment constraints

API and worker currently need the same filesystem. A Fly volume attaches to one Machine and is not replicated/shared across Machines. Initially run API, worker, and gateway as supervised processes on one always-on Machine with an encrypted volume and off-host backups. This is a beta topology with deploy/recovery downtime, not high availability. [Fly volume documentation](https://docs.fly.io/volumes/overview)

Before splitting or replicating processes, implement shared durable storage for homes, artifacts, Pi sessions, and other disk state, with explicit checkpoint ownership. Existing storage interfaces help, but Pi and other direct filesystem consumers still need an audit. Railway volumes also constrain replicas and deployments. [Railway volumes](https://docs.railway.com/volumes/reference)

Keep pooled application queries separate from direct worker/realtime database sessions. Continuous workers/listeners can keep Neon awake. Trusted commands on a user's own computer still require a local runtime or authenticated bridge; cloud hosting cannot provide access to that machine by itself.

## Cost model

Planning allowance, excluding model inference, voice, integrations, remote-computer usage, and engineering work:

| Item | Monthly estimate |
| --- | --- |
| Vercel Pro, one developer seat | $20 plus overages |
| Fly shared CPU machine, 2–4 GB RAM | Approximately $13–30 depending on configuration/region |
| Persistent disk and backup allowance | $3–10 |
| Neon, average 0.25–0.5 CU continuously active | Approximately $20–40 including modest data storage |
| Base budget, rounded | $60–100 |

Published inputs: [Vercel pricing](https://vercel.com/pricing), [Fly pricing](https://docs.fly.io/about/pricing), [Neon plans](https://neon.com/docs/introduction/plans). Neon compute at $0.106/CU-hour gives $19.08 for 0.25 CU over 720 hours and $38.16 for 0.5 CU; 5 GB storage adds $1.75. These are illustrative average sizes, not measured requirements. Additional backups, history retention, egress, and support may add cost.

For an illustrative Daytona Linux computer with 2 vCPU and 4 GiB RAM, the published rates yield $0.1656 per running hour, excluding storage/transfer and credits: 100 aggregate hours costs $16.56; 1,000 hours costs $165.60; one computer running for 720 hours costs $119.23. Count running time, including idle time. Actual provisioning size must be verified. [Daytona pricing](https://www.daytona.io/pricing)

E2B is already supported, but its current Pro plan costs $150/month before compute usage; Hobby sessions are limited to one hour. Check those limits before selecting it for persistent computer use. [E2B pricing](https://e2b.dev/pricing)

Railway's Pro minimum is a usage floor, not an extra $20 on top of all resource usage. Actual cost depends on memory/CPU consumption. [Railway pricing](https://railway.com/pricing)

## If serverless is a requirement

Replace the persistent Graphile host/reconciler with durable workflows and scheduled recovery; split agent execution into bounded resumable steps; move durable state off local disk; make realtime subscriptions reconnect and replay from persisted events; use webhook delivery instead of process-bound polling; and implement a remote computer adapter/gateway. Preserve authorization, cancellation, leases, and uncertain external-action reconciliation across retries.

Vercel Functions have an 800-second generally available maximum on Pro/Enterprise, with a 1,800-second extended maximum in beta. Workflows can pause/resume across much longer periods, but individual execution steps still use Functions. [Function limits](https://vercel.com/docs/functions/limitations), [Workflows](https://vercel.com/docs/workflows)

Vercel now supports WebSockets in public beta; connections remain bounded by function lifetime and require reconnect handling. Its Services feature groups deployments/routing and does not eliminate the worker/storage changes above. [WebSockets](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), [Services](https://vercel.com/docs/services)

Vercel Sandbox supports sessions up to 24 hours on Pro/Enterprise and persistence between sessions. Rakazo does not currently have a Vercel sandbox adapter; desktop, terminal, checkpoint, and reconnect parity would need implementation and verification. [Sandbox duration and persistence](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence)

## Acceptance before claiming parity

Verify hosted agent execution after client disconnect, routine delivery, restart recovery, cancellation/approvals, remote desktop/terminal takeover, checkpoint restore after computer replacement, file upload/download, auth, and shared web/Electron/mobile connectivity. Offline conformance tests and live provider acceptance serve different purposes; passing one does not establish the other.

## Evidence limits

No load test, provider provisioning, or deployment was performed. Costs are calculated scenarios. No broad user-sentiment or support-quality ranking was attempted; this recommendation rests on repository compatibility and official documentation. No runtime application files were changed.
