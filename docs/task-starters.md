# Connected task starters

Rakazo offers four editable starter prompts in the main assistant conversation on web, Electron, and mobile. Clicking a suggestion fills the composer; submitting opens source selection. The backend owns account selection, validation, execution, receipts, saved tasks, publication, and recurrence.

The initial targets are Gmail, Google Calendar, HubSpot, Google Analytics 4, and Google Sheets. LinkedIn enrichment is not included: an ordinary LinkedIn connection cannot retrieve arbitrary meeting attendees. Meeting briefs work from Calendar, optional Gmail, and optional HubSpot.

## Setup

1. Install the existing workspace dependencies with `pnpm install --frozen-lockfile`.
2. Generate the Prisma client with `pnpm db:generate` and apply migrations with `pnpm --filter @rakazo/db exec prisma migrate deploy`. Use the configured direct database endpoint for migrations and the worker.
3. Run the API, worker, and web through `pnpm dev:host` or the existing deployment topology. Task workflows use the existing durable run/worker system and do not require a computer sandbox.
4. Configure Composio or Pipedream in integration connection settings. Composio is the recommended first hosted adapter; both are optional. No vendor key is committed or required for the core product.
5. For public distribution, use your own OAuth applications. The advanced Composio settings accept a toolkit-to-auth-config map, for example `{"gmail":"ac_example","googlecalendar":"ac_example_calendar","hubspot":"ac_example_crm","google_analytics":"ac_example_analytics","googlesheets":"ac_example_sheets"}`. Replace the example IDs with your actual Composio auth-config IDs. Configure the applications in the provider dashboard before connecting accounts.
6. Connect each Gmail account separately. Connect Calendar, HubSpot, GA4, and Sheets as needed. Select the exact accounts when starting a task; accounts are scoped to the signed-in user and Space.
7. Connect a model and grant the existing AI data-sharing consent for extracting inbox tasks or synthesizing a brief. Gmail search and GA4 reporting do not need model synthesis. Without a synthesis model, a meeting brief still exposes verified meeting information.

OAuth applications must enable the APIs and scopes used by the adapter. Gmail reads require `gmail.readonly`; Calendar reads require `calendar.readonly`; GA4 requires `analytics.readonly`; Sheets writes require spreadsheet access, and discovery/creation requires the corresponding per-file Drive access where supported (`drive.file`). HubSpot requires read access to contacts and the associated companies, deals, and notes exposed by the account. Provider catalog/auth-config scopes must cover all requested operations. Workspace administrators can restrict authorization independently of these settings.

Google restricted Gmail scopes can require public-app verification and a security assessment when processed on a server. Composio does not remove these requirements. Select the appropriate vendor payload retention and ZDR settings before handling real email. See the linked research for scope, retention, and vendor-policy details.

## Behavior

- **Search Gmail:** select the mailboxes and a topic or Gmail query. Searches run against each selected account and return account-attributed source links with coverage and failures. Bounded results are identified as limited.
- **Meeting brief:** search the selected calendars for the next meeting. Duplicate shared-calendar events are collapsed; overlapping distinct meetings require an explicit choice. Facts and preparation suggestions have sources. Missing optional email or CRM context is disclosed.
- **Inbox to-do list:** review candidate tasks, edit their title, notes, priority, and date, then save selected tasks into the existing scratchpad. Saving is idempotent and preserves later edits and completion state.
- **GA4 to Sheets:** select a property, metrics, report period, and exact Sheets account/destination. Periods use the property's timezone and Monday-based weeks. Unique-user totals come from a period-level GA4 report. Recent numbers are marked provisional. Review before publishing. Reports use a dedicated deterministic tab/range, RAW cell values, and read-back verification. Recurrence uses the existing routines scheduler with the saved accounts, destination, metrics, and authorization.

A report preview does not write externally. Publication and explicitly enabled recurring publication are durable operations. If a provider operation's outcome is unknown, the receipt offers **Check outcome** to inspect the existing Sheet. It does not repeat an uncertain mutation. Definite rejected operations can be retried after correcting the cause. Account revocation or replacement prevents continued execution and publication of newly fetched results.

## Architecture

Shared task contracts live in `packages/contracts/src/task-starters.ts`, prompt/report helpers in `packages/core/src/task-starters.ts`, and the provider-neutral boundary in `packages/adapter-kit/src/task-starters.ts`. `TaskPlatform` translates bounded reads and spreadsheet operations through the Composio and Pipedream adapters. Vendor SDK usage remains in adapter composition roots.

`TaskStarterService` exposes authenticated RPC operations. `task-starter-runner.ts` executes leased, fenced runs using the existing job handler and stores structured receipts in `TaskStarterExecution`. The database migration also adds stable scratchpad action keys and saved routine specifications. The normal thread contains an initial receipt card and a concise sourced completion; full results remain in the structured receipt.

Untrusted emails, calendar descriptions, and CRM notes are data rather than model instructions. Synthesis runs with no tools, validated JSON output, bounded input/output, existing consent checks, and usage accounting. Backend checks revalidate the exact user, Space, connection, and provider account before calls and before committing completion.

## Verification

Deterministic adapter conformance, runner/service, contract, shared period, and platform UI tests cover the offline boundary. The isolated PostgreSQL and web harnesses use fake external services; they do not exercise real OAuth grants or production account permissions. Live provider acceptance requires authorized accounts, actual OAuth app configuration, and credentials supplied through connection settings.

Research: [Composio integration](research/composio-task-starters.md), [platform constraints](research/task-starter-platform-constraints.md).
