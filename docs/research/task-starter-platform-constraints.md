# Task starter platform constraints

Researched against first-party documentation on 2026-10-09. Initial targets are Gmail, Google Calendar, HubSpot, Google Analytics 4, and Google Sheets. Recommendations are engineering judgments; the sources do not establish production OAuth approval, sanctioned LinkedIn access, a working deployment, or a ten-second completion guarantee.

## Required outcomes

| Starter | Required inputs | First useful result | External writes |
| --- | --- | --- | --- |
| Search all my Gmail accounts | Query and selected mailbox connections | Ranked messages with account attribution and source links | None |
| Build a brief for my next meeting | Selected calendars, attendee identity, related email, optional HubSpot | Meeting purpose, relationship context, open commitments, questions, cited sources | None |
| Turn my inbox into a to-do list | Selected mailboxes and lookback | Reviewable, prioritized action items with evidence | Saving to an external task destination only when chosen |
| Pull this week's numbers into a Sheet | GA4 property, metrics, period, destination | Numeric preview and a spreadsheet link after the authorized write | Spreadsheet creation/update; recurrence only when chosen |

Meeting discovery needs Calendar, even though the proposed tagline lists only CRM, email, and LinkedIn. “Automatic” should mean no manual copying; scheduled recurrence is a separate choice.

## Gmail and multi-account search

### Platform facts

- `gmail.readonly` and `gmail.metadata` are restricted scopes. Metadata excludes message bodies; read-only does not grant mailbox editing or sending. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- `messages.list` searches one mailbox, returns IDs with pagination, and requires subsequent reads for details. `q` is unavailable with metadata-only authorization. [Messages list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- API queries support most Gmail search syntax but do not reproduce Gmail UI alias expansion or thread-wide matching. Date strings use midnight PST; epoch seconds express other timezone boundaries. [Search behavior](https://developers.google.com/workspace/gmail/api/guides/filtering)
- Google OAuth supports account selection, incremental authorization, and offline access. [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- Incremental synchronization uses `history.list`; expired history IDs return 404 and require a fresh synchronization. [Synchronization](https://developers.google.com/workspace/gmail/api/guides/sync)
- Native Gmail push uses Cloud Pub/Sub, requires watch renewal at least every seven days, and can lose or delay notifications. Catch-up synchronization remains necessary. [Push notifications](https://developers.google.com/workspace/gmail/api/guides/push)

### Recommended behavior

Maintain a durable connection per authorized mailbox, with verified account identity, owner, granted capabilities, and revocation state. “All my accounts” means all explicitly connected and selected mailboxes, not other accounts incidentally signed into the browser.

Search selected mailboxes with bounded concurrency, pagination, result budgets, and deadlines. Fetch bodies only for relevant candidates. Preserve mailbox/message/thread identifiers and retrieval times. Deduplication must retain every source account. Partial failure must distinguish an omitted mailbox from “no matches”; reconnect only the affected connection.

Start with native query search so the first task does not require a full mailbox import. Add incremental synchronization only for a demonstrated recurring feature, with retention and deletion semantics agreed first.

For inbox actions, retrieve enough thread context to avoid extracting already resolved requests. Store action, owner, explicit due date, evidence, priority reason, and confidence. Unknown dates remain unknown. Treat email as untrusted data, never as authorization to run another action. Create a reviewable list in Rakazo's existing scratchpad; distinguish these user items from the execution-oriented Task model. Use a stable source/action fingerprint to prevent duplicates, and preserve completed items across reruns.

## Google authorization and data handling

Restricted scopes require verification unless an exception applies; server access/transmission generally requires an annual Google-approved assessment. Verification can take several weeks. Personal/internal use does not establish approval for a public SaaS. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

The current Workspace policy permits productivity features such as generative summaries, requires minimal contextual permissions and disclosure before consent, restricts permitted transfers and human access, prohibits general model training beyond the specific user's personalized feature, requires encryption and prompt-injection protection, and warns against permanent copies or caching beyond permitted headers. [Workspace policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

**Recommendation:** confirm the complete data path, OAuth application's identity, storage, LLM transmission, retention, and deletion with the integration provider and verification process. A broker handling OAuth does not establish downstream compliance. Review raw-mail indexing before implementation; user-reviewed to-dos need a distinct retention policy, and derivations are not automatically exempt from Limited Use restrictions.

## Calendar, HubSpot, and LinkedIn briefs

### Platform facts

- Calendar offers event read-only and calendar-list read-only scopes. Event retrieval is per calendar; recurring instance expansion and chronological ordering require the appropriate parameters. Attendees, cancellations, pagination, and private-event visibility affect the result. [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list?hl=en)
- HubSpot supports exact property filtering, including contact email, and granular CRM scopes. Search is limited to five requests/second/account and recent changes may take time to appear. [CRM search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
- Associations connect contacts to companies, deals, and activities; batch reads return related identifiers. Fetch note content separately through the notes API. [Associations](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide), [Notes](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/guide)
- HubSpot supports conditional and optional scopes. Ordinary marketplace OAuth requests allow 110 calls/10 seconds/account, while search and associations have separate limits. [Scopes](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes), [Usage limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)
- An owned HubSpot app adds distribution requirements: new-platform marketplace apps are capped at 25 installs before listing approval; private OAuth generally permits ten customers, or 100 for Solutions Partners. [Distribution limits](https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits)
- LinkedIn's self-service identity permissions retrieve the authenticated member, not arbitrary meeting attendees. Sales Navigator profile access requires approved SNAP partnership. [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

### Recommended behavior

Select the next relevant meeting across chosen calendars, excluding cancelled/declined entries and non-meeting events. Resolve external attendees by exact email in the selected HubSpot account, then fetch associated company/deal/notes. Never silently combine people by name alone. Make enterprise or Sensitive Data access optional, and degrade to available ordinary CRM data.

Build the brief from the agenda, related threads, and CRM evidence. Separate facts from suggested talking points; stream useful results and identify missing context when relevant. LinkedIn should be optional enrichment using sanctioned access, existing CRM profile links, or user-provided material. A toolkit entry or “Connect LinkedIn” button does not imply arbitrary profile lookup permission.

Treat “in 10 seconds” as a future measured performance claim. Cold connections, OAuth, attendees, account count, pagination, throttling, and model latency all affect duration. Cache-based initial results do not establish current-data p95 performance.

## GA4 to Google Sheets

### Platform facts

- Standard GA4 properties currently have 200,000 Core tokens/day, 40,000/property/hour, 14,000/project/property/hour, and ten concurrent requests/property. Complexity changes token consumption; `returnPropertyQuota` exposes quota state. [GA4 quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- Report dates are inclusive; relative dates use the property's reporting timezone. Metrics/dimensions have defined semantics and can be compatibility-checked. [Dates](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/DateRange), [Metric schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [Compatibility](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility)
- Response metadata can report currency, timezone, sampling, thresholding, truncation, access restrictions, and `(other)` data loss. Unique counts use approximation and reporting identity affects user counts. [Metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData), [Reporting expectations](https://developers.google.com/analytics/devguides/reporting/data/v1/reporting-data-expectations)
- Processing can take 24–48 hours, during which figures change. Standard intraday data is typically 2–6 hours fresh and less complete than daily data. [Freshness](https://support.google.com/analytics/answer/11198161?hl=en)
- Sheets recommends non-sensitive `drive.file`; broad spreadsheet authorization is sensitive and cannot be restricted to one tab. `drive.file` works with new files or files explicitly granted through a picker; a pasted arbitrary ID is not itself an access grant. [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes?hl=en), [Per-file access](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Batch updates validate and apply together atomically, while collaborators may subsequently alter the file. Value updates target specific ranges. Sheets read/write quotas each allow 300/minute/project and 60/minute/user/project. [Batch update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Value update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update), [Limits](https://developers.google.com/workspace/sheets/api/limits)

### Recommended behavior

Choose a GA4 property and validated metric set. Distinguish users, sessions, events, purchases, and revenue. Retrieve weekly unique counts directly; do not sum daily users. Compute aggregate rates from their numerators/denominators. Keep currency and units.

Resolve “this week” to explicit property-timezone dates once, distinguishing week-to-date from the last completed week. Fetch numbers deterministically and let the model explain them. Preserve metric definitions, filters, period, timezone, currency, retrieval time, and consequential provider warnings. Empty/restricted values must not silently become zero.

Default to a new spreadsheet or an explicitly chosen file. Preview destination and data before writing to a dedicated tab/range. Verify Composio supports the needed scopes, picker grant, and batch behavior; managed authentication may be broader than desired, so custom auth or a different adapter may be needed for `drive.file`.

Persist a report key combining destination, property, metric-set version, and period. Update a stable range/tab instead of blindly appending on retries. Reconcile ambiguous creates/writes before another mutation; atomic batches do not imply idempotency.

Offer recurrence after the first successful report. Reuse Rakazo's server-owned routines and external-effect authority for fixed source/destination, timezone, cadence, freshness delay, overlap prevention, and recovery. A Monday morning completed-week report may still be provisional. Advertising recurrence requires evidence of a real scheduled execution.

## Evaluation gates

Prove explicit account routing, actual granted scopes, partial failure, reconnect, provenance, CRM disambiguation, a brief without LinkedIn, per-file Sheets authorization, numeric/date correctness, ambiguous-write reconciliation, and scheduled execution where promised. Use offline conformance tests before isolated authorized provider validation.

Composio can provide an optional adapter and credential transport. Rakazo remains responsible for task intent, account selection, permissions, derived-data handling, deterministic reporting, write authorization, and truthful completion.
