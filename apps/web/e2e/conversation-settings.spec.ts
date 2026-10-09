import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/conversation-settings.html";

test("conversation menu is readable, keyboard accessible, and opens Settings", async ({
  page,
}, testInfo) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(fixture);
    const trigger = page.getByRole("button", { name: "Conversation details" });
    await trigger.focus();
    await trigger.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Settings", exact: true })).toBeVisible();
    await expect(menu.getByText("Assistant settings")).toHaveCount(0);
    await expect.poll(async () => Math.round((await menu.boundingBox())?.width ?? 0)).toBe(192);
    const geometry = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, left: rect.left, right: rect.right, viewport: innerWidth };
    });
    expect(geometry.width).toBeGreaterThan(191.5);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    if (width === 375) {
      await expect(menu.getByRole("menuitem", { name: "Connections" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Tasks" })).toBeVisible();
    } else {
      await expect(menu.getByRole("menuitem", { name: "Connections" })).toBeHidden();
      await expect(menu.getByRole("menuitem", { name: "Tasks" })).toBeHidden();
    }
    await captureScreenshot(page, testInfo, `conversation-menu-${width}`);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("region", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Clear conversation" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, `conversation-settings-${width}`);
  }
});

test("advanced profile edits persist and secondary actions stay available", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Conversation details" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Personal assistant");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("saved-profile")).toContainText('"title":"Personal assistant"');
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  await expect(page.getByTestId("conversation-action")).toHaveText("export");
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("menuitem", { name: "Clear conversation", exact: true }).click();
  await expect(page.getByTestId("conversation-action")).toHaveText("clear");
});

test("export failures are visible and group settings keep the correct destination", async ({
  page,
}) => {
  await page.goto(`${fixture}?export-error`);
  await page.getByRole("button", { name: "Conversation details" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Could not export");
  await page.goto(`${fixture}?group`);
  await page.getByRole("button", { name: "Conversation details" }).click();
  await expect(page.getByRole("menuitem", { name: "Computer", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("selected-panel")).toHaveText("group-settings");
});
