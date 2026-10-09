import type { AdapterContext, TaskConnection } from "@rakazo/adapter-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComposioConnector } from "./composio-connector.js";
import { PipedreamConnector } from "./pipedream-connector.js";
import {
  RestTaskPlatform,
  TaskPlatformReconciliationError,
  TaskPlatformRejectedError,
  type TaskProxy,
  type TaskProxyRequest,
  validateTaskProxyRequest,
} from "./task-platform.js";

const sdk = vi.hoisted(() => ({ proxy: vi.fn(), list: vi.fn(), execute: vi.fn() }));
vi.mock("@composio/core", () => ({
  Composio: class {
    tools = { proxyExecute: sdk.proxy, execute: sdk.execute };
    connectedAccounts = { list: sdk.list };
  },
}));
const context: AdapterContext = {
  userId: "test-user",
  spaceId: "test-space",
  operationId: "test-operation",
  traceId: "test-trace",
  signal: new AbortController().signal,
};
const connection: TaskConnection = {
  id: "local-account-one",
  connectorId: "composio",
  provider: "gmail",
  providerRef: "ca_mail_one",
  displayName: "Personal",
};
const sheetConnection: TaskConnection = {
  ...connection,
  provider: "googlesheets",
  providerRef: "ca_sheet_one",
};
const analyticsConnection: TaskConnection = {
  ...connection,
  provider: "google_analytics",
  providerRef: "ca_analytics_one",
};
const spreadsheet = "sheet_example_123456";

function fixtures(handler: (request: TaskProxyRequest) => unknown) {
  const calls: TaskProxyRequest[] = [];
  const proxy: TaskProxy = async (request) => {
    calls.push(request);
    return { status: 200, data: handler(request) };
  };
  return { platform: new RestTaskPlatform(proxy), calls };
}

beforeEach(() => vi.clearAllMocks());

describe("Gmail starter REST conformance", () => {
  it("queries all pages, scopes links by verified identity, and decodes MIME alternatives", async () => {
    const { platform, calls } = fixtures((request) => {
      const target = new URL(request.url);
      if (target.pathname.endsWith("/profile")) return { emailAddress: "personal@example.test" };
      if (target.pathname.endsWith("/messages"))
        return target.searchParams.has("pageToken")
          ? { messages: [{ id: "mail_two" }] }
          : { messages: [{ id: "mail_one" }], nextPageToken: "page-two" };
      return {
        id: target.pathname.endsWith("mail_two") ? "mail_two" : "mail_one",
        threadId: "thread_one",
        internalDate: "1791500000000",
        snippet: "Send the proposal",
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "Subject", value: "Proposal" },
            { name: "From", value: "Client <client@example.test>" },
            { name: "To", value: "Personal <personal@example.test>" },
          ],
          parts: [
            {
              mimeType: "text/html",
              body: { data: Buffer.from("<b>duplicate</b>").toString("base64url") },
            },
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from("Please send the proposal by Friday.").toString("base64url"),
              },
            },
          ],
        },
      };
    });
    const result = await platform.searchMail(
      { connection, query: "proposal after:2026/10/01", maxMessages: 20 },
      context,
    );
    expect(result.complete).toBe(true);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      connectionId: "local-account-one",
      accountLabel: "personal@example.test",
      text: "Please send the proposal by Friday.",
      to: ["personal@example.test"],
      url: "https://mail.google.com/mail/u/personal%40example.test/#all/thread_one",
    });
    expect(calls.every((call) => call.connection.providerRef === "ca_mail_one")).toBe(true);
    expect(
      calls
        .filter((call) => call.url.includes("/messages?"))
        .map((call) => new URL(call.url).searchParams.get("q")),
    ).toEqual(["proposal after:2026/10/01", "proposal after:2026/10/01"]);
  });

  it("marks limited retrieval and does not query an extra page beyond the user limit", async () => {
    const { platform, calls } = fixtures((request) =>
      request.url.endsWith("profile")
        ? { emailAddress: "work@example.test" }
        : new URL(request.url).pathname.endsWith("messages")
          ? { messages: [{ id: "one" }], nextPageToken: "more" }
          : {
              id: "one",
              threadId: "thread",
              internalDate: "1791500000000",
              payload: {
                mimeType: "text/html",
                body: {
                  data: Buffer.from("<script>secret()</script><p>Action &amp; owner</p>").toString(
                    "base64url",
                  ),
                },
              },
            },
    );
    const result = await platform.searchMail(
      { connection, query: "in:inbox", maxMessages: 1 },
      context,
    );
    expect(result.complete).toBe(false);
    expect(result.messages[0]?.text).toBe("Action & owner");
    expect(calls.filter((call) => new URL(call.url).pathname.endsWith("messages"))).toHaveLength(1);
  });
});

describe("meeting briefing REST conformance", () => {
  it("reads every calendar, skips cancelled, declined, and untimed events, preserves exact attendees", async () => {
    const calendar = { ...connection, provider: "googlecalendar" };
    const { platform, calls } = fixtures((request) =>
      request.url.includes("calendarList")
        ? { items: [{ id: "primary@example.test" }, { id: "shared@example.test" }] }
        : {
            items: [
              { id: "cancelled", status: "cancelled" },
              { id: "all_day", start: { date: "2026-10-09" }, end: { date: "2026-10-10" } },
              { id: "declined", attendees: [{ self: true, responseStatus: "declined" }] },
              {
                id: "meeting_one",
                summary: "Proposal review",
                start: { dateTime: "2026-10-09T12:00:00-05:00" },
                end: { dateTime: "2026-10-09T12:30:00-05:00" },
                description: "<p>Review deal</p>",
                attendees: [
                  { email: "Client@example.test" },
                  { email: "other@example.test", responseStatus: "declined" },
                ],
                htmlLink: "https://calendar.google.com/calendar/event?eid=example",
              },
            ],
          },
    );
    const result = await platform.upcomingMeetings(
      { connection: calendar, timeMin: "2026-10-09T00:00:00Z", timeMax: "2026-10-16T00:00:00Z" },
      context,
    );
    expect(result.complete).toBe(true);
    expect(result.meetings).toHaveLength(2);
    expect(result.meetings[0]).toMatchObject({
      attendees: ["client@example.test"],
      description: "Review deal",
    });
    expect(
      calls
        .filter((call) => call.url.includes("/events?"))
        .map((call) => new URL(call.url).searchParams.get("singleEvents")),
    ).toEqual(["true", "true"]);
  });

  it("retrieves exact-email contacts and hydrates associated deals and notes", async () => {
    const { platform } = fixtures((request) => {
      const target = new URL(request.url);
      if (target.pathname.endsWith("/details")) return { portalId: 12345 };
      if (target.pathname.endsWith("/search"))
        return {
          results: [
            { id: "1", properties: { firstname: "Client", email: "client@example.test" } },
            { id: "wrong", properties: { email: "lookalike@example.test" } },
          ],
        };
      if (target.pathname.includes("/associations/"))
        return { results: [{ toObjectId: target.pathname.endsWith("deals") ? 2 : 3 }] };
      if (target.pathname.endsWith("/deals/2"))
        return { properties: { dealname: "Proposal", amount: "1000", dealstage: "presentation" } };
      if (target.pathname.endsWith("/notes/3"))
        return {
          properties: {
            hs_note_body: "<p>Budget approved</p>",
            hs_timestamp: "2026-10-08T12:00:00Z",
          },
        };
      throw new Error("Unexpected fixture request");
    });
    const result = await platform.hubspotContext(
      { connection: { ...connection, provider: "hubspot" }, emails: ["client@example.test"] },
      context,
    );
    expect(result.records.map((record) => record.id)).toEqual(["contact:1", "deals:2", "notes:3"]);
    expect(result.records[2]?.text).toContain("Budget approved");
    expect(result.records[1]?.url).toBe("https://app.hubspot.com/contacts/12345/record/0-3/2");
  });
});

describe("GA4 report REST conformance", () => {
  function reportFixtures(value = "57") {
    return fixtures((request) => {
      const target = new URL(request.url);
      if (target.pathname.endsWith("accountSummaries"))
        return {
          accountSummaries: [
            { propertySummaries: [{ property: "properties/123", displayName: "Example site" }] },
          ],
        };
      if (target.hostname === "analyticsadmin.googleapis.com")
        return { displayName: "Example site", timeZone: "America/Chicago", currencyCode: "USD" };
      if (target.pathname.endsWith("metadata"))
        return {
          metrics: [
            { apiName: "sessions", uiName: "Sessions" },
            { apiName: "activeUsers", uiName: "Active users" },
          ],
        };
      if (target.pathname.endsWith(":checkCompatibility"))
        return {
          metricCompatibilities: [
            { metricMetadata: { apiName: "sessions" }, compatibility: "COMPATIBLE" },
            { metricMetadata: { apiName: "activeUsers" }, compatibility: "COMPATIBLE" },
          ],
        };
      return {
        metricHeaders: [{ name: "activeUsers" }, { name: "sessions" }],
        rows: [{ metricValues: [{ value }, { value: "100" }] }],
        metadata: { timeZone: "America/Chicago", currencyCode: "USD", subjectToThresholding: true },
      };
    });
  }
  it("gets property timezones and period totals without summing daily unique users", async () => {
    const { platform, calls } = reportFixtures();
    expect(await platform.analyticsProperties(analyticsConnection, context)).toEqual([
      { id: "123", name: "Example site", timezone: "America/Chicago" },
    ]);
    const result = await platform.analyticsReport(
      {
        connection: analyticsConnection,
        propertyId: "123",
        metrics: ["sessions", "activeUsers"],
        startDate: "2026-10-05",
        endDate: "2026-10-09",
      },
      context,
    );
    expect(result.report.metrics).toEqual([
      { name: "sessions", label: "Sessions", value: 100 },
      { name: "activeUsers", label: "Active users", value: 57 },
    ]);
    expect(result.report).toMatchObject({ timezone: "America/Chicago", currency: "USD" });
    expect(result.warnings).toHaveLength(1);
    expect(calls.find((call) => call.url.endsWith(":runReport"))?.body).not.toHaveProperty(
      "dimensions",
    );
  });
  it.each(["NaN", "Infinity", "1e999", "", "unexpected"])(
    "rejects nonfinite or malformed provider numbers %s",
    async (value) => {
      await expect(
        reportFixtures(value).platform.analyticsReport(
          {
            connection: analyticsConnection,
            propertyId: "123",
            metrics: ["sessions", "activeUsers"],
            startDate: "2026-10-05",
            endDate: "2026-10-09",
          },
          context,
        ),
      ).rejects.toThrow();
    },
  );
});

describe("Sheets publication and recovery conformance", () => {
  it("finds a deterministically marked sheet after an uncertain create, without replaying create", async () => {
    let exists = false;
    const calls: TaskProxyRequest[] = [];
    const platform = new RestTaskPlatform(async (request) => {
      calls.push(request);
      if (request.method === "POST") {
        exists = true;
        throw new Error("Response lost");
      }
      return { status: 200, data: { files: exists ? [{ id: spreadsheet }] : [] } };
    });
    expect(
      await platform.createReportSheet(sheetConnection, "Weekly report", "operation-one", context),
    ).toBe(spreadsheet);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
      mimeType: "application/vnd.google-apps.spreadsheet",
      appProperties: { rakazoReport: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
  });
  it("classifies unknown sheet creation and duplicate markers as requiring reconciliation", async () => {
    const platform = new RestTaskPlatform(async (request) => {
      if (request.method === "POST") throw new Error("Response lost");
      return { status: 200, data: { files: [] } };
    });
    await expect(
      platform.createReportSheet(sheetConnection, "Report", "operation-one", context),
    ).rejects.toBeInstanceOf(TaskPlatformReconciliationError);
    const duplicate = fixtures(() => ({
      files: [{ id: spreadsheet }, { id: "other_sheet_12345" }],
    }));
    await expect(
      duplicate.platform.findReportSheet(sheetConnection, "operation-one", context),
    ).rejects.toBeInstanceOf(TaskPlatformReconciliationError);
  });
  it("creates a missing report tab, writes RAW to prevent formulas, and verifies final cells", async () => {
    let hasTab = false;
    let values: unknown = [];
    const { platform, calls } = fixtures((request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith(":batchUpdate")) {
        hasTab = true;
        return { replies: [{}] };
      }
      if (!path.includes("/values/"))
        return { sheets: hasTab ? [{ properties: { title: "Rakazo" } }] : [] };
      if (request.method === "PUT") {
        values = request.body?.values;
        return { updatedRows: 2 };
      }
      return { values };
    });
    expect(await platform.readSheet(sheetConnection, spreadsheet, "Rakazo!A1:B2", context)).toEqual(
      [],
    );
    await platform.writeSheet(
      sheetConnection,
      spreadsheet,
      "Rakazo!A1:B2",
      [
        ["Metric", "Value"],
        ["=malicious()", 42],
      ],
      context,
    );
    const write = calls.find((call) => call.method === "PUT");
    expect(new URL(write?.url ?? "").searchParams.get("valueInputOption")).toBe("RAW");
    expect(write?.body?.values).toEqual([
      ["Metric", "Value"],
      ["=malicious()", 42],
    ]);
  });
  it("never retries writes and rejects mismatched readback", async () => {
    let writes = 0;
    const platform = new RestTaskPlatform(async (request) => {
      if (request.method === "PUT") {
        writes++;
        return { status: 503, data: {} };
      }
      return { status: 200, data: { values: [[99]] } };
    });
    await expect(
      platform.writeSheet(sheetConnection, spreadsheet, "A1", [[42]], context),
    ).rejects.toThrow("HTTP 503");
    expect(writes).toBe(1);
    await expect(
      fixtures((request) =>
        request.method === "PUT" ? {} : { values: [[99]] },
      ).platform.writeSheet(sheetConnection, spreadsheet, "A1", [[42]], context),
    ).rejects.toThrow("could not be verified");
  });
});

describe("managed account-scoped transport conformance", () => {
  it("Composio sends only the exact selected account and respects abort signal", async () => {
    sdk.list.mockResolvedValue({ items: [{ id: connection.providerRef }] });
    sdk.proxy.mockResolvedValue({ status: 200, data: { emailAddress: "personal@example.test" } });
    expect(
      await new ComposioConnector("fake-project-key").taskPlatform().identity(connection, context),
    ).toBe("personal@example.test");
    expect(sdk.proxy).toHaveBeenCalledWith(
      {
        connectedAccountId: connection.providerRef,
        endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        method: "GET",
      },
      { signal: context.signal },
    );
    expect(sdk.list).toHaveBeenCalledWith(
      { userIds: [context.userId], toolkitSlugs: ["gmail"], statuses: ["ACTIVE"] },
      { signal: context.signal },
    );
  });
  it("Pipedream binds proxy to selected account and its workspace-scoped user", async () => {
    const calls: Request[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/oauth/token"))
        return Response.json({ access_token: "fake-access-token", expires_in: 3600 });
      if (path.endsWith("/accounts"))
        return Response.json({ data: [{ id: "apn_mail_one", healthy: true }] });
      return Response.json({ emailAddress: "work@example.test" });
    });
    const provider = new PipedreamConnector(
      {
        clientId: "fake-client",
        clientSecret: "fake-secret",
        projectId: "fake-project",
        environment: "development",
        identitySecret: "fake-identity-secret",
      },
      { fetch },
    );
    expect(
      await provider
        .taskPlatform()
        .identity(
          { ...connection, connectorId: "pipedream", providerRef: "apn_mail_one" },
          context,
        ),
    ).toBe("work@example.test");
    const proxy = calls.find((request) => new URL(request.url).pathname.includes("/proxy/"));
    const target = new URL(proxy?.url ?? "");
    expect(target.searchParams.get("account_id")).toBe("apn_mail_one");
    expect(target.searchParams.get("external_user_id")).toMatch(/^rkz_[a-f0-9]{64}$/);
    expect(Buffer.from(target.pathname.split("/").at(-1) ?? "", "base64url").toString()).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    );
    expect(proxy?.headers.get("x-pd-environment")).toBe("development");
  });
  it("rejects foreign accounts, unsafe hosts, and cancelled work before sending credentials", async () => {
    sdk.list.mockResolvedValue({ items: [{ id: "ca_some_other_account" }] });
    await expect(
      new ComposioConnector("fake-project-key").taskPlatform().identity(connection, context),
    ).rejects.toThrow("Reconnect");
    expect(sdk.proxy).not.toHaveBeenCalled();
    expect(() =>
      validateTaskProxyRequest({
        connection,
        url: "https://evil.example.test/gmail/v1/users/me/profile",
        method: "GET",
      }),
    ).toThrow("Unsupported");
    expect(() =>
      validateTaskProxyRequest({
        connection,
        url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/id",
        method: "PUT",
      }),
    ).toThrow("Unsupported");
    const abort = new AbortController();
    abort.abort();
    await expect(
      fixtures(() => ({})).platform.identity(connection, { ...context, signal: abort.signal }),
    ).rejects.toThrow();
  });
  it("bounds safe-read retry and response sizes", async () => {
    const retry = vi
      .fn<TaskProxy>()
      .mockResolvedValueOnce({ status: 503, data: {} })
      .mockResolvedValueOnce({ status: 200, data: { emailAddress: "work@example.test" } });
    expect(await new RestTaskPlatform(retry).identity(connection, context)).toBe(
      "work@example.test",
    );
    expect(retry).toHaveBeenCalledTimes(2);
    await expect(
      fixtures(() => ({ body: "x".repeat(3 * 1024 * 1024) })).platform.identity(
        connection,
        context,
      ),
    ).rejects.toThrow("size limit");
  });
});

describe("native Composio Google API families", () => {
  it("uses supported native Analytics actions instead of cross-domain proxy requests", async () => {
    sdk.list.mockResolvedValue({ items: [{ id: analyticsConnection.providerRef }] });
    sdk.execute.mockImplementation(
      async (tool: string, params: { arguments: Record<string, unknown> }) => {
        const data =
          tool === "GOOGLE_ANALYTICS_LIST_ACCOUNT_SUMMARIES"
            ? {
                accountSummaries: [
                  { propertySummaries: [{ property: "properties/123", displayName: "Site" }] },
                ],
              }
            : tool === "GOOGLE_ANALYTICS_GET_PROPERTY"
              ? { displayName: "Site", timeZone: "America/Chicago", currencyCode: "USD" }
              : tool === "GOOGLE_ANALYTICS_GET_METADATA"
                ? { metrics: [{ apiName: "activeUsers", uiName: "Active users" }] }
                : tool === "GOOGLE_ANALYTICS_CHECK_COMPATIBILITY"
                  ? {
                      metricCompatibilities: [
                        { compatibility: "COMPATIBLE", metricMetadata: { apiName: "activeUsers" } },
                      ],
                    }
                  : {
                      metricHeaders: [{ name: "activeUsers" }],
                      rows: [{ metricValues: [{ value: "5" }] }],
                      metadata: { timeZone: "America/Chicago" },
                    };
        if (tool === "GOOGLE_ANALYTICS_RUN_REPORT")
          expect(params.arguments).toMatchObject({
            property: "properties/123",
            limit: 1,
            keepEmptyRows: true,
          });
        return { data, successful: true, error: null };
      },
    );
    const platform = new ComposioConnector("fake-project-key").taskPlatform();
    expect(await platform.analyticsProperties(analyticsConnection, context)).toEqual([
      { id: "123", name: "Site", timezone: "America/Chicago" },
    ]);
    const report = await platform.analyticsReport(
      {
        connection: analyticsConnection,
        propertyId: "123",
        metrics: ["activeUsers"],
        startDate: "2026-10-05",
        endDate: "2026-10-09",
      },
      context,
    );
    expect(report.report.metrics[0]?.value).toBe(5);
    expect(sdk.proxy).not.toHaveBeenCalled();
    expect(
      sdk.execute.mock.calls.every(
        (call) =>
          call[1].connectedAccountId === analyticsConnection.providerRef &&
          call[1].version === "20260924_00",
      ),
    ).toBe(true);
  });
  it("creates and recovers a Sheets-native atomic name marker without a Drive proxy", async () => {
    sdk.list.mockResolvedValue({ items: [{ id: sheetConnection.providerRef }] });
    let title: string | null = null;
    sdk.execute.mockImplementation(
      async (tool: string, params: { arguments: Record<string, unknown> }) => {
        if (tool === "GOOGLESHEETS_SEARCH_SPREADSHEETS") {
          expect(params.arguments).toMatchObject({
            query: expect.stringMatching(/^[a-f0-9]{24}$/),
            search_type: "content",
            max_results: 2,
            include_trashed: false,
          });
          return {
            successful: true,
            error: null,
            data: { spreadsheets: title ? [{ id: spreadsheet, name: title }] : [] },
          };
        }
        title = String(params.arguments.title);
        throw new Error("Create response lost");
      },
    );
    const platform = new ComposioConnector("fake-project-key").taskPlatform();
    expect(
      await platform.createReportSheet(sheetConnection, "GA4 report", "operation-native", context),
    ).toBe(spreadsheet);
    expect(title).toMatch(/^GA4 report · [a-f0-9]{24}$/);
    expect(
      sdk.execute.mock.calls.filter((call) => call[0] === "GOOGLESHEETS_CREATE_GOOGLE_SHEET1"),
    ).toHaveLength(1);
    expect(
      sdk.execute.mock.calls.every(
        (call) =>
          call[1].connectedAccountId === sheetConnection.providerRef &&
          call[1].version === "20261001_00",
      ),
    ).toBe(true);
    expect(sdk.proxy).not.toHaveBeenCalled();
  });
});

it("includes bounded later thread replies and hydrates textual body attachments", async () => {
  const { platform } = fixtures((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("profile")) return { emailAddress: "personal@example.test" };
    if (path.endsWith("messages")) return { messages: [{ id: "mail_one" }] };
    if (path.includes("/attachments/"))
      return { data: Buffer.from("Please send the proposal").toString("base64url") };
    if (path.includes("/threads/"))
      return {
        messages: [
          {
            id: "mail_reply",
            internalDate: "1791500010000",
            payload: {
              mimeType: "text/plain",
              headers: [{ name: "From", value: "personal@example.test" }],
              body: {
                data: Buffer.from("I already sent it; this is complete.").toString("base64url"),
              },
            },
          },
        ],
      };
    return {
      id: "mail_one",
      threadId: "thread_one",
      internalDate: "1791500000000",
      payload: { mimeType: "text/plain", body: { attachmentId: "attachment_body" } },
    };
  });
  const result = await platform.searchMail(
    { connection, query: "proposal", maxMessages: 10, includeThreadContext: true },
    context,
  );
  expect(result.messages[0]?.text).toContain("Please send the proposal");
  expect(result.messages[0]?.text).toContain("I already sent it; this is complete.");
  expect(result.messages[0]?.text).toContain("From: personal@example.test");
});

it.each(["restricted", "empty", "missing"])(
  "does not publish fabricated zeros for %s Analytics data",
  async (kind) => {
    const { platform } = fixtures((request) => {
      const target = new URL(request.url);
      if (target.hostname === "analyticsadmin.googleapis.com")
        return { displayName: "Site", timeZone: "America/Chicago" };
      if (target.pathname.endsWith("metadata"))
        return { metrics: [{ apiName: "sessions", uiName: "Sessions" }] };
      if (target.pathname.endsWith(":checkCompatibility"))
        return {
          metricCompatibilities: [
            { compatibility: "COMPATIBLE", metricMetadata: { apiName: "sessions" } },
          ],
        };
      return {
        metricHeaders: [{ name: "sessions" }],
        ...(kind === "missing" ? {} : { rows: [{ metricValues: [{ value: "0" }] }] }),
        metadata:
          kind === "restricted"
            ? {
                activeMetricRestrictions: [
                  { metricName: "sessions", restrictedMetricTypes: ["REVENUE_DATA"] },
                ],
              }
            : kind === "empty"
              ? { emptyReason: "NO_DATA" }
              : {},
      };
    });
    await expect(
      platform.analyticsReport(
        {
          connection: analyticsConnection,
          propertyId: "123",
          metrics: ["sessions"],
          startDate: "2026-10-05",
          endDate: "2026-10-09",
        },
        context,
      ),
    ).rejects.toThrow();
  },
);

it.each([400, 401, 403, 404])(
  "distinguishes authoritative HTTP %s write rejection from uncertainty",
  async (status) => {
    const platform = new RestTaskPlatform(async (request) =>
      request.method === "PUT" ? { status, data: {} } : { status: 200, data: { values: [] } },
    );
    await expect(
      platform.writeSheet(sheetConnection, spreadsheet, "A1", [[42]], context),
    ).rejects.toBeInstanceOf(TaskPlatformRejectedError);
  },
);

it("reports failed pre-create lookup as known no effect without dispatching create", async () => {
  const calls: TaskProxyRequest[] = [];
  const platform = new RestTaskPlatform(async (request) => {
    calls.push(request);
    throw new Error("Read unavailable");
  });
  await expect(
    platform.createReportSheet(sheetConnection, "GA4 report", "operation-one", context),
  ).rejects.toMatchObject({ knownNoEffect: true });
  expect(calls.every((call) => call.method === "GET")).toBe(true);
});

it("aborts a read during Retry-After backoff without another upstream call", async () => {
  const abort = new AbortController();
  const proxy = vi
    .fn<TaskProxy>()
    .mockResolvedValue({ status: 429, data: {}, headers: { "retry-after": "300" } });
  const pending = new RestTaskPlatform(proxy).identity(connection, {
    ...context,
    signal: abort.signal,
  });
  await Promise.resolve();
  abort.abort();
  await expect(pending).rejects.toThrow();
  expect(proxy).toHaveBeenCalledTimes(1);
});
