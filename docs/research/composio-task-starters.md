# Composio for task starters

Research date: 2026-10-09. Sources below are official provider documentation and pricing accessed on that date. This is a design recommendation; no user accounts, credentials, provider calls, or subscriptions were operated. Catalog availability does not prove successful account authorization or end-to-end execution.

## Recommendation

Use Composio Platform as Rakazo's first hosted integration adapter for these workflows. Keep task planning, account selection, permissions, evidence, recurrence, and recovery inside Rakazo's shared backend. Preserve direct/native adapters and MCP so the core product remains usable without a hosted integration vendor. Composio's own [existing-harness example](https://docs.composio.dev/examples/harness-integration) explicitly supports using its catalog/auth/execution underneath an application's planner without adding another agent loop.

For curated starters, execute a known sequence of narrowly scoped reads and validated writes. Generic discovery remains useful for open-ended conversation. An unrestricted session and prompt alone cannot guarantee the selected sources, complete mailbox coverage, or safe recurring writes. “In 10 seconds” should be an observed performance target after accounts are connected; it cannot include first-time OAuth consent or promise arbitrary CRM/LinkedIn enrichment.

## Current APIs and account binding

The current recommended interface is `@composio/core` sessions. [REST v3.1](https://docs.composio.dev/reference) is current at `https://backend.composio.dev/api/v3.1`; `/api/v3` remains supported with legacy version defaults.

```typescript
const session = await composio.create(opaqueApplicationUserId, {
  toolkits: ["gmail"],
  tools: { gmail: { enable: ["GMAIL_FETCH_EMAILS"] } },
  connectedAccounts: { gmail: authorizedAccountIds },
  manageConnections: false,
  sandbox: { enable: false },
  multiAccount: {
    enable: true,
    maxAccountsPerToolkit: 10,
    requireExplicitSelection: true,
  },
});

const result = await session.execute(
  "GMAIL_FETCH_EMAILS",
  { user_id: "me", query, max_results: 50, ids_only: true },
  { account: authorizedAccountId },
);
```

This illustrates the API shape, not a production implementation. Validate tool inputs/results and the account's local authorization first. The [multi-account guide](https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts) supports 2–10 accounts per toolkit, aliases, and required explicit account selection. Defaults select the most recently connected active account. `connectedAccounts` is an array per toolkit; restricting it establishes the session's accessible account set. The provider tool's `user_id: "me"` selects the mailbox of that connection; a Gmail email address is not a substitute for selecting the connected account.

The [TypeScript Session reference](https://docs.composio.dev/reference/sdk-reference/typescript/session) exposes `authorize(toolkit, { alias, callbackUrl })`, `execute(toolSlug, arguments, options)`, `toolkits()`, and `update()`. Use `authorize()` for a new account and its `redirectUrl` for consent; it always starts a new link flow. Persist a task/conversation session ID and restore with `composio.use(sessionId)` after checking local ownership. Do not treat a process cache as durable authority.

For direct provider requests, [Proxy Execute](https://docs.composio.dev/docs/extending-sessions/proxy-execute) is appropriate for precise field masks, pagination, and APIs poorly represented by a catalog tool. `session.proxyExecute({ toolkit, endpoint, method, parameters, body })` resolves an account from the session and currently has no explicit account argument. Pin that session to one account, or use the account-specific adapter path `composio.tools.proxyExecute({ connectedAccountId, endpoint, method, ... })`. Proxy requests follow toolkit filters but bypass per-tool and behavior-tag filters. Keep endpoint/method allowlists and response validation in the adapter.

## Capability evidence for the four starters

| Starter | Composio evidence | Product work still required |
| --- | --- | --- |
| Search all Gmail accounts | Gmail OAuth; `GMAIL_FETCH_EMAILS`, thread/message retrieval | Enumerate authorized accounts; bounded parallel fan-out; per-account pagination; merge/rank results; account/source attribution; distinguish partial failure from no results |
| Next meeting brief | Calendar, HubSpot, Gmail catalogs | Resolve next meeting and attendees; match CRM contacts by email/domain; fetch related notes/deals/threads; cite facts; optional enrichment; missing-source degradation |
| Inbox to-do list | Gmail reads supply source threads | Extract actionable obligations with source quotes, owner and deadline; avoid inventing priorities; store a reviewable local list; external task creation is a separate authorized action |
| Weekly analytics to Sheet | GA4 report/metadata tools and Sheets read/write tools | Select source/property/metrics, dates/timezone and destination; deterministic calculation; preview write; durable recurrence; write reconciliation and verification |

[Gmail's catalog](https://docs.composio.dev/toolkits/gmail) warns that `GMAIL_FETCH_EMAILS` defaults to one result, supports up to 500 per page, and requires following `nextPageToken`. `verbose: false` guarantees essential metadata but not bodies. `ids_only: true` avoids unnecessary hydration; fetch only relevant messages/threads afterward. Treat missing messages as valid empty results. Sort normalized timestamps locally and deduplicate within each account. The catalog's timezone descriptions should be cross-checked against Google's API before implementation; use explicit epoch boundaries for precise windows.

[HubSpot](https://docs.composio.dev/toolkits/hubspot) is the first CRM target. `HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA` supports exact email `filterGroups` and selected `properties`. `HUBSPOT_LIST_CONTACT_NOTES` returns IDs/associations, so retrieve note bodies separately. `HUBSPOT_LIST_OBJECT_ASSOCIATIONS` traverses contacts to deals; `HUBSPOT_GET_DEAL` reads chosen properties, and `HUBSPOT_READ_BATCH_CRM_OBJECT_PROPERTIES` can hydrate notes. Request the read scopes required by the chosen contact/company/deal endpoints. [HubSpot's note-read reference](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/get-note) lists `crm.objects.contacts.read`; do not invent a notes-specific scope. “CRM connected” does not prove these grants.

LinkedIn is the significant coverage gap. The [LinkedIn catalog's Markdown schemas](https://docs.composio.dev/toolkits/linkedin.md) show `LINKEDIN_GET_PERSON` requires a person ID scoped to the OAuth application. `LINKEDIN_GET_MY_INFO` reads the authenticated user. `LINKEDIN_GET_COMPANY_INFO` actually retrieves organizations where that user has administrative/content roles. These are not arbitrary meeting-attendee enrichment by email or profile URL. A catalog listing is insufficient evidence for the promised brief. Make LinkedIn optional, use an existing CRM profile link as evidence, and support a separately validated enrichment adapter if required. Do not make scraping a silent fallback.

[Google Analytics](https://docs.composio.dev/toolkits/google_analytics) is the GA4 target: `GOOGLE_ANALYTICS_LIST_ACCOUNT_SUMMARIES`, `GOOGLE_ANALYTICS_GET_METADATA`, `GOOGLE_ANALYTICS_CHECK_COMPATIBILITY`, and `GOOGLE_ANALYTICS_RUN_REPORT` use GA4 property resources. Select a property and validate metric/dimension API names. Google's official [Data API report](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport) is `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`, supporting `analytics.readonly`; [metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/getMetadata) is `GET .../properties/{id}/metadata`. These are precise proxy alternatives if catalog behavior is unsuitable. Gmail, Calendar, Analytics and Sheets remain distinct connected accounts/auth grants; do not assume one Google connection supplies every scope.

[Google Sheets](https://docs.composio.dev/toolkits/googlesheets) includes `GOOGLESHEETS_VALUES_UPDATE`, `GOOGLESHEETS_UPDATE_VALUES_BATCH`, and `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`; avoid deprecated `GOOGLESHEETS_BATCH_UPDATE` and `GOOGLESHEETS_SHEET_FROM_JSON`. For recurring output, prefer a known range or keyed rows over blind append, use `RAW` for untrusted text, persist write intent, and read back the affected range.

## OAuth, privacy, and production behavior

Managed OAuth minimizes prototype setup. For the public product, use the application's own OAuth clients where needed for recognizable consent, least privilege, dedicated quota, and privacy settings. [Scope control](https://docs.composio.dev/docs/authentication/controlling-scopes) lives on auth configs; changing scopes requires existing users to reconnect. Provider approval and organizational policy still apply. Composio-managed auth does not make Gmail restricted-scope verification or LinkedIn permissions disappear.

[Token custody](https://docs.composio.dev/docs/security/token-custody) remains with Composio Cloud even when the application owns the OAuth client. Tokens are encrypted and injected server-side; provider tokens are not exported through ordinary connected-account reads. Bind opaque Composio user IDs to locally authenticated users/spaces and reject caller-selected accounts outside that authorization.

By default, [tool arguments, results, and trigger payloads](https://docs.composio.dev/docs/security/data-retention) enter execution logs retained up to one year. Staged files last 24 hours independently of signed-URL expiry. This matters for email content.

[ZDR](https://docs.composio.dev/docs/security/zero-data-retention) is a paid setting, retains call metadata, and covers ordinary tool/proxy payloads. On Pro, it does **not** cover Composio-managed OAuth apps; those require Enterprise for ZDR. Use custom OAuth apps with ZDR for the email product when that matches its privacy commitments. Sandbox, files, stored trigger processing, and cached tool-search queries have separate exclusions. Disable the sandbox and Instant tools, keep sensitive query content out of semantic tool search, and document actual processing/storage rather than promising blanket zero retention.

[Production readiness](https://docs.composio.dev/docs/production-readiness) states execution/proxy calls are sent exactly once; the SDK does not retry or deduplicate executions. Retry known reads with bounded backoff. A timed-out Sheet write must be reconciled against its intended range before retry. Persist the result's `logId`, account identity, execution attempt and normalized source evidence without logging payloads unnecessarily.

[Rate limits](https://docs.composio.dev/reference/rate-limits) are organization-wide: 2,000 requests/minute on Hobby and 10,000 on Pro. Management calls consume that budget too. Respect `Retry-After`; upstream Gmail/CRM/GA4 quotas remain independent.

## Recurrence and trigger constraints

Use Rakazo's scheduler for weekly reports and proactive meeting briefs; Composio triggers are source-event delivery, not the owner of task scheduling. [Triggers](https://docs.composio.dev/docs/triggers) documents polling for Gmail/Calendar with up to roughly 15-minute latency on managed auth. Gmail's toolkit FAQ separately describes roughly one minute, so do not promise a fixed refresh delay without an observed contract.

Create triggers with [explicit `connectedAccountId`](https://docs.composio.dev/docs/setting-up-triggers/creating-triggers); user-only selection defaults to the first active account. [Webhook handling](https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events) supports `triggers.setWebhookSubscription({ webhookUrl })` and `triggers.parse(request, { verifySecret })`; the SDK checks a 300-second timestamp tolerance. After verification, map the event/account to local authorization, deduplicate event IDs, enqueue durably, and acknowledge promptly. Trigger retries do not prove task/write idempotency. Avoid Composio triggers for data requiring strict ZDR.

## Cost model and alternative

[Current Composio pricing](https://composio.dev/pricing) applies to new signups from 2026-08-15; older plans may differ through year-end. Hobby: 100,000 own-app calls and 50,000 trigger events monthly; managed apps use lower 20,000/10,000 sub-allowances. Pro: $29/month including $29 usage credit. Own-app overage is $0.0003/tool execution; managed-app overage $0.0005. Own-app connections are free; managed connections beyond the first 1,000 add $0.10 once. Meta-tool search is free. Proxy adds $0.0002/call; ZDR adds $0.0001/call; triggers cost $0.003/event with own apps or $0.005 managed. Confirm allowance/add-on billing in the actual account before estimating an invoice.

Illustrative arithmetic, excluding free allowances, monthly credit, LLM cost, and retries: three mailbox listing executions plus six hydrated threads per mailbox produce 21 executions, or $0.0063 with own OAuth versus $0.0105 managed. A catalog wrapper may issue several Google requests internally while counting as one Composio execution; a proxy request per message increases metered executions. Own-app ZDR adds $0.0021 to 21 calls; proxy for all 21 adds another $0.0042. Measure real fan-out; do not estimate mailbox cost from one natural-language prompt.

[Pipedream Connect](https://pipedream.com/docs/connect/api-proxy) is a credible alternative with explicit `externalUserId` plus `accountId` proxy routing and a 30-second proxy timeout. Its [security policy](https://pipedream.com/docs/privacy-and-security#data-storage-and-logging) says Connect API/MCP request and response bodies are not persisted by default. Its [production pricing](https://pipedream.com/pricing?plan=Connect) is $150/month monthly or $99/month billed annually, 100 external users then $2/user, 10,000 credits then $0.012/credit; an execution/proxy/event uses a credit per 30 seconds of compute. Development is free. Prefer evaluating it if default non-retention or inspectable integration components outweigh migration cost and per-user pricing. Existing Composio adoption and lower broad-user unit costs support extending Composio first, with an adapter seam preserved.
