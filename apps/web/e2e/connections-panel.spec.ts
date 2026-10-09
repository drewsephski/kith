import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test("native Calendar removal uses the same confirmation dialog", async ({ page }) => {
  let connected = true;
  await page.route("**/rpc/connections/list", (route) => route.fulfill({ json: { json: [] } }));
  await page.route("**/rpc/connections/catalog", (route) => route.fulfill({ json: { json: [] } }));
  await page.route("**/rpc/calendar/status", (route) =>
    route.fulfill({
      json: {
        json: {
          configured: true,
          canConfigure: true,
          status: connected ? "connected" : "disconnected",
          connectionId: connected ? "native-calendar" : null,
          managedConnectionId: null,
        },
      },
    }),
  );
  await page.route("**/rpc/calendar/disconnect", (route) => {
    connected = false;
    return route.fulfill({ json: { json: { ok: true } } });
  });
  await signup(
    page,
    `native-calendar-remove-${Date.now()}@rakazo.test`,
    "password12",
    "Calendar Test",
  );
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Connections", exact: true }).last().click();
  const panel = page.getByTestId("connections-panel");
  await panel.getByRole("button", { name: "Remove Google Calendar", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Remove Google Calendar?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "Remove Google Calendar", exact: true }),
  ).toBeHidden();
  await expect(panel.getByText("No connections yet", { exact: true })).toBeVisible();
});

test("connections list every account and open the complete Composio catalog", async ({
  page,
}, testInfo) => {
  await signup(
    page,
    `connections-panel-${Date.now()}@rakazo.test`,
    "password12",
    "Connections Test",
  );
  await completeOnboarding(page);
  const catalog = [
    {
      connectorId: "composio",
      slug: "GMAIL",
      name: "Gmail",
      logo: null,
      connected: true,
      noAuth: false,
    },
    {
      connectorId: "composio",
      slug: "SLACK",
      name: "Slack",
      logo: null,
      connected: true,
      noAuth: false,
    },
    ...Array.from({ length: 65 }, (_, index) => ({
      connectorId: "composio",
      slug: `service_${index}`,
      name: `Service ${index}`,
      logo: null,
      connected: false,
      noAuth: false,
    })),
    {
      connectorId: "pipedream",
      slug: "other",
      name: "Other provider",
      logo: null,
      connected: false,
      noAuth: false,
    },
  ];
  let connected = false;
  const removed = new Set<string>();
  const accounts = () =>
    [
      ...["Work Gmail", "Personal Gmail"].map((displayName, index) => ({
        id: `gmail-${index}`,
        connectorId: "composio",
        provider: "gmail",
        displayName,
        status: "connected",
        capabilities: [],
        createdAt: "2026-10-09T00:00:00Z",
      })),
      ...(connected
        ? [
            {
              id: "new-service",
              connectorId: "composio",
              provider: "service_64",
              displayName: "Service 64",
              status: "connected",
              capabilities: [],
              createdAt: "2026-10-09T00:00:00Z",
            },
          ]
        : []),
    ].filter((account) => !removed.has(account.id));
  await page.route("**/rpc/connections/list", (route) =>
    route.fulfill({ json: { json: accounts() } }),
  );
  await page.route("**/rpc/connections/catalog", (route) =>
    route.fulfill({ json: { json: catalog.filter((item) => !removed.has(item.slug)) } }),
  );
  const revokeRequests: string[] = [];
  let failRevocation = false;
  await page.route("**/rpc/connections/revoke", async (route) => {
    const { connectionId } = route.request().postDataJSON().json;
    revokeRequests.push(connectionId);
    if (failRevocation) {
      await route.fulfill({ status: 503, json: { message: "Offline test failure" } });
      return;
    }
    removed.add(connectionId);
    await route.fulfill({ json: { json: { ok: true } } });
  });
  await page.route("**/rpc/connections/revokeService", async (route) => {
    const { provider } = route.request().postDataJSON().json;
    revokeRequests.push(provider);
    removed.add(provider);
    await route.fulfill({ json: { json: { ok: true } } });
  });
  await expect(
    page.getByRole("button", { name: "Connect Google Calendar", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Connections", exact: true }).last().click();
  const panel = page.getByTestId("connections-panel");
  for (const name of ["Work Gmail", "Personal Gmail", "Slack"]) {
    await expect(panel.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(panel.getByRole("button", { name: "Add connection", exact: true })).toBeVisible();
  await expect(panel).not.toContainText("fUh824");
  await captureScreenshot(page, testInfo, "connections-panel");
  await panel.getByRole("button", { name: "Remove Work Gmail", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Remove Work Gmail?", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(revokeRequests).toEqual([]);
  await expect(panel.getByText("Work Gmail", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Remove Work Gmail", exact: true }).click();
  await captureScreenshot(page, testInfo, "remove-connection-confirmation");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(confirmation).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await captureScreenshot(page, testInfo, "remove-connection-confirmation-narrow");
  await page.setViewportSize({ width: 1280, height: 720 });
  await confirmation.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(panel.getByText("Work Gmail", { exact: true })).toBeHidden();
  await expect(panel.getByText("Personal Gmail", { exact: true })).toBeVisible();
  expect(revokeRequests).toEqual(["gmail-0"]);
  await panel.getByRole("button", { name: "Remove Slack", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(panel.getByText("Slack", { exact: true })).toBeHidden();
  expect(revokeRequests).toEqual(["gmail-0", "SLACK"]);
  failRevocation = true;
  await panel.getByRole("button", { name: "Remove Personal Gmail", exact: true }).click();
  const failedConfirmation = page.getByRole("alertdialog");
  await failedConfirmation.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(failedConfirmation.getByRole("alert")).toHaveText(
    "Could not remove connection. Try again.",
  );
  await expect(panel.getByText("Personal Gmail", { exact: true })).toBeVisible();
  await failedConfirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  failRevocation = false;
  await panel.getByRole("button", { name: "Add connection", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect services", exact: true });
  await expect(dialog.getByText("Gmail", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Other provider", { exact: true })).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Browse MCP servers" })).toBeHidden();
  await dialog.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(dialog.getByText("Service 64", { exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Search apps", exact: true }).fill("Service 64");
  await expect(
    dialog.getByRole("button", { name: "Connect Service 64", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Gmail", { exact: true })).toBeHidden();
  await captureScreenshot(page, testInfo, "composio-services-search");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await captureScreenshot(page, testInfo, "composio-services-narrow");
  connected = true;
  await dialog.getByRole("button", { name: "Close integrations", exact: true }).click();
  await expect(panel.getByText("Service 64", { exact: true })).toBeVisible();
});
