# Task starters and integration direction

Research date: 2026-10-09. Initial platforms: Gmail, Google Calendar, HubSpot,
Google Analytics 4 (GA4), and Google Sheets. This is an implementation recommendation,
not a claim that the four workflows have been shipped or verified against live accounts.

## Decision

Use **Composio Platform as the first managed integration adapter** for these workflows.
Keep Rakazo responsible for task execution, account authorization, source attribution,
approvals, scheduling, retries, and recovery. Preserve optional providers and existing
MCP/direct API paths. This fits the repository's existing architecture and avoids making
the core product dependent on a hosted integration vendor.

Use scoped sessions with known tools for curated workflows. Use backend-controlled
authenticated API proxy requests when precise pagination, query fields, or report shapes
are better expressed through the underlying API. Composio recommends sessions for new
integrations and provides a direct-tools preset for a fixed tool set. Its proxy is an
intentional building block, but tool-level hint filters do not constrain proxy requests;
Rakazo must constrain endpoints, methods, accounts, and arguments itself.
Sources: [sessions](https://docs.composio.dev/docs/sessions-vs-direct-execution),
[proxy execution](https://docs.composio.dev/docs/extending-sessions/proxy-execute).

Do not promise arbitrary LinkedIn attendee enrichment or a guaranteed ten-second brief.
Start meeting preparation with Calendar + Gmail + HubSpot. LinkedIn remains optional
until the actual approved access path supports the attendee lookup.

## What each use case actually requires

| Starter | Required behavior | Important boundary |
| --- | --- | --- |
| Search all my Gmail accounts | Query every selected connected mailbox, merge useful results, retain account attribution and original links | A single Gmail request searches one mailbox; missing/failed accounts must be explicit |
| Build a brief for my next meeting | Resolve the meeting, match attendees to CRM contacts, retrieve relevant conversations/deals/notes, produce a sourced brief | CRM identity ambiguity and unavailable LinkedIn data cannot be filled by guesses |
| Turn my inbox into a to-do list | Read bounded recent conversations, extract commitments, explain priority, deduplicate and save user-selected actions | An unread email is not necessarily an action; inferred dates/priority must be distinguishable |
| Pull this week's numbers into a Sheet | Resolve property, metric definitions, date window, destination and write policy; produce and verify a report | Week-to-date is partial; reruns must update the same report rather than append duplicates |

The first three start with read-only retrieval. Saving internal to-dos is a local state
change; sending email, editing CRM records, and changing mailbox state are separate actions.
The fourth includes an external write and requires a concrete destination and write scope.

## Current codebase support

These findings describe the working tree, including existing uncommitted integration and
calendar work. They do not imply that those changes are merged, deployed, or live-tested.

| Area | Existing implementation | Gap for these starters |
| --- | --- | --- |
| Suggestion UI | `apps/web/src/pages/shell/assistant-welcome.tsx` offers three suggestions; `Shell.tsx` copies the selected prompt into the composer | Four shared starter definitions, stable starter intent, mobile parity, and prerequisites |
| Managed integrations | `ManagedConnectorProvider` in `packages/adapter-kit/src/interfaces.ts`; Composio and Pipedream adapters; encrypted provider settings | Workflow-specific capability checks rather than treating a catalog entry as proof of support |
| Multiple accounts | Connection rows belong to a user and space; web/mobile can add, rename and remove accounts; Composio execution sessions pin account IDs and require selection when several are active | Guaranteed per-task selection/fan-out and verified provider identity shown alongside editable labels |
| Connector execution | Generic discovery, execution, persisted external effects, approval rules and logs | Curated task tools, account binding in approval/effect identity, and normalized source results |
| Calendar | Controlled standard Calendar API reads, normalized snapshots, bounded retrieval, durable briefing receipts, model grounding and consent | Next-meeting selection and attendee/CRM/email retrieval; current specialized briefing concerns tomorrow's schedule |
| To-dos | `ScratchpadItem` plus scratchpad add/update/complete tools | Email source keys, extraction deduplication, structured provenance and preservation of user edits |
| Scheduling | `Routine` stores cron/timezone/next run; executor uses jobs and persisted runs | A saved report specification, destination-bound write authorization, and report-level reconciliation |
| Analytics/CRM | Generic managed catalog/tool access | No dedicated HubSpot meeting resolver or GA4-to-Sheets report implementation found in inspected workflow paths |

The installed Composio dependency is `@composio/core` 0.18.1. The adapter already creates
sessions, disables the Composio sandbox, and uses the managed connection UI. Keep those
choices; do not introduce another agent runtime or move credentials into the computer sandbox.

`ConnectorCall` already contains an optional `connectionId`, but the generic executor does
not populate it and the Composio execution method does not consume it. Nested meta-tool
arguments can carry account selection, so this is not evidence that multi-account execution
is universally broken. It is evidence that a starter cannot yet guarantee backend-owned
account routing independently of the model. Resolve a local connection ID to its allowed
provider reference inside the adapter and include that binding in durable effects.

Generic Composio batch execution also presents an approval/UX boundary: the visible tool is
`COMPOSIO_MULTI_EXECUTE_TOOL`, rather than each underlying action. The current conservative
name gate treats it as consequential. Prefer known individual operations for these starters;
do not relax the wrapper globally to make read-only mailbox searches feel faster.

## Recommended interaction

Show four concise suggestions in the empty conversation. Clicking fills the composer and
preserves normal submission. Do not silently send a request, connect accounts, or enable a
recurring automation on a suggestion click.

| Visible suggestion | Prefilled draft |
| --- | --- |
| Search all my Gmail accounts | `Search all my connected Gmail accounts for…` |
| Build a brief for my next meeting | `Prepare me for my next meeting using my calendar, relevant emails, and HubSpot.` |
| Turn my inbox into a to-do list | `Turn emails from the past seven days into a prioritized to-do list, with links to each source.` |
| Pull this week's numbers into a Sheet | `Pull this week's GA4 numbers into a Google Sheet.` |

The ellipsis invites the user to supply a search topic. The seven-day inbox window keeps the
first scan understandable and bounded. Detailed execution rules belong in the backend,
rather than long instruction paragraphs in the editable prompt.

On submission, ask only for missing information needed to execute: Gmail account selection,
an ambiguous meeting/contact, GA4 property/metrics, or the Sheet destination. If authentication
is missing, show the relevant connect action in the conversation and resume that task after
consent. Avoid routing the user through a full integration marketplace. Retain task state
across browser OAuth callbacks and mobile backgrounding; the server verifies completion.

Defaults can be reused within the same user/space after the user establishes them. A newly
connected work mailbox should not silently enter an existing personal task or scheduled job.
Make the selected accounts inspectable before execution; “all” means all accounts selected
for that task, with a visible count. Preserve provider identity even when a label is renamed.

Use the same shared starter IDs and contracts across web/Electron and mobile. Mobile can use
native menus/sheets for choices while retaining the same server execution and result contracts.

## Workflow details

### Gmail search

Fan out a single interpreted query to the selected mailbox IDs with bounded concurrency.
Use Gmail search syntax, paginate IDs, and retrieve bodies only for relevant candidates.
Deduplicate within a mailbox; group cross-account copies without discarding the account-specific
originals. Return useful results even if one account fails, with explicit incomplete coverage.
Treat timeouts, authorization failures and pagination bounds differently from zero matches.

Composio multi-account sessions require explicit selection to avoid the most-recently-connected
account default. Its documented session limit is ten accounts per toolkit; enforce or disclose
that limit rather than offering unbounded “all accounts.” Gmail `gmail.metadata` cannot express
`q`, so mailbox search/content extraction requires appropriate scopes such as `gmail.readonly`.
Sources: [multiple accounts](https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts),
[Gmail list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).

### Meeting preparation

Choose the next upcoming eligible meeting from the selected Calendars in the user's timezone.
Ask when overlaps or missing attendees make the choice ambiguous. Match attendee email to
HubSpot contacts first, then follow relevant deal/note associations. Do not use a display-name
match as sufficient identity proof or retrieve every CRM record. Fetch relevant Gmail threads
in parallel once identities are resolved.

Return the meeting/agenda, relationship context, open commitments, and useful questions with
links. Separate verified facts from suggested preparation. If HubSpot is unavailable, offer
a calendar/email brief and name the missing source. LinkedIn sign-in identifies the authenticated
member; general attendee profile research needs a separately approved access path.
Source: [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).

Treat ten seconds as a performance target for an already-connected, bounded request. Measure
end-to-end latency and source coverage before publishing it as a claim. Progressive results
can show verified meeting context before the optional CRM enrichment completes.

### Inbox actions

Use recent conversation context, not only snippets or unread flags. Extract the action,
responsible person, explicit deadline if present, source message, and a short priority reason.
An uncertain action remains a suggestion. Let users accept/edit the resulting list, then reuse
the existing scratchpad. Stable source keys should include the local connection, thread/message,
and extracted action identity so rescanning does not create duplicates. Preserve completed items
and manual changes. Internal execution `Task` rows are not the user's to-do list.

Avoid building a permanent raw mailbox index as the first implementation. Design retention,
deletion, downstream model use and consent around Google's current Workspace policy, including
its restrictions on permanent copies and cache duration. User-approved derived actions still
need an explicit retention policy; consent alone does not waive API terms.
Source: [Workspace user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

### GA4 to Sheets

Start with sessions, active users, and views. Offer configured key events or revenue when the
property supports the intended business definition. Store exact API metric names, property ID,
reporting timezone, date boundaries and destination. This week's report is week-to-date, not
a completed week; GA4 processing delays mean recent values may change. For a Monday recurrence,
offer the previous completed week explicitly rather than silently changing the original request.
Request unique-user totals for the whole period instead of summing daily unique counts; compute
rates from their underlying quantities. Preserve sampling, thresholding and restricted-data
warnings from the report metadata. Sources:
[GA4 metric definitions](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema),
[response metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData),
[freshness](https://support.google.com/analytics/answer/11198161?hl=en).

Prefer a newly created report Sheet or a user-selected file with per-file authorization when
supported. `drive.file` can narrow access; entering an arbitrary existing file URL does not
itself grant that scope access. Custom OAuth/scopes and a compatible picker flow may be needed.
Source: [Drive scopes and Picker](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Preview the columns, date range, account and destination before the first write. Save a concrete
report specification when the user chooses recurrence. Reuse Rakazo routines for scheduling.
Use a deterministic report key and reserved range/tab; reruns overwrite the same owned report
and preserve unrelated cells. Batch writes and verify the target values. Use raw input for
external text to avoid interpreting it as spreadsheet formulas. Do not blindly retry an
uncertain append/create: first determine whether the remote operation happened.

Composio proxy calls are sent once; application retries remain Rakazo's responsibility.
Source: [proxy error behavior](https://docs.composio.dev/docs/extending-sessions/proxy-execute).

## Provider choice, privacy and cost

| Approach | Fit here | Tradeoff |
| --- | --- | --- |
| Composio Platform | Recommended first managed adapter; already integrated; sessions, account selection, tools and authenticated proxy | Additional processor; payload retention/settings and OAuth app ownership need deliberate configuration |
| Pipedream Connect | Existing alternative adapter; consider if its default payload non-retention is decisive | Different production/per-user cost model and workflow component behavior to validate |
| Direct platform APIs | Strong control for specialized readers/reporters; direct Calendar precedent already exists | Rakazo takes on OAuth app setup, refresh, revocation and upstream API maintenance |

Composio stores execution arguments/results in logs for up to one year by default. Its paid
Zero Data Retention setting covers eligible tool/proxy payloads but covers Composio-managed
OAuth apps only on Enterprise. For a public email product, evaluate owned OAuth clients with
Pro ZDR, or Enterprise managed auth, before selecting the production configuration. Files,
triggers, sandbox state and tool-search queries have separate exclusions. Keep the sandbox
disabled and sensitive mailbox queries out of semantic tool discovery. ZDR does not govern
Rakazo's own storage or the model provider.
Sources: [retention](https://docs.composio.dev/docs/security/data-retention),
[ZDR coverage](https://docs.composio.dev/docs/security/zero-data-retention).

Google classifies `gmail.readonly` as restricted. Public applications processing restricted
data through servers generally need verification and an annual assessment unless an exception
applies. Validate the end-to-end OAuth and downstream processing path; do not assume the
broker's app verification covers Rakazo's model/storage behavior.
Sources: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

Current Composio Pro is $29/month including $29 usage credit. Beyond allowances, own-app tool
calls cost $0.0003 each; managed-app calls $0.0005. Proxy adds $0.0002/call and ZDR
$0.0001/call. As an illustrative workload, three mailbox listings plus eighteen thread reads
are 21 executions: $0.0063 own-app base usage before allowances, credit, add-ons and model costs.
Actual metering depends on catalog-tool versus proxy fan-out. This is arithmetic, not a live
benchmark or invoice estimate. Source: [pricing](https://composio.dev/pricing).

Pipedream states Connect API/MCP request/response bodies are not stored by default. Its
published Connect production pricing is $150/month monthly, or $99/month billed annually,
including 100 external users, with additional user and compute charges. Assess it as a
privacy/cost alternative rather than replacing a working adapter preemptively.
Sources: [Pipedream security](https://pipedream.com/docs/privacy-and-security#data-storage-and-logging),
[Connect pricing](https://pipedream.com/pricing?plan=Connect).

## Delivery order and acceptance

1. Shared starter definitions and connection/task preflight; explicit account binding.
2. Multi-account Gmail search, then inbox extraction using the same mailbox reader.
3. Calendar + Gmail + HubSpot meeting preparation. LinkedIn is optional pending access proof.
4. One-shot GA4 report to Sheets, then a saved destination-bound weekly routine.

Each slice should include deterministic offline conformance tests, account/space isolation,
partial failures, token revocation, pagination bounds and source attribution. Write workflows
also need timeout-after-success/reconciliation, duplicate wakeups and user-edit preservation.
UI verification must cover desktop and mobile. Run Electron E2E only in CI as required by
the repository. Live acceptance must separately prove multiple real accounts, actual granted
scopes, CRM/GA4 data, verified Sheet values and a genuine scheduled execution.

The largest external launch constraints are Gmail authorization/data handling, actual work
account/admin permissions, and LinkedIn access. Composio reduces integration work; it does not
remove those constraints or make an agent's output correct by itself.

## Supporting research

- [Composio and alternatives](research/composio-task-starters.md)
- [Platform API and permission constraints](research/task-starter-platform-constraints.md)

## Verification of inspected foundations

- Composio connector, provider settings, managed Calendar access, connection waiting and
  approval unit tests: 92 passed across five files.
- Scratchpad, scheduling, routine scheduling and connector read-only approval tests:
  74 passed across four files; 166 focused tests passed overall.
- Type checks passed for contracts, adapter-kit, core and adapters.
- Repository lint ran but failed on two formatting/import-order diagnostics in an unrelated
  temporary test helper already present in the working environment; no automatic fixes applied.
- No production code or user connections were changed for this research.
