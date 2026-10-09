import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

test("offers one inline calendar card, connects, and preserves success after reload", async ({
  page,
}, testInfo) => {
  await signup(page, `inline-calendar-${Date.now()}@rakazo.test`, "password12", "Calendar Test");
  await completeOnboarding(page);
  await page.getByPlaceholder(/Message/).fill("show a calendar connection card");
  await page.keyboard.press("Enter");
  const card = page.getByRole("group", { name: "Google Calendar connection" });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible();
  await captureScreenshot(page, testInfo, "inline-calendar-connection");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await captureScreenshot(page, testInfo, "inline-calendar-connection-mobile");
  await card.getByRole("button", { name: "Connect Google Calendar" }).click();
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);
});
