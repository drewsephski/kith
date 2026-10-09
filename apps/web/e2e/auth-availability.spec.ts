import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

for (const width of [1280, 375]) {
  test(`anonymous authentication loads at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in to Kith" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await captureScreenshot(page, testInfo, `sign-in-${width}`);

    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: "Create your Kith" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await captureScreenshot(page, testInfo, `sign-up-${width}`);
  });
}
