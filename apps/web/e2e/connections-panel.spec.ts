import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

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
  const accounts = () => [
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
  ];
  await page.route("**/rpc/connections/list", (route) =>
    route.fulfill({ json: { json: accounts() } }),
  );
  await page.route("**/rpc/connections/catalog", (route) =>
    route.fulfill({ json: { json: catalog } }),
  );
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const panel = page.getByTestId("connections-panel");
  for (const name of ["Work Gmail", "Personal Gmail", "Slack"]) {
    await expect(panel.getByText(name, { exact: true })).toBeVisible();
  }
  await captureScreenshot(page, testInfo, "connections-panel");
  await panel.getByRole("button", { name: "Connect services", exact: true }).click();
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
