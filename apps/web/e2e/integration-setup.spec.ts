import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test("setup exposes all integration choices and saves only the selected provider", async ({
  page,
}, testInfo) => {
  const saved: unknown[] = [];
  await page.route("**/rpc/integrationSetup/get", (route) =>
    route.fulfill({
      json: {
        json: {
          canConfigure: true,
          needsSetup: true,
          webUrl: "https://example.test/integrations/setup",
          providers: [
            { id: "composio", configured: false },
            { id: "pipedream", configured: false },
          ],
        },
      },
    }),
  );
  await page.route("**/rpc/integrationSetup/save", (route) => {
    saved.push(route.request().postDataJSON());
    return route.fulfill({ json: { json: { ok: true } } });
  });
  await signup(page, `integration-setup-${Date.now()}@rakazo.test`, "password12", "Setup Test");
  await completeOnboarding(page);
  await page.goto("/integrations/setup");
  await expect(page.getByRole("heading", { name: "Server integrations" })).toBeVisible();
  for (const name of ["Direct MCP", "Composio", "Pipedream", "Executor"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("API key", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "integration-setup-options");
  await page.getByRole("button", { name: "Direct MCP", exact: true }).click();
  await page.getByRole("button", { name: "Connection settings", exact: true }).click();
  const serverName = page.getByRole("textbox", { name: "Server name", exact: true });
  await serverName.focus();
  await expect(serverName).toBeFocused();
  await captureScreenshot(page, testInfo, "integration-setup-focused-input");
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "integration-setup-focused-input-mobile");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Pipedream", exact: true }).click();
  await expect(page.getByLabel("Client ID", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Project ID", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Client secret", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "integration-setup-pipedream");
  await page.getByRole("button", { name: "Composio", exact: true }).click();
  await page.getByLabel("API key", { exact: true }).fill("fake-composio-key");
  await captureScreenshot(page, testInfo, "integration-setup-composio");
  await page.getByRole("button", { name: "Custom OAuth apps", exact: true }).click();
  const authConfigs = page.getByRole("textbox", { name: "Toolkit to auth-config IDs (JSON)" });
  await authConfigs.focus();
  await expect(authConfigs).toBeFocused();
  await captureScreenshot(page, testInfo, "integration-setup-focused-textarea");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureScreenshot(page, testInfo, "integration-setup-focused-textarea-mobile");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect
    .poll(() => saved)
    .toEqual([{ json: { provider: "composio", apiKey: "fake-composio-key" } }]);
  await expect(page.getByRole("heading", { name: "Create your first bot" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Message Kith" })).toBeVisible({
    timeout: 20_000,
  });
});

test("direct MCP connects a catalog result without asking for a URL and assigns it to the first bot", async ({
  page,
}, testInfo) => {
  await page.route("**/rpc/integrationSetup/get", (route) =>
    route.fulfill({
      json: {
        json: {
          canConfigure: true,
          needsSetup: true,
          webUrl: "https://example.test/integrations/setup",
          providers: [],
        },
      },
    }),
  );
  let serverId = "";
  await page.route("**/rpc/mcp/servers/check", (route) =>
    route.fulfill({ json: { json: { ok: true } } }),
  );
  await page.route("**/rpc/capabilities/catalogSearch", (route) =>
    route.fulfill({
      json: {
        json: {
          enabled: true,
          results: [
            {
              domain: "notion.example.test",
              name: "Notion",
              description: "",
              pageUrl: null,
              surfaces: [
                {
                  kind: "mcp",
                  slug: "notion",
                  source: "https://mcp.notion.example.test/mcp",
                  auth: null,
                },
              ],
            },
          ],
        },
      },
    }),
  );
  await page.route("**/rpc/mcp/oauth/begin", (route) => {
    serverId = route.request().postDataJSON().json.serverId;
    return route.fulfill({ json: { json: { status: "already_connected" } } });
  });
  await signup(page, `direct-mcp-setup-${Date.now()}@rakazo.test`, "password12", "Direct MCP");
  await completeOnboarding(page);
  const botId = new URL(page.url()).pathname.split("/").at(-1);
  await page.goto("/integrations/setup");
  await page.getByRole("button", { name: "Direct MCP", exact: true }).click();
  await page.getByRole("textbox", { name: "Search apps", exact: true }).fill("Notion");
  await page.getByRole("button", { name: "Search integrations.sh", exact: true }).click();
  await expect(page.getByText("Notion", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Server URL" })).toBeVisible();
  const assigned = page.waitForResponse(
    (response) => response.url().includes("/rpc/mcp/assignments/approve") && response.ok(),
  );
  await page.getByRole("button", { name: "Connect", exact: true }).last().click();
  const response = await assigned;
  expect(response.request().postDataJSON().json).toEqual({ botId, serverId });
  await expect(page.getByRole("button", { name: "Connected", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "integration-setup-direct-connected");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/app\//);
  await expect(page.getByRole("combobox", { name: "Message Kith" })).toBeVisible();
});

test("Executor reconnect saves a replacement token before authorization", async ({ page }) => {
  await page.route("**/rpc/integrationSetup/get", (route) =>
    route.fulfill({
      json: {
        json: {
          canConfigure: true,
          needsSetup: true,
          webUrl: "https://example.test/integrations/setup",
          providers: [],
        },
      },
    }),
  );
  await signup(page, `executor-reconnect-${Date.now()}@rakazo.test`, "password12", "Executor Test");
  await completeOnboarding(page);
  await page.goto("/integrations/setup");
  await expect(page.getByRole("heading", { name: "Server integrations" })).toBeVisible();
  const server = await page.evaluate(async () => {
    const response = await fetch("/rpc/mcp/servers/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rakazo-space-id": localStorage.getItem("rakazo:space-id") ?? "",
      },
      body: JSON.stringify({
        json: {
          slug: "existing-executor",
          name: "Executor",
          transport: "streamable_http",
          // A public literal: loopback endpoints are owner-only and this user may not own the test deployment.
          endpoint: "https://203.0.113.10/mcp",
          secret: "fake-old-token",
          headers: { "X-Test": "fake-header" },
        },
      }),
    });
    if (!response.ok) throw new Error(`Server creation failed: ${response.status}`);
    return (await response.json()).json;
  });
  await page.route("**/rpc/mcp/servers/check", (route) =>
    route.fulfill({ json: { json: { ok: true } } }),
  );
  let saved = false;
  await page.route("**/rpc/mcp/servers/update", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      json: { id: server.id, secret: "fake-new-token" },
    });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const updated = (await response.json()).json;
    expect(updated.headerKeys).toEqual(["X-Test"]);
    expect(updated.revision).toBe(server.revision + 1);
    saved = true;
    await route.fulfill({ response });
  });
  await page.route("**/rpc/mcp/oauth/begin", (route) => {
    expect(saved).toBe(true);
    return route.fulfill({ json: { json: { status: "already_connected" } } });
  });
  await page.getByRole("button", { name: "Executor", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Server URL", exact: true })
    .fill("https://203.0.113.10/mcp");
  await page.getByLabel("Access token", { exact: true }).fill("fake-new-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect.poll(() => saved).toBe(true);
  await expect(page.getByRole("alert")).toBeHidden();
});

test("remote members skip server setup and keep direct MCP connections", async ({
  page,
}, testInfo) => {
  await page.route("**/rpc/integrationSetup/get", (route) =>
    route.fulfill({
      json: {
        json: {
          canConfigure: false,
          needsSetup: false,
          providers: [],
          webUrl: "https://example.test/integrations/setup",
        },
      },
    }),
  );
  await signup(page, `remote-member-${Date.now()}@rakazo.test`, "password12", "Remote Member");
  await expect(page.getByRole("heading", { name: "Server integrations" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Create your first bot" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "remote-member-onboarding");
  await completeOnboarding(page);
  await page.goto("/integrations/setup?mode=mcp");
  await expect(page.getByRole("heading", { name: "Add MCP server" })).toBeVisible();
  for (const name of ["Composio", "Pipedream", "Executor"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeHidden();
  }
  await expect(page.getByRole("textbox", { name: "Search apps", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "remote-member-mcp");
  await page.goto("/integrations/setup");
  await page.waitForURL(/\/app/);
  await expect(page.getByRole("heading", { name: "Server integrations" })).toBeHidden();
});

test("configured server owners manage providers from settings", async ({ page }, testInfo) => {
  await page.route("**/rpc/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { json: { ...body.json, me: { ...body.json.me, isDeploymentOwner: true } } },
    });
  });
  await page.route("**/rpc/integrationSetup/get", (route) =>
    route.fulfill({
      json: {
        json: {
          canConfigure: true,
          needsSetup: false,
          providers: [{ id: "composio", configured: true }],
          webUrl: "https://example.test/integrations/setup",
        },
      },
    }),
  );
  await signup(page, `configured-owner-${Date.now()}@rakazo.test`, "password12", "Server Owner");
  await expect(page.getByRole("heading", { name: "Server integrations" })).toBeHidden();
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByTestId("user-settings");
  const link = settings.getByRole("link", { name: "Server integrations", exact: true });
  await expect(link).toBeVisible();
  await captureScreenshot(page, testInfo, "server-integrations-settings");
  await link.click();
  await expect(page.getByRole("heading", { name: "Server integrations" })).toBeVisible();
  await page.getByRole("button", { name: "Composio", exact: true }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "server-integrations-configured");
});

test("custom MCP verifies before granting access and resumes a saved server after failure", async ({
  page,
}, testInfo) => {
  await signup(page, `mcp-verify-${Date.now()}@rakazo.test`, "password12", "MCP Verification");
  await completeOnboarding(page);
  const calls: string[] = [];
  let verified = false;
  await page.route("**/rpc/mcp/servers/create", async (route) => {
    calls.push("create");
    await route.fulfill({ response: await route.fetch() });
  });
  await page.route("**/rpc/mcp/oauth/begin", (route) =>
    route.fulfill({ json: { json: { status: "authorization_not_requested" } } }),
  );
  await page.route("**/rpc/mcp/servers/check", (route) => {
    calls.push("check");
    return verified
      ? route.fulfill({ json: { json: { ok: true } } })
      : route.fulfill({ status: 400, json: { message: "Server unavailable" } });
  });
  await page.route("**/rpc/mcp/assignments/approve", async (route) => {
    calls.push("approve");
    expect(verified).toBe(true);
    await route.fulfill({ response: await route.fetch() });
  });
  await page.goto("/integrations/setup?mode=mcp&endpoint=https%3A%2F%2Fmcp.example.test%2Fmcp");
  await expect(page.getByRole("textbox", { name: "Server URL", exact: true })).toHaveValue(
    "https://mcp.example.test/mcp",
  );
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(calls).toEqual(["create", "check"]);
  verified = true;
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connected", exact: true })).toBeVisible();
  expect(calls).toEqual(["create", "check", "check", "approve"]);
  await captureScreenshot(page, testInfo, "mcp-url-connected");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("textbox", { name: "Server URL", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "mcp-url-connected-narrow");
});

test("blocked popups expose a browser link and checking resumes the same app sign-in", async ({
  page,
}, testInfo) => {
  await signup(page, `app-popup-${Date.now()}@rakazo.test`, "password12", "App Connection");
  await completeOnboarding(page);
  let begins = 0;
  let connected = false;
  const account = () => ({
    id: "pending-gmail",
    connectorId: "composio",
    provider: "gmail",
    displayName: "Gmail",
    status: connected ? "connected" : "pending",
    capabilities: [],
    createdAt: "2026-10-09T18:00:00Z",
  });
  await page.route("**/rpc/connections/catalog", (route) =>
    route.fulfill({
      json: {
        json: [
          {
            connectorId: "composio",
            slug: "gmail",
            name: "Gmail",
            logo: null,
            connected,
            noAuth: false,
          },
        ],
      },
    }),
  );
  await page.route("**/rpc/connections/list", (route) =>
    route.fulfill({ json: { json: begins ? [account()] : [] } }),
  );
  await page.route("**/rpc/connections/begin", (route) => {
    begins += 1;
    return route.fulfill({
      json: {
        json: {
          connectionId: "pending-gmail",
          authorizationUrl: "https://auth.example.test/google",
        },
      },
    });
  });
  await page.route("**/rpc/connections/complete", (route) =>
    route.fulfill({ json: { json: account() } }),
  );
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Connections", exact: true }).last().click();
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue in browser", exact: true }),
  ).toHaveAttribute("href", "https://auth.example.test/google");
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check connection", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "app-browser-fallback-narrow");
  connected = true;
  await page.getByRole("button", { name: "Check connection", exact: true }).click();
  await expect(page.getByRole("link", { name: "Continue in browser", exact: true })).toBeHidden();
  expect(begins).toBe(1);
});
