# Task starter platform constraints

Researched against first-party documentation on 2026-10-09. This note describes platform capabilities and proposed product behavior; it does not establish that Rakazo or any intermediary has production OAuth approval, partner access, or a working deployment. Recommendations below are engineering judgments, not provider promises.

## Product interpretation

| Starter | Required inputs | Useful first result | External writes |
| --- | --- | --- | --- |
| Search all my Gmail accounts | Query, selected mailbox connections | Ranked messages with account and source links | None |
| Build a brief for my next meeting | Calendar event, attendee identities, selected mailboxes, optional CRM | Purpose, relationship context, open questions, recent commitments, cited sources | None |
| Turn my inbox into a to-do list | Selected mailboxes, lookback, optional task destination | Reviewable action items with evidence and priority reasons | Only when the user chooses a destination/save action |
| Pull this week's numbers into a Sheet | Analytics property, metric definitions, period, destination | Numeric preview plus a spreadsheet link after the authorized write | Spreadsheet creation/update; optionally a recurring job |

The confirmed initial sources are HubSpot and GA4. Meeting discovery also needs Calendar. “Automatic” means the transfer runs without manual copying; recurrence needs a separate schedule choice.

## Gmail search and inbox action extraction

### Verified platform behavior

- `gmail.readonly` and `gmail.metadata` are restricted scopes. Metadata excludes message bodies; read-only permits reading but does not authorize sending or editing messages. Public restricted-scope applications require verification unless an exception applies. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- `users.messages.list` is mailbox-specific. `me` identifies the authenticated user; `q` cannot be used with metadata-only scope. Lists return message/thread IDs and pagination, and details require subsequent reads. [Messages list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- API search supports most Gmail syntax but does not reproduce alias expansion or thread-wide search from Gmail's UI. Date strings are interpreted at midnight PST; epoch seconds express other timezone boundaries accurately. [Search behavior](https://developers.google.com/workspace/gmail/api/guides/filtering)
- Google's OAuth flow supports `prompt=select_account`, incremental authorization, and offline access. These are building blocks for explicitly adding another account and later requesting another capability, rather than silently reusing the current browser account. [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- Gmail synchronization supports an initial bounded cache and incremental `history.list`. History is usually available for at least a week but can expire earlier; an expired history cursor returns 404 and requires a fresh synchronization. [Synchronization](https://developers.google.com/workspace/gmail/api/guides/sync)
- Native Gmail push uses Cloud Pub/Sub. Watches expire, must be renewed at least every seven days, and Google recommends daily renewal. Notifications can be delayed or dropped, so a catch-up mechanism is required. [Push notifications](https://developers.google.com/workspace/gmail/api/guides/push)

### Recommended implementation and UX

1. Preserve one durable connection identity per authorized mailbox, with a verified account label, owner, actual granted capabilities, and revocation status. “All my accounts” means all explicitly connected and selected mailboxes. Do not interpret one OAuth connection as access to the user's other accounts.
2. Search selected mailboxes concurrently with bounded per-provider concurrency, a result budget, pagination, and an overall deadline. Fetch relevant message details only after candidate retrieval. Return useful partial results if a mailbox needs reconnection; say which mailbox was omitted. A result must retain its mailbox ID, message ID, thread ID, source link, and retrieval timestamp.
3. Deduplicate display where appropriate without erasing provenance. The same conversation may appear in multiple mailboxes; provider message IDs are not globally unique. Search completeness must distinguish “no matches” from a failed, truncated, or unsearched mailbox.
4. Start with provider-native query search rather than requiring a full mailbox import before the first task. Add bounded incremental synchronization only for a demonstrated need such as recurring inbox triage or precomputed briefs, with documented retention and deletion behavior.
5. For to-dos, retrieve enough thread context to distinguish an outstanding request from a resolved one. Extract action, owner, due date when explicit, evidence, and confidence. Prioritize using user-owned rules such as deadline, commitment, important sender, or project; show the reason. Unknown dates remain unknown. Email content is untrusted input, never instructions to authorize another action.
6. Show a reviewable list in Rakazo first. Saving to a task platform is a separate write capability. Use a stable source/action fingerprint so rerunning triage does not create duplicate tasks. Keep completed user items completed; do not recreate them just because an old email remains in the inbox.

## Google consent and data handling are launch requirements

Google requires an annual approved assessment for restricted data accessed from or through third-party servers unless a qualifying exception applies; verification can take several weeks. A personal-use or internal-use exception does not establish approval for a public SaaS. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

The current Workspace policy explicitly allows productivity features including generative summaries, requires minimal in-context permissions and disclosure before consent, limits data transfers to permitted user-facing features with consent, prohibits general model training beyond the specific user's personalized feature, requires encrypted credentials/data and prompt-injection protection, and warns against permanent copies or caching beyond permitted headers. [Workspace user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

**Implication:** choose the OAuth application's owner and disclosure identity deliberately. A broker managing OAuth does not prove approval of downstream storage, LLM transmission, or retention. Confirm the entire data path before public Gmail launch. Use minimal retention and deletion propagation; review any persistent index against current cache requirements. User-reviewed to-dos in the existing scratchpad need a separate retention policy from raw-message caches; derived data is not automatically exempt from Limited Use restrictions.

## Next meeting brief: Calendar, CRM, and LinkedIn

### Verified platform behavior

- Calendar exposes event read-only scopes and a separate calendar-list read-only scope; full calendar write access is unnecessary for briefing. [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- Events are retrieved per calendar; listing accessible calendars is a distinct step. `singleEvents=true` expands recurring instances and allows `orderBy=startTime`. Event APIs expose attendee email identifiers, pagination, cancellations, and private-event visibility restrictions. [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list?hl=en)
- HubSpot supports CRM property filtering, including email, and granular CRM scopes. Its current search limit is five requests/second/account; records can take time to appear in search and archived records are omitted. [CRM search](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
- CRM associations expose relationships between contacts, companies, deals, and activities, including batch reads. A contact search by itself is not a complete relationship brief. [HubSpot associations](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide)
- Association IDs require a subsequent notes read to fetch `hs_note_body`. [Notes API](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/guide)
- HubSpot supports conditional/optional scopes for tiered features; avoid mandatory enterprise or Sensitive Data permissions. [Scopes](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes) Ordinary marketplace OAuth calls allow 110 requests/10 seconds/account; search and associations have separate limits. [Usage limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)
- LinkedIn's broadly available permissions offer the authenticated member's identity and posting, not unrestricted attendee lookup. Sales Navigator profile access requires approved SNAP partner access; most LinkedIn permissions require explicit approval. [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

### Recommended implementation and UX

- Select the next relevant event across the user's chosen calendars, excluding declined/cancelled entries and non-meeting event types. Ask for a meeting choice when the interpretation is ambiguous; do not use only the primary calendar without making that scope clear.
- Resolve each external attendee by exact email in the selected CRM, then retrieve explicitly associated company, deal, notes, and recent activity. Treat name-only matching as uncertain; never silently combine two people with the same name. Preserve account boundaries when multiple CRM tenants exist.
- Combine recent related threads with CRM facts and the actual agenda. Separate sourced facts, inferred talking points, and missing context. Stream the brief as sources finish and expose omitted sources only when relevant.
- Make LinkedIn optional enrichment. Accept a CRM-held profile link or user-provided material; use a sanctioned profile/enrichment provider only when its access and provenance fit the product. Do not market a “Connect LinkedIn” button as unlocking arbitrary people's profiles. A connector catalog entry does not establish that permission.
- Remove “in 10 seconds” until representative production p95 measurements support it, including cold connections, many attendees, multiple accounts, pagination, rate limits, and model latency. An initial cached brief may be fast; current-data refresh and OAuth consent have variable duration.

## Weekly analytics to Google Sheets

### Verified platform behavior

- GA4 Data API quotas apply by property and project. Standard properties currently allow 200,000 Core tokens/day, 40,000/property/hour, 14,000/project/property/hour, and ten concurrent requests/property. Request complexity changes token consumption; `returnPropertyQuota` exposes current quota state. [Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- Date ranges are inclusive; relative dates resolve in the property's reporting timezone. [Date ranges](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/DateRange)
- Metrics and dimensions have defined API semantics, and compatibility can be checked before requesting a report. [Metric schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [Compatibility](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility)
- Report metadata can expose currency, timezone, sampling, thresholding, truncation, metric access restrictions, and data rolled into `(other)`. [Response metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData)
- Unique user/session counts use approximation, and reporting identity affects user counts. [Reporting expectations](https://developers.google.com/analytics/devguides/reporting/data/v1/reporting-data-expectations)
- Analytics processing can take 24–48 hours and values can change during processing. Current standard intraday freshness is typically 2–6 hours; intraday is less complete than daily data. [Data freshness](https://support.google.com/analytics/answer/11198161?hl=en)
- Sheets recommends non-sensitive `drive.file`; broad `spreadsheets` access is sensitive, while broad Drive access is restricted. A spreadsheet scope does not restrict access to an individual tab. [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes?hl=en)
- `drive.file` permits newly created files or files explicitly shared with the app through a picker. A pasted arbitrary sheet ID is not itself a grant. [Drive per-file access](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Spreadsheet batch updates validate all requests and apply them together atomically, though concurrent collaborators can still change the final spreadsheet. Value updates target a specified range. [Batch update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Value update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update)
- Sheets read/write quotas are each 300/minute/project and 60/minute/user/project, with backoff for quota errors and a 180-second request-processing limit. [Sheets limits](https://developers.google.com/workspace/sheets/api/limits)

### Recommended implementation and UX

1. Offer GA4 first with a property picker and a small validated metric set. Distinguish active users, total users, sessions, events, purchases, and revenue rather than letting an LLM invent metric names. Retrieve weekly unique-user totals directly; do not sum daily unique counts. Aggregate rates from their numerators/denominators, and preserve currency and units.
2. Resolve “this week” once to explicit dates in the property timezone; let the preview distinguish week-to-date from the last completed week. Carry the same period through retries and scheduled jobs. Mark recent data provisional and show freshness caveats where they affect interpretation.
3. Fetch numeric results deterministically, then let the model explain them. Preserve requested metric definitions, source property, filters, period, timezone, currency, retrieval time, and relevant response warnings in the report provenance. Empty/restricted data must not silently become zero.
4. Default to a new spreadsheet or explicitly granted file. Preview destination/data before writing; use a dedicated tab/range. Verify the broker supports `drive.file`, picker grants, and the needed batch APIs; managed auth may use broader scopes, requiring custom auth or another adapter for narrow access.
5. Persist a report key such as destination + property + metric-set version + period. Write to a stable range or deterministic report tab, rather than retrying blind appends. After an ambiguous create/write response, reconcile the destination before another mutation. Atomic batches are not a general idempotency guarantee.
6. After one successful report, offer recurrence. Store source, destination, fixed metric definitions, timezone, cadence, freshness delay, and overwrite policy in a server-owned job. Stagger jobs, catch up carefully, prevent overlap, and expose revoked-access or missed-run recovery. For completed-week figures, delay or refresh after the processing window; a Monday-morning report may still be provisional.

## Launch gates and honest fallback

Before describing these starters as supported, demonstrate multi-mailbox account selection; actual granted read-only scopes; partial failure and reconnect behavior; provenance; CRM disambiguation; a brief without LinkedIn; Sheets per-file permission; deterministic metric/date semantics; recovery after ambiguous writes; and one real scheduled execution if recurrence is advertised. Test provider adapters offline first, then validate OAuth and real provider behavior using isolated authorized test accounts.

External constraints include Google approval/assessment, enterprise allowlisting, sanctioned LinkedIn access if profiles are promised, and actual user permissions. An owned HubSpot OAuth app adds a distribution gate: marketplace apps on the new developer platform are capped at 25 installs before listing approval; private OAuth permits ten customers, or 100 for Solutions Partners. Verify whether the broker uses its listed application or Rakazo's own. [HubSpot distribution limits](https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits)

Composio can serve as an optional integration adapter; Rakazo still owns account selection, interpretation, authorization, and completion semantics.
