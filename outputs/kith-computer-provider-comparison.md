# Kith computer provider decision

Research date: 2026-10-09. Scope: hosted conversation-first personal agents, persistent files/browser profiles, browser and desktop control, operator-owned credentials, isolated workspace data. Assumption: initial small multiuser deployment; no committed monthly sandbox budget.

## Decision

Use **E2B Desktop** initially, through the existing provider-neutral sandbox adapter. Keep Daytona supported. Keep no-computer conversations fully functional.

Daytona initially looked better for long-lived filesystem persistence and usage-only pricing. Current official documentation reveals an important mismatch for an initial general-purpose browsing product: Tier 1 and 2 restrict internet access, and Tier 3 requires a $500 top-up. E2B has no equivalent restriction stated in the reviewed documentation, and Hobby supports 20 concurrent computers without a recurring base fee. Actual browsing must still be verified, rather than inferred from the pricing page.

## Comparison

Scores are engineering judgments, not vendor claims; 5 is best. Weighted fit 40%, price 25%, integration 20%, operations 15%.

| Provider | Fit | Price | Integration | Operations | Weighted / 5 | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| E2B Desktop | 5 | 4 | 5 | 4 | 4.60 | Initial deployment; existing desktop adapter and pause/resume |
| Daytona | 4 | 3 | 5 | 4 | 3.95 | Good alternative after unrestricted network access is enabled |
| Self-hosted Docker | 3 | 3 | 5 | 2 | 3.25 | Retain for self-hosting; additional isolation and host operations for public service |

Both managed providers already have implemented adapters with deterministic offline contract coverage. This is a configuration choice, not a new vendor-specific orchestration design. E2B uses managed Desktop sandboxes; Daytona currently uses its container path. Daytona VM isolation is available from the vendor but is not implemented by the current adapter.

E2B Hobby: $0 recurring base, usage extra, 20 concurrent sandboxes, sessions up to 1 hour. Pro: $150/month plus usage, 100 concurrent sandboxes, sessions up to 24 hours. Its published default 2 vCPU / 4 GiB pricing computes to **$0.1656 per running hour**, or $16.56 per 100 running hours, excluding model, API/worker, database and bandwidth costs. Actual Desktop template resource allocation must be checked on the account. Pause preserves disk and memory; app-controlled inactivity and provider timeout pause stop idle runtime.

Daytona compute rates are equivalent at 2 vCPU / 4 GiB, plus reserved disk billing where applicable. Container stop preserves filesystem but not process memory. Archiving preserves files and releases disk quota. Default archive is seven days stopped. Tier 3 requires $500 top-up for full internet access; a top-up is prepaid balance, not a monthly subscription charge.

## Product configuration

- Operator credentials stay on the API/worker host: sandbox key, OpenRouter key and existing Composio application key.
- Deployment-wide OpenRouter is a fallback; existing user model connections retain their existing precedence.
- Computers are provisioned on demand through existing authorized workspace/bot contracts. Team computers intentionally share within their workspace; different workspaces do not share a home or browser profile.
- Idle timeout remains ten minutes. Set the existing provider-neutral computer cap to four per user for the initial rollout. The per-space setting applies only to the Docker supervisor and is not a managed-provider cap. These are resource-count limits, not a spending or token-budget guarantee.
- Computer screens and terminals use the existing authenticated backend proxy on the persistent host, including its WebSocket path. Provider keys never reach the frontend.
- Users authorize their own email/calendar and other personal accounts. An operator integration API key does not authorize copying the operator's connected account to every user.
- No provider: run chat normally and omit computer tools. Do not retry nonexistent computer provisioning before a model call.

## Verification and limits

Offline regressions prove thread snapshots accept the `none` provider, model runs complete without computers, unavailable computer tools are blocked, and the existing computer paths retain their behavior. Production provider activation requires real credentials and real provisioning, desktop, command, browsing and persistence checks. A health endpoint alone is not provider proof. No market-wide uptime or independent reliability ranking is claimed; public vendor testimonials were not used as independent evidence.

## Live verification on the deployment date

The supplied E2B credential successfully provisioned a real Desktop sandbox. The existing adapter prepared the desktop, returned a screenshot, executed a shell command reaching `https://example.com`, and retained a written file after pause/resume with the same provider reference. The standalone probe sandbox was destroyed after verification.

The hosted web app returned a real model response (`CHAT_OK`). Its agent then wrote and read a synthetic workspace file and reached the test site with HTTP 200. The authenticated Fly screen gateway completed a WebSocket upgrade and delivered the VNC protocol greeting. Shared E2B and OpenRouter credentials are stored as backend deployment secrets; application credentials are not added to frontend configuration.

A Daytona probe also provisioned, prepared the desktop and retained files after stop/start, but its external HTTPS command failed with curl exit 35. That result is consistent with a networking limitation but does not independently establish the account tier or prove its cause. The probe sandbox was destroyed. The initial provider decision follows the documented network-tier requirements plus E2B's successful live browsing check.

The real noVNC viewer exposed a socket-routing bug that direct WebSocket probes missed: stock noVNC resolves a path relative to its capability page when no host is configured. The previous URL duplicated the capability directory and omitted the nested provider socket token, causing upstream 502 responses. Issued URLs now explicitly configure the gateway host, port and encryption so stock noVNC uses the correct public socket path. A regression reproduces both its host and relative URL behavior with HTTP and HTTPS gateway origins. The original fake-client probes prepended a slash and therefore did not cover this vendor-client behavior.

The complete stock noVNC desktop, including Chrome and human control, was then visually verified using a newly issued production URL without modifying its parameters. The temporary human control lease was released after verification.

The gateway also retries transient handshake failures at most three times, rechecks current authorization before each retry, and stops retrying after any established stream or forwarded handshake. Client frames are never replayed. Offline browser tests cover recovery, exhausted retry budget, authorization revocation, response isolation and both gateway modes.

## Final validation boundary

The initial complete workspace type check passed. After the final routing change, focused core and worker type checks and formatting for all changed implementation files passed. The relevant offline suites and fourteen proxy browser tests passed, and the isolated production image built successfully. Concurrent API and localization edits outside this deployment snapshot later introduced full-workspace type/format failures; they were preserved rather than deployed with this fix.

An additional type-check attempt on the production machine exceeded its runtime resource budget and degraded health checks. It was stopped and the service restarted. Final health checks passed, and the authenticated hosted thread returned HTTP 200 with both verification replies, no active test run, and the E2B computer still available. Further full compile/test work belongs in an isolated build environment, not the serving machine.

## Primary sources

- [E2B pricing](https://e2b.dev/pricing)
- [E2B persistence](https://docs.e2b.dev/sandbox/persistence)
- [E2B Desktop source and SDK](https://github.com/e2b-dev/desktop)
- [Daytona pricing](https://www.daytona.io/pricing)
- [Daytona computer use](https://www.daytona.io/docs/en/computer-use/)
- [Daytona persistence](https://www.daytona.io/docs/en/persistence/)
- [Daytona network restrictions](https://www.daytona.io/docs/en/network-limits/)
- [Daytona quotas and tier requirements](https://www.daytona.io/docs/en/limits/)
- [Daytona isolation](https://www.daytona.io/docs/en/isolation/)
