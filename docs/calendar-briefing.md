# Calendar briefing

The Calendar action in an assistant's desktop/web conversation connects Google Calendar and automatically starts a read-only briefing for tomorrow. Mobile exposes the same connection in Integrations and renders the saved briefing in the conversation. OAuth client configuration is available in the desktop/web connection dialog; mobile directs the server owner there for setup.

## Managed app setup

The shortest path is **Server integrations → Composio**: the deployment owner saves one API key, then members connect Google Calendar or Gmail from **Integrations** using browser consent. Composio is optional; direct MCP and the Google OAuth setup below remain available without it. Credentials stay in the existing encrypted provider settings.

The Calendar action reuses a connected Google Calendar app account, or starts its managed sign-in. Multiple accounts can be selected. The API verifies calendar and event access before atomically attaching the account and queueing a briefing. The Composio adapter reads the standard Google Calendar API through its authenticated GET proxy; Google tokens are not exported to Rakazo. API and worker resolve the same provider configuration. Live use requires the account's Calendar read scopes and Composio proxy permission; offline fixtures do not verify those grants.

Revoking the app account prevents retrieval, retries and publication of saved briefing outcomes. **Disconnect briefing** removes this local Calendar attachment while leaving the app account available for other tools. Remove the account in Integrations to disconnect it everywhere. Direct Google OAuth disconnect still revokes the direct grant as described below.

## Direct Google OAuth setup

1. Apply migrations with `pnpm db:migrate`, regenerate the client with `pnpm db:generate`, and restart the API and worker.
2. Enable [Google Calendar API](https://developers.google.com/workspace/calendar/api/quickstart/js) in a Google Cloud project. Configure its OAuth consent screen and create a **Web application** OAuth client.
3. Open **Connect Google Calendar** in the desktop app. The deployment owner enters the client ID and client secret in connection settings. These are encrypted through the existing secret store, shared by API and worker, and never returned to clients after saving.
4. Register the exact **Redirect URI** displayed in that dialog. It is `${API_URL}/api/calendar/oauth/callback`. Use a reachable HTTPS API URL for hosted installations; localhost development can use the existing loopback API URL. Mobile requires a server address reachable from the device.
5. Allow these two scopes on the consent screen: `calendar.calendarlist.readonly` and `calendar.events.readonly`. [Testing-mode Google applications](https://developers.google.com/identity/protocols/oauth2#expiration) require approved test users and may have refresh tokens that expire after seven days. Production distribution requires the applicable Google verification process.
6. Connect from the assistant conversation. An existing model connection and its AI data-sharing consent enable personalized preparation suggestions. Without a usable model or consent, the actual schedule and conflicts are still saved, with suggestions explicitly marked unavailable.

The direct setup does not depend on Composio or Pipedream and does not create calendar write tools. Existing generic integrations remain available; the dedicated Calendar action provides the guaranteed read-only briefing workflow.

## Execution and evidence

OAuth uses random one-use state, PKCE, a ten-minute expiry, and an API callback. The browser callback needs no desktop session cookie: its authorization is the stored state bound to the initiating account, space, and assistant. Code exchange is never replayed after an uncertain failure; the user reconnects instead. Callback errors and request logs contain no codes or tokens.

Connection completion, task/run creation, receipt creation and initial conversation events commit together. The existing Graphile queue and reconciler wake the task. The in-memory development path uses the same handlers. Briefings use existing fenced run leases, attempts, cancellation, and finalization, with three automatic attempts per retry request. A missed queue wake is repaired from the persisted run. A verified snapshot and generated outcome are reused after interrupted publication; only one terminal briefing message is committed.

Tomorrow is calculated from the connection time in the supplied IANA timezone, including daylight-saving boundaries. The adapter enumerates readable calendars, paginates events, expands recurrence, excludes cancellations, deduplicates shared instances and distinguishes all-day/free/declined events from busy conflicts. Any unreadable calendar or exceeded retrieval bound fails the task instead of claiming an empty or complete schedule. Bounds are 50 calendars, 20 pages per query and 500 normalized events. The conversation shows up to 12 events; the receipt retains the complete bounded snapshot.

**View receipt** shows authoritative run status, timestamps, attempt count, sources, normalized events, retrieval time, the saved outcome, suggestion status and preference revision references. Facts are rendered from calendar records. Model prose appears only under **AI suggestions** and must reference supplied events. The model gets no tools, unrelated conversation history, credentials or attendee lists. Event descriptions and preferences are treated as untrusted data. The recipient's existing AI consent is rechecked before a request. Model calls are accounted through the existing usage store.

Reconnects create a new generation; an old callback/run cannot overwrite or publish from it. Disconnect disables local access before attempting remote revocation and retains credentials and blocks reconnect if remote cleanup needs retry. The connection dialog keeps Disconnect available for cleanup retries. Receipts remain inspectable until their conversation/run or account is removed. [Google grant revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) can affect all tokens for the same client/account, so failed or superseded callbacks retain inactive encrypted credentials for explicit disconnect instead of remotely revoking a newer connection's grant.

## Memory

Briefing preferences are explicit, user-scoped Markdown in `calendar/preferences.md`, in the existing revisioned memory store. The settings disclosure lets the user inspect, edit, or forget them. Revisions cite the assistant conversation; receipts cite the memory document and revision used. Saves detect stale revisions. Forget deletes the document and its revision history. Calendar events and attendees are not copied into preference memory. Receipts retain calendar evidence separately.

## Verification

Offline tests cover scopes/PKCE, pagination, malformed responses, cancellation, DST, conflicts, model grounding and consent. The opt-in PostgreSQL test covers actual encrypted OAuth persistence, concurrent callbacks/workers, reconnections, queue recovery, interrupted publication, bounded retries, account isolation, memory edits and deletion. Run it only against a migrated isolated test database:

```sh
VERIFY_DATABASE=1 DATABASE_URL='<isolated-test-database>' pnpm exec vitest run apps/api/src/calendar.postgres.test.ts
```

The web E2E test captures the Calendar onboarding and receipt surfaces for CI. Desktop Electron E2E stays in CI's virtual-display job. A real Google consent/token/refresh round trip and a real model-backed briefing still require the configured OAuth client, test/production account and model; offline tests do not establish those external results.
