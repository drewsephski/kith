import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-09T18:00:00Z"));
});

test("routine date and time stay local and the calendar fits desktop and mobile", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/e2e/fixtures/date-pickers.html");
    const trigger = page.getByRole("button", { name: "Run at", exact: true });
    await expect(trigger).toContainText("Oct 9, 2026 · 09:30");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const popup = page.getByRole("dialog", { name: "Run at", exact: true });
    await expect(popup).toBeVisible();
    await expect(popup.locator('[data-selected-single="true"]')).toBeFocused();
    await popup.getByRole("button", { name: "Thursday, October 15th, 2026", exact: true }).click();
    await expect(trigger).toHaveAttribute("data-value", "2026-10-15T09:30");
    await page.getByLabel("Time", { exact: true }).fill("14:45");
    await expect(trigger).toHaveAttribute("data-value", "2026-10-15T14:45");
    const box = await popup.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await captureScreenshot(page, testInfo, `routine-date-picker-${viewport.width}`);
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await popup.getByRole("button", { name: "Clear date" }).click();
    await expect(trigger).toHaveAttribute("data-value", "");
    await expect(trigger).toContainText("Pick a date");
    await expect(page.locator('input[type="date"], input[type="datetime-local"]')).toHaveCount(0);
  }
});

test("task due dates support keyboard selection, clearing, and dark mode", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/fixtures/date-pickers.html?view=todos&theme=dark");
  await page.getByText("Edit action", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Due date", exact: true });
  await expect(trigger).toHaveAttribute("data-value", "2026-10-09");
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "Due date", exact: true });
  await expect(popup.locator('[data-selected-single="true"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("data-value", "2026-10-10");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await captureScreenshot(page, testInfo, "task-due-date-picker-mobile-dark");
  await popup.getByRole("button", { name: "Clear date" }).click();
  await expect(trigger).toHaveAttribute("data-value", "");
  await trigger.click();
  await expect(popup.getByRole("button", { name: "Clear date" })).toBeDisabled();
});

test("activity range dates filter rows and can be cleared independently", async ({
  page,
}, testInfo) => {
  await page.goto("/e2e/fixtures/date-pickers.html?view=activity");
  await page.getByText("Filters", { exact: true }).click();
  const from = page.getByTestId("activity-date-from");
  const to = page.getByTestId("activity-date-to");
  const fromPopup = page.getByRole("dialog", { name: "From", exact: true });
  const toPopup = page.getByRole("dialog", { name: "To", exact: true });
  const row = page.getByRole("button", { name: /^Launch review, / });
  await expect(row).toBeVisible();
  await from.click();
  await fromPopup
    .getByRole("button", { name: "Saturday, October 10th, 2026", exact: true })
    .click();
  await expect(from).toHaveAttribute("data-value", "2026-10-10");
  await expect(row).toHaveCount(0);
  await expect(page.getByText("No tasks match these filters.")).toBeVisible();
  await from.click();
  await fromPopup.getByRole("button", { name: "Clear date" }).click();
  await expect(fromPopup).toBeHidden();
  await expect(row).toBeVisible();
  await to.click();
  await toPopup.getByRole("button", { name: "Thursday, October 8th, 2026", exact: true }).click();
  await expect(to).toHaveAttribute("data-value", "2026-10-08");
  await expect(row).toHaveCount(0);
  await to.click();
  await captureScreenshot(page, testInfo, "activity-date-picker-desktop");
  await toPopup.getByRole("button", { name: "Clear date" }).click();
  await expect(row).toBeVisible();
  await expect(from).toHaveAttribute("data-value", "");
  await expect(to).toHaveAttribute("data-value", "");
});
