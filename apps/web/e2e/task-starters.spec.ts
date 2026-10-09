import { expect, test } from "@playwright/test";
import type {
  AppBootstrap,
  TaskStarterOptions,
  TaskStarterReceipt,
  ThreadSnapshot,
} from "@rakazo/contracts";
import { activeBotId, captureScreenshot, completeOnboarding, signup } from "./helpers";

const options: TaskStarterOptions = {
  configured: true,
  connections: [
    {
      id: "gmail-personal",
      connectorId: "composio",
      app: "gmail",
      name: "Personal",
      identity: "personal@example.test",
      status: "connected",
    },
    {
      id: "gmail-work",
      connectorId: "composio",
      app: "gmail",
      name: "Work",
      identity: "work@example.test",
      status: "connected",
    },
    {
      id: "calendar-work",
      connectorId: "composio",
      app: "calendar",
      name: "Calendar",
      identity: "work@example.test",
      status: "connected",
    },
    {
      id: "crm-work",
      connectorId: "composio",
      app: "hubspot",
      name: "CRM",
      identity: null,
      status: "connected",
    },
    {
      id: "analytics-work",
      connectorId: "composio",
      app: "analytics",
      name: "Analytics",
      identity: null,
      status: "connected",
    },
    {
      id: "sheets-work",
      connectorId: "composio",
      app: "sheets",
      name: "Sheets",
      identity: "work@example.test",
      status: "connected",
    },
  ],
};

test("task starters preserve editable intent and require explicit accounts", async ({
  page,
}, testInfo) => {
  let starts = 0;
  const searchReceipt: TaskStarterReceipt = {
    id: "search-receipt",
    runId: "search-run",
    starter: "gmail_search",
    status: "completed",
    createdAt: "2026-10-09T18:00:00Z",
    updatedAt: "2026-10-09T18:00:01Z",
    error: null,
    result: {
      kind: "gmail_search",
      sources: [],
      warnings: [],
      summary: "No matching launch-plan emails.",
      messages: [],
      coverage: [
        { connectionId: "gmail-personal", label: "Personal", status: "complete", count: 0 },
        { connectionId: "gmail-work", label: "Work", status: "complete", count: 0 },
      ],
    },
  };
  await page.route("**/rpc/taskStarters/options", (route) =>
    route.fulfill({ json: { json: options } }),
  );
  await page.route("**/rpc/connections/catalog", (route) => route.fulfill({ json: { json: [] } }));
  await page.route("**/rpc/taskStarters/start", (route) => {
    starts += 1;
    const input = route.request().postDataJSON().json;
    expect(input.spec.gmailConnectionIds).toEqual(["gmail-personal", "gmail-work"]);
    expect(input.spec.query).toBe("launch plan");
    expect(input.spec.starter).toBe("gmail_search");
    return route.fulfill({ json: { json: searchReceipt } });
  });
  await page.route("**/rpc/taskStarters/receipt", (route) =>
    route.fulfill({ json: { json: searchReceipt } }),
  );
  await page.route("**/rpc/threads/get", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: ThreadSnapshot };
    if (starts)
      body.json.messages.push({
        id: "search-message",
        seq: 1000,
        threadId: body.json.threadId,
        botId: activeBotId(page),
        role: "bot",
        blocks: [{ kind: "task_starter_receipt", receiptId: searchReceipt.id }],
        createdAt: searchReceipt.createdAt,
      });
    await route.fulfill({ response, json: body });
  });
  await page.route("**/rpc/taskStarters/properties", (route) =>
    route.fulfill({
      json: { json: [{ id: "123456", name: "Website", timezone: "America/Chicago" }] },
    }),
  );
  await signup(page, `task-starters-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const composer = page.locator('textarea[name="chat-message"]');
  const welcome = page.getByTestId("assistant-welcome");
  await expect(welcome).toBeVisible();
  await captureScreenshot(page, testInfo, "task-starters-desktop");
  const starters = [
    "Search all my Gmail accounts",
    "Build a brief for my next meeting",
    "Turn my inbox into a to-do list",
    "Pull this week’s numbers into a Sheet",
  ];
  for (const title of starters) {
    await welcome.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(composer).toBeFocused();
    const prompt = await composer.inputValue();
    await composer.fill(`${prompt} Please keep it concise.`);
    await composer.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Choose task sources" })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(
      title.includes("numbers") ? 3 : 0,
    );
    if (title.startsWith("Search")) {
      await dialog.getByRole("button", { name: "Start task", exact: true }).click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      expect(starts).toBe(0);
      await dialog.getByRole("textbox", { name: "Search topic" }).fill("launch plan");
      await dialog
        .getByRole("checkbox", { name: "Personal · personal@example.test", exact: true })
        .check();
      await dialog
        .getByRole("checkbox", { name: "Work · work@example.test", exact: true })
        .first()
        .check();
      await captureScreenshot(page, testInfo, "task-starter-gmail-accounts");
    }
    if (title.includes("meeting")) {
      await expect(dialog.getByText("Google Calendar", { exact: true })).toBeVisible();
      await dialog.getByText("Email and CRM context (optional)", { exact: true }).click();
      await expect(dialog.getByRole("checkbox", { name: "CRM", exact: true })).toBeVisible();
    }
    if (title.includes("to-do"))
      await expect(dialog.getByRole("spinbutton", { name: "Look back in days" })).toHaveValue("7");
    if (title.includes("numbers")) {
      await dialog.getByRole("checkbox", { name: "Analytics", exact: true }).check();
      await expect(dialog.getByRole("combobox", { name: "Analytics property" })).toBeVisible();
      await dialog.getByRole("combobox", { name: "Analytics property" }).click();
      await page.getByRole("option", { name: "Website · America/Chicago", exact: true }).click();
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await captureScreenshot(page, testInfo, "task-starter-analytics-narrow");
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(composer).toHaveValue(`${prompt} Please keep it concise.`);
  }
  expect(starts).toBe(0);
  await page.getByRole("button", { name: "Remove task starter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove task starter", exact: true })).toBeHidden();
  await welcome.getByRole("button", { name: "Search all my Gmail accounts", exact: true }).click();
  await composer.fill("Search all my connected Gmail accounts for launch plan");
  await composer.press("Enter");
  const setup = page.getByRole("dialog");
  await expect(setup.getByRole("textbox", { name: "Search topic" })).toHaveValue("launch plan");
  await setup
    .getByRole("checkbox", { name: "Personal · personal@example.test", exact: true })
    .check();
  await setup.getByRole("checkbox", { name: "Work · work@example.test", exact: true }).check();
  await setup.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(setup).toBeHidden();
  await expect(composer).toHaveValue("");
  const result = page.getByTestId("task-starter-receipt");
  await expect(result.getByText("No matching launch-plan emails.", { exact: true })).toBeVisible();
  await expect(result.getByText("Personal · 0 · Complete", { exact: true })).toBeVisible();
  await expect(result.getByText("Work · 0 · Complete", { exact: true })).toBeVisible();
  expect(starts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "task-gmail-result-narrow");
});

test("analytics receipt previews, publishes once and schedules in property timezone", async ({
  page,
}, testInfo) => {
  await signup(page, `task-report-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  const botId = activeBotId(page);
  const receipt: TaskStarterReceipt = {
    id: "report-receipt",
    runId: "report-run",
    starter: "analytics_report",
    status: "completed",
    createdAt: "2026-10-09T18:00:00Z",
    updatedAt: "2026-10-09T18:00:01Z",
    error: null,
    result: {
      kind: "analytics_report",
      sources: [
        {
          id: "analytics-source",
          connectionId: "analytics-work",
          title: "GA4 website",
          url: "https://analytics.google.com/",
          retrievedAt: "2026-10-09T18:00:00Z",
        },
      ],
      summary: "",
      warnings: [],
      report: {
        propertyId: "123456",
        timezone: "America/Chicago",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        currency: "USD",
        metrics: [
          { name: "sessions", label: "Sessions", value: 1200 },
          { name: "activeUsers", label: "Active users", value: 800 },
        ],
        spreadsheetId: "fixture-spreadsheet",
        url: null,
        range: "Rakazo report!A1:D10",
        values: [["Sessions", 1200]],
        provisional: true,
        published: false,
      },
    },
  };
  let publishCount = 0;
  await page.route("**/rpc/taskStarters/receipt", (route) =>
    route.fulfill({ json: { json: receipt } }),
  );
  await page.route("**/rpc/taskStarters/publish", async (route) => {
    publishCount += 1;
    expect(route.request().postDataJSON().json.clientNonce).toBe("task-publish:report-receipt");
    receipt.id = "report-published-receipt";
    if (receipt.result?.kind === "analytics_report") {
      receipt.result.report.published = true;
      receipt.result.report.url = "https://docs.google.com/spreadsheets/d/fixture-spreadsheet/edit";
    }
    await route.fulfill({ json: { json: receipt } });
  });
  await page.route("**/rpc/taskStarters/schedule", (route) => {
    expect(route.request().postDataJSON().json).toEqual({
      receiptId: "report-published-receipt",
      cron: "0 9 * * 1",
      timezone: "America/Chicago",
    });
    return route.fulfill({ json: { json: { routineId: "report-routine" } } });
  });
  const addReceipt = (snapshot: ThreadSnapshot) => {
    snapshot.messages.push({
      id: "report-message",
      seq: 1000,
      threadId: snapshot.threadId,
      botId,
      role: "bot",
      blocks: [{ kind: "task_starter_receipt", receiptId: receipt.id }],
      createdAt: receipt.createdAt,
    });
  };
  await page.route("**/rpc/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: AppBootstrap };
    if (body.json.thread) addReceipt(body.json.thread);
    await route.fulfill({ response, json: body });
  });
  await page.route("**/rpc/threads/get", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: ThreadSnapshot };
    addReceipt(body.json);
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  const card = page.getByTestId("task-starter-receipt");
  await expect(card.getByText("1,200", { exact: true })).toBeVisible();
  await expect(card.getByText(/Provisional data/)).toBeVisible();
  await captureScreenshot(page, testInfo, "task-report-preview");
  await card.getByRole("button", { name: "Publish to Sheet", exact: true }).click();
  await expect(card.getByRole("link", { name: "Open spreadsheet", exact: true })).toBeVisible();
  expect(publishCount).toBe(1);
  await card.getByRole("button", { name: "Repeat this report", exact: true }).click();
  await card.getByRole("button", { name: "Schedule report", exact: true }).click();
  await expect(card.getByText("Scheduled. Manage it in Routines.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "task-report-published-narrow");
});
