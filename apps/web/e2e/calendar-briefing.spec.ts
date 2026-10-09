import { expect, test } from "@playwright/test";
import type { AppBootstrap, CalendarReceipt, ThreadSnapshot } from "@rakazo/contracts";
import { renderCalendarBriefing } from "@rakazo/core";
import { activeBotId, captureScreenshot, completeOnboarding, signup } from "./helpers";

// UI fixtures stay offline. The PostgreSQL suite separately exercises the real
// OAuth completion, durable task, evidence, memory and publication transactions.
test("Calendar onboarding is visible in the assistant conversation", async ({ page }, testInfo) => {
  await page.route("**/rpc/calendar/status", (route) =>
    route.fulfill({
      json: {
        json: {
          configured: false,
          canConfigure: true,
          redirectUri: "https://app.example.test/api/calendar/oauth/callback",
          connectionId: null,
          status: "disconnected",
        },
      },
    }),
  );
  await signup(
    page,
    `calendar-onboarding-${Date.now()}@rakazo.test`,
    "password12",
    "Calendar Test",
  );
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Organize my day", exact: true }).click();
  await page
    .getByTestId("transcript")
    .getByRole("button", { name: "Connect Google Calendar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }),
  ).toHaveCount(1);
  const preferences = page.getByRole("button", { name: "Briefing preferences", exact: true });
  const draft = page.getByRole("textbox", { name: "Briefing preferences", exact: true });
  await expect(preferences).toHaveAttribute("aria-expanded", "false");
  await preferences.click();
  await expect(draft).toBeVisible();
  await draft.fill("Leave preparation time before meetings.");
  await preferences.click();
  await expect(draft).toBeHidden();
  await preferences.click();
  await expect(draft).toHaveValue("Leave preparation time before meetings.");
  await page.getByRole("button", { name: "Use your own Google OAuth app", exact: true }).click();
  await expect(page.getByLabel("OAuth Client ID", { exact: true })).toBeVisible();
  await expect(page.getByLabel("OAuth Client secret", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByText("https://app.example.test/api/calendar/oauth/callback"),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "calendar-onboarding");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByLabel("OAuth Client ID", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "calendar-onboarding-narrow");
});

test("saved briefing has structured facts, suggestions and an inspectable receipt", async ({
  page,
}, testInfo) => {
  await signup(page, `calendar-receipt-${Date.now()}@rakazo.test`, "password12", "Calendar Test");
  await completeOnboarding(page);
  const botId = activeBotId(page);
  const receipt: CalendarReceipt = {
    id: "test-calendar-receipt",
    runId: "test-calendar-run",
    status: "completed",
    timezone: "America/Chicago",
    createdAt: "2026-10-09T18:00:00Z",
    startedAt: "2026-10-09T18:00:01Z",
    completedAt: "2026-10-09T18:00:03Z",
    attempts: 1,
    error: null,
    snapshot: {
      date: "2026-10-10",
      timezone: "America/Chicago",
      timeMin: "2026-10-10T05:00:00Z",
      timeMax: "2026-10-11T05:00:00Z",
      retrievedAt: "2026-10-09T18:00:02Z",
      sources: [{ id: "primary", name: "Work", timezone: "America/Chicago" }],
      events: [
        {
          id: "event-1",
          calendarId: "primary",
          title: "Roadmap review",
          start: "2026-10-10T09:00:00-05:00",
          end: "2026-10-10T09:30:00-05:00",
          allDay: false,
          url: null,
          description: "Review the next milestone",
          location: "Meeting room",
          recurringEventId: null,
          busy: true,
          response: "accepted",
        },
      ],
    },
    suggestions: [{ eventIds: ["event-1"], text: "Consider reviewing the milestone notes." }],
    suggestionStatus: "generated",
    memorySources: [],
    outcome: null,
  };
  receipt.outcome = renderCalendarBriefing(receipt.snapshot!, receipt.suggestions, "generated");
  await page.route("**/rpc/calendar/status", (route) =>
    route.fulfill({
      json: {
        json: {
          configured: true,
          canConfigure: false,
          redirectUri: "https://app.example.test/api/calendar/oauth/callback",
          connectionId: "test-calendar-connection",
          status: "connected",
        },
      },
    }),
  );
  await page.route("**/rpc/calendar/receipt", (route) =>
    route.fulfill({ json: { json: receipt } }),
  );
  const addBriefing = (snapshot: ThreadSnapshot) => {
    snapshot.messages.push({
      id: "test-calendar-message",
      seq: 1000,
      threadId: snapshot.threadId,
      botId,
      role: "bot",
      blocks: [
        { kind: "text", text: receipt.outcome! },
        { kind: "calendar_receipt", receiptId: receipt.id },
      ],
      createdAt: receipt.completedAt!,
    });
  };
  await page.route("**/rpc/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: AppBootstrap };
    if (body.json.thread) addBriefing(body.json.thread);
    await route.fulfill({ response, json: body });
  });
  await page.route("**/rpc/threads/get", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: ThreadSnapshot };
    addBriefing(body.json);
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tomorrow · 2026-10-10" })).toBeVisible();
  await expect(page.getByText("Preparation · AI suggestions")).toBeVisible();
  await captureScreenshot(page, testInfo, "calendar-briefing");
  await page.getByRole("button", { name: "Calendar briefing · View receipt" }).click();
  await expect(page.getByRole("heading", { name: "Briefing receipt" })).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText("Verified calendar data")).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await page.getByText("Source records", { exact: true }).click();
  await expect(page.locator("pre").filter({ hasText: '"calendarId": "primary"' })).toBeVisible();
  await captureScreenshot(page, testInfo, "calendar-receipt");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "calendar-receipt-narrow");
});

test("Calendar reuses a managed account without OAuth client setup or a second sign-in", async ({
  page,
}, testInfo) => {
  let attached = false;
  let signIns = 0;
  await page.route("**/rpc/calendar/status", (route) =>
    route.fulfill({
      json: {
        json: {
          configured: true,
          directConfigured: false,
          canConfigure: false,
          redirectUri: "https://example.test/calendar/callback",
          managedConnectorId: "composio",
          managedConnectionId: attached ? "work-account" : null,
          managedConnections: [{ id: "work-account", displayName: "Work Calendar" }],
          connectionId: attached ? "briefing-connection" : null,
          status: attached ? "connected" : "disconnected",
        },
      },
    }),
  );
  await page.route("**/rpc/connections/begin", (route) => {
    signIns += 1;
    return route.abort();
  });
  let request: unknown;
  await page.route("**/rpc/calendar/connectAccount", (route) => {
    request = route.request().postDataJSON().json;
    attached = true;
    return route.fulfill({ json: { json: { ok: true } } });
  });
  await signup(
    page,
    `calendar-managed-${Date.now()}@rakazo.test`,
    "password12",
    "Managed Calendar",
  );
  await completeOnboarding(page);
  const botId = activeBotId(page);
  await page.getByRole("button", { name: "Connections", exact: true }).last().click();
  await page.getByRole("button", { name: "Calendar briefing", exact: true }).click();
  await page.getByRole("button", { name: "Connect Google Calendar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible();
  expect(request).toMatchObject({ connectionId: "work-account", botId });
  expect(signIns).toBe(0);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Disconnect briefing", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("OAuth Client ID", { exact: true })).toBeHidden();
  await captureScreenshot(page, testInfo, "calendar-managed-account");
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "calendar-managed-account-narrow");
});
