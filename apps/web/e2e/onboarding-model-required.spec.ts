import { expect, test } from "@playwright/test";
import { captureScreenshot, signup } from "./helpers";

test("onboarding requires a model when the deployment has none", async ({ page }, testInfo) => {
  await page.route("**/rpc/me", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { json: Record<string, unknown> };
    await route.fulfill({
      response,
      json: {
        json: {
          ...body.json,
          needsModel: true,
          defaultProvider: "openrouter",
          defaultModel: "openai/gpt-5.6-luna",
        },
      },
    });
  });

  const stamp = Date.now();
  await signup(
    page,
    `model-required-${stamp}@rakazo.test`,
    "password12",
    `Model required ${stamp}`,
  );
  await expect(page.getByRole("heading", { name: "Connect a model" })).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByRole("button", { name: "Skip for now" })).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Test API key" })).toBeHidden();
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();
  await page.getByLabel("API key", { exact: true }).fill("   ");
  await expect(continueButton).toBeDisabled();
  await page.getByLabel("API key", { exact: true }).fill("fake-test-key");
  await expect(continueButton).toBeEnabled();
  await page.getByLabel("API key", { exact: true }).fill("");
  await captureScreenshot(page, testInfo, "onboarding-model-required");
});

for (const unavailable of ["empty", "failed"] as const) {
  test(`onboarding cannot continue with a ${unavailable} model catalog`, async ({ page }) => {
    await page.route("**/rpc/me", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { json: Record<string, unknown> };
      await route.fulfill({ response, json: { json: { ...body.json, needsModel: true } } });
    });
    await page.route("**/rpc/models/list", (route) =>
      unavailable === "failed" ? route.abort() : route.fulfill({ json: { json: [] } }),
    );
    const stamp = Date.now();
    await signup(page, `catalog-${unavailable}-${stamp}@rakazo.test`, "password12", "Model setup");
    await expect(page.getByRole("alert")).toContainText("Could not load model providers");
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Create your first bot" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Message Kith" })).toHaveCount(0);
    await page.unroute("**/rpc/models/list");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Connect a model" })).toBeVisible();
  });
}

test("setup retries an unavailable account without creating a bot", async ({ page }) => {
  let createCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/bots/create")) createCalls += 1;
  });
  await page.route("**/rpc/me", (route) => route.abort());
  await signup(page, `setup-retry-${Date.now()}@rakazo.test`, "password12", "Setup retry");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(createCalls).toBe(0);
  await page.unroute("**/rpc/me");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("combobox", { name: "Message Kith" })).toBeVisible();
  expect(createCalls).toBe(1);
});

test("connecting holds the form and opens chat only after saving succeeds", async ({
  page,
}, testInfo) => {
  await page.route("**/rpc/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        json: {
          ...body.json,
          needsModel: true,
          defaultProvider: "openrouter",
          defaultModel: "openai/gpt-5.6-luna",
        },
      },
    });
  });
  let connectCalls = 0;
  let createCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/bots/create")) createCalls += 1;
  });
  await page.route("**/rpc/models/connect", async (route) => {
    connectCalls += 1;
    await gate;
    await route.fulfill({ json: { json: { ok: true } } });
  });
  await signup(page, `setup-connect-${Date.now()}@rakazo.test`, "password12", "Connect test");
  await page.getByLabel("API key", { exact: true }).fill("fake-model-key");
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "model-connect-narrow");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connecting…" })).toBeDisabled();
  await expect(page.getByLabel("API key", { exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Provider" })).toBeDisabled();
  expect(connectCalls).toBe(1);
  expect(createCalls).toBe(0);
  release();
  await expect(page.getByRole("combobox", { name: "Message Kith" })).toBeVisible();
  expect(connectCalls).toBe(1);
  expect(createCalls).toBe(1);
});
