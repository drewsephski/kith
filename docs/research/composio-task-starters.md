# Composio for task starters

Research date: 2026-10-09. Evidence comes from current official documentation and pricing. No connected accounts, credentials, tools against user data, or subscriptions were operated. Catalog coverage is not live execution proof.

## Recommendation

Use Composio Platform as the first hosted integration adapter. Keep task planning, account selection, authorization, provenance, scheduling and recovery in Rakazo's shared backend. Preserve provider-neutral contracts and optional direct/MCP adapters. Composio's [existing-harness example](https://docs.composio.dev/examples/harness-integration) supports putting managed auth and execution under an application's own planner, without adopting another agent loop.

Curated starters should use deterministic source retrieval and narrowly scoped validated writes. Generic discovery remains useful for open-ended conversation. “In 10 seconds” needs measured connected-account performance; OAuth consent, provider throttling and arbitrary LinkedIn enrichment cannot fit a universal guarantee.

## Accounts and current SDK

Sessions are the recommended `@composio/core` interface. [REST v3.1](https://docs.composio.dev/reference) is current at `https://backend.composio.dev/api/v3.1`; `/api/v3` remains supported with legacy tool-version defaults.

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

This illustrates API shape; validate arguments/results and local account ownership. The [multi-account guide](https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts) supports 2–10 accounts per toolkit, aliases and explicit execution selection. Default selection is the most recently connected active account. `connectedAccounts` restricts reachable account IDs; `user_id: "me"` means the mailbox authenticated by the selected connection. An email address cannot replace connected-account selection.

The [Session reference](https://docs.composio.dev/reference/sdk-reference/typescript/session) exposes `authorize(toolkit, { alias, callbackUrl })`, `execute(toolSlug, arguments, options)`, `toolkits()` and `update()`. `authorize()` always starts a new link flow and returns `redirectUrl`. Persist task/conversation session IDs; restore through `composio.use(sessionId)` only after local ownership checks. A process cache is not durable authority.

## Native toolkit actions for curated retrieval

Use exact native toolkit tools for GA4 and Drive operations. They select the provider's correct API service internally. Do not route GA4 Analytics Data/Admin API or Google Drive requests through another toolkit's proxy just because all services are Google. A connected account is scoped to its toolkit and granted permissions; Gmail, Calendar, GA4, Drive and Sheets connections are not interchangeable.

[Proxy Execute](https://docs.composio.dev/docs/extending-sessions/proxy-execute) is useful for precise provider endpoints within the connection's allowed domain. It rejects cross-domain requests. `session.proxyExecute({ toolkit, endpoint, method, parameters, body })` resolves the account from its session and has no explicit account argument in the current TypeScript signature. Pin a proxy session to one account, or use the account-specific adapter path `composio.tools.proxyExecute({ connectedAccountId, ... })`. Proxy bypasses per-tool/behavior-tag filters; enforce HTTP method and endpoint allowlists in the adapter. Native tools avoid depending on cross-service proxy acceptance.

### Search every selected Gmail account

[Gmail](https://docs.composio.dev/toolkits/gmail) provides `GMAIL_FETCH_EMAILS`, `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID` and `GMAIL_FETCH_MESSAGE_BY_THREAD_ID`. Backend fan-out must enumerate the selected authorized connections, pass their IDs explicitly, paginate each and merge attributed results. A successful connection or one search does not establish all-account coverage.

`GMAIL_FETCH_EMAILS` defaults to one result and caps pages at 500. Follow `nextPageToken`; distinguish empty results from failed retrieval. `ids_only: true` avoids unnecessary hydration. `verbose: false` supplies essential metadata but does not guarantee message bodies. Hydrate only relevant messages/threads, normalize timestamps and deduplicate within account. Cross-check query dates against Google's API; prefer explicit epoch boundaries for precise time windows. Report partial account failure instead of claiming a complete search.

### Next meeting: Calendar, Gmail and HubSpot

[HubSpot](https://docs.composio.dev/toolkits/hubspot) is the first CRM target. Use `HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA` with exact email `filterGroups` and selected properties. `HUBSPOT_LIST_CONTACT_NOTES` returns note IDs and associations, requiring separate body hydration. `HUBSPOT_LIST_OBJECT_ASSOCIATIONS` traverses contacts to deals; `HUBSPOT_GET_DEAL` reads selected fields; `HUBSPOT_READ_BATCH_CRM_OBJECT_PROPERTIES` can hydrate notes. Keep pagination and ambiguous identity matches explicit.

Request the required read scopes for contacts, companies and deals. [HubSpot's note-read reference](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/get-note) lists `crm.objects.contacts.read`; do not invent a notes-specific scope. Select the next eligible meeting, match attendee emails to CRM contacts, fetch related recent correspondence and cite the actual sources. Missing CRM records should yield a useful brief with missing coverage identified.

LinkedIn is a material capability gap. [Its schemas](https://docs.composio.dev/toolkits/linkedin.md) show `LINKEDIN_GET_PERSON` requires an application-scoped person ID, `LINKEDIN_GET_MY_INFO` reads the authenticated user, and `LINKEDIN_GET_COMPANY_INFO` lists organizations where that user has administrative/content roles. These do not prove attendee enrichment from email/profile URL. Make LinkedIn optional; use verified CRM profile links or a separately validated enrichment provider. Avoid a silent scraping fallback.

### Inbox action items

Reuse bounded Gmail retrieval and thread hydration. Extract obligations, owners, deadlines and evidence quotes into a reviewable local list. Prioritization belongs to the product/model layer, not the integration broker. Separate external task creation from extraction and preserve account/thread provenance. Email content is untrusted data; it must not control tools or authorization.

### GA4 report to Google Sheets

The [Google Analytics toolkit](https://docs.composio.dev/toolkits/google_analytics) uses `google_analytics` and contains GA4 tools: `GOOGLE_ANALYTICS_LIST_ACCOUNT_SUMMARIES`, `GOOGLE_ANALYTICS_GET_PROPERTY`, `GOOGLE_ANALYTICS_GET_METADATA`, `GOOGLE_ANALYTICS_CHECK_COMPATIBILITY` and `GOOGLE_ANALYTICS_RUN_REPORT`. Their property resources and metadata/report schemas establish GA4 rather than Universal Analytics coverage.

Select a property and discover valid dimension/metric API names. Validate compatibility, use explicit dates/property timezone, paginate report rows and calculate numbers deterministically. Google's [report reference](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport) uses `POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport` with `analytics.readonly`; [metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/getMetadata) uses `GET .../properties/{id}/metadata`. These identify upstream semantics; use native Composio actions for the broker path rather than cross-service proxy URLs.

For destination discovery, [Google Drive](https://docs.composio.dev/toolkits/googledrive.md) offers `GOOGLEDRIVE_FIND_FILE` with MIME-type filtering, pagination and shared-drive options; `GOOGLEDRIVE_LIST_FILES` is deprecated. `GOOGLEDRIVE_GET_FILE_METADATA` verifies an exact file. A Sheets connection must not be assumed to supply a Drive discovery grant.

[Sheets](https://docs.composio.dev/toolkits/googlesheets) offers `GOOGLESHEETS_VALUES_GET`, `GOOGLESHEETS_VALUES_UPDATE` and `GOOGLESHEETS_UPDATE_VALUES_BATCH`. Avoid deprecated `GOOGLESHEETS_BATCH_UPDATE` and `GOOGLESHEETS_SHEET_FROM_JSON`. Preview the selected destination/range, write stable ranges or keyed rows, use `RAW` for untrusted text and read back the result. Blind append is difficult to recover safely after uncertain completion.

## Setup, privacy and reliability

Managed OAuth is a short prototype path. For public distribution, evaluate own OAuth clients for recognizable consent, least privilege, dedicated quota and retention requirements. [Scopes](https://docs.composio.dev/docs/authentication/controlling-scopes) belong to auth configs; existing accounts must reconnect after scope changes. Provider verification, enterprise policy and approval still apply. [Token custody](https://docs.composio.dev/docs/security/token-custody) stays with Composio Cloud even with an own OAuth client; ordinary account APIs do not export provider tokens.

Default [execution logs](https://docs.composio.dev/docs/security/data-retention) contain request/response payloads and can remain for one year; staged files last 24 hours. [ZDR](https://docs.composio.dev/docs/security/zero-data-retention) covers ordinary tool/proxy payloads while retaining metadata. On Pro it excludes Composio-managed OAuth apps; managed-app ZDR requires Enterprise. Own OAuth plus ZDR is the relevant Pro path. Sandbox, files, stored trigger processing and cached tool-search queries have separate exclusions. Disable sandbox/Instant tools, keep sensitive content out of semantic tool search, and state actual retention boundaries.

[Executions are sent once](https://docs.composio.dev/docs/production-readiness), without SDK execution replay or deduplication. Retry safe reads with bounded backoff; reconcile timed-out writes before retry. [Organization limits](https://docs.composio.dev/reference/rate-limits) are 2,000 requests/minute Hobby and 10,000 Pro, including management calls; provider quotas remain separate.

Keep recurring reports in Rakazo's durable scheduler. [Gmail/Calendar triggers](https://docs.composio.dev/docs/triggers) poll and may take roughly 15 minutes on managed auth; Gmail's catalog FAQ separately says roughly a minute. Neither establishes a fixed latency guarantee. Create triggers with [explicit account IDs](https://docs.composio.dev/docs/setting-up-triggers/creating-triggers), verify [signed webhook payloads](https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events), deduplicate and enqueue durably. Trigger retries do not make task writes idempotent; strict ZDR excludes triggers.

## Cost and alternative

[Pricing](https://composio.dev/pricing), for current new signups: Pro is $29/month including $29 usage credit. Own-app allowances are 100,000 calls and 50,000 events; overage $0.0003/call and $0.003/event. Managed-app sub-allowances are 20,000/10,000; overage $0.0005/$0.005, with connections beyond 1,000 adding $0.10 once. Proxy adds $0.0002/call; ZDR $0.0001/call. Meta-tool search is free. Legacy customer plans may differ.

Illustrative arithmetic before allowances, credit, LLM cost or retries: three mailbox listings plus six hydrated threads/account equal 21 executions: $0.0063 own OAuth or $0.0105 managed. ZDR adds $0.0021; proxying all 21 adds $0.0042. A toolkit wrapper may make several upstream requests while counting as one tool execution. Measure actual fan-out before invoice estimates.

[Pipedream Connect](https://pipedream.com/docs/connect/api-proxy) is a credible alternative: explicit `externalUserId`/`accountId` routing, 30-second proxy timeout and [default non-retention of Connect API/MCP payloads](https://pipedream.com/docs/privacy-and-security#data-storage-and-logging). Its [production pricing](https://pipedream.com/pricing?plan=Connect) is $150/month monthly or $99/month annually, 100 users then $2/user, and 10,000 credits then $0.012/credit. An execution/proxy/event consumes a credit per 30 seconds of compute. Prefer evaluating it if default retention policy outweighs existing Composio adoption and per-user cost. Preserve the adapter seam either way.
