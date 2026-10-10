import { expect, test } from "@playwright/test";
import {
  activeBotId,
  captureScreenshot,
  completeOnboarding,
  openUserSettings,
  rpc,
  signup,
} from "./helpers";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`chat selection, keyboard tabs, and narrow layout with motion ${reducedMotion}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: "light", reducedMotion });
    await page.setViewportSize({ width: 1280, height: 900 });
    await signup(
      page,
      `chat-polish-${reducedMotion}-${Date.now()}@example.test`,
      "password12",
      "Alex",
    );
    await completeOnboarding(page);
    const assistantId = activeBotId(page);
    const nav = page.getByTestId("kith-navigation");
    const main = nav.getByTestId("main-conversation");
    const indicator = '[data-slot="selection-indicator"]';
    await expect(main).toHaveAttribute("aria-current", "page");
    await expect(main.locator(indicator)).toHaveCount(1);
    await captureScreenshot(page, testInfo, `chat-light-${reducedMotion}`);

    await nav.getByRole("button", { name: "New conversation", exact: true }).click();
    await expect(main).not.toHaveAttribute("aria-current", "page");
    const threadId = activeBotId(page);
    const conversations = nav.getByRole("region", { name: "Recent conversations" });
    const thread = conversations.getByRole("button", { name: "New conversation", exact: true });
    await expect(thread).toHaveAttribute("aria-current", "page");
    await expect(thread.locator(indicator)).toHaveCount(1);
    const composer = page.locator('textarea[name="chat-message"]');
    await composer.fill("Keep this draft");
    await main.click();
    await expect(composer).toHaveValue("");
    await thread.click();
    await expect(composer).toHaveValue("Keep this draft");
    await composer.fill("");

    const group = await rpc<{ id: string }>(page, "groups/create", {
      name: "Review team",
      botIds: [assistantId, threadId],
    });
    await page.goto(`/app/g/${group.id}`);
    const groupLink = conversations.getByRole("button", { name: "Review team", exact: true });
    await expect(groupLink).toHaveAttribute("aria-current", "page");
    await expect(groupLink.locator(indicator)).toHaveCount(1);
    await expect(main).not.toHaveAttribute("aria-current", "page");
    await main.click();

    const settings = await openUserSettings(page);
    await expect(
      nav.getByRole("button", { name: "Settings", exact: true, includeHidden: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await settings.getByTestId("settings-nav-usage").click();
    await expect(settings.getByTestId("settings-nav-usage").locator(indicator)).toHaveCount(1);
    await expect(settings.getByTestId("settings-nav-general").locator(indicator)).toHaveCount(0);
    await captureScreenshot(page, testInfo, `chat-settings-${reducedMotion}`);
    await page.keyboard.press("Escape");

    await page.getByTestId("bot-settings-trigger").click();
    await page.getByTestId("avatar-studio-trigger").click();
    const studio = page.getByTestId("avatar-studio");
    const botTab = studio.getByRole("tab", { name: "Bot", exact: true });
    const uploadTab = studio.getByRole("tab", { name: "Upload", exact: true });
    await botTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(uploadTab).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(uploadTab).toHaveAttribute("aria-selected", "true");
    await expect(uploadTab.locator(indicator)).toHaveCount(1);
    await expect(studio.getByRole("button", { name: "Image upload area" })).toBeVisible();
    await botTab.click();
    await expect(studio.getByTestId("avatar-studio-bot-tab")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(studio).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("side-panel")).toHaveAttribute("data-panel", "closed");

    await page.emulateMedia({ colorScheme: "dark" });
    await captureScreenshot(page, testInfo, `chat-dark-${reducedMotion}`);
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(composer).toBeVisible();
    await expect(page.getByTestId("bots-sidebar")).toHaveAttribute("inert", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(main).toBeVisible();
    await expect(page.getByTestId("bots-sidebar")).not.toHaveAttribute("inert");
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(settings).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bots-sidebar")).toHaveClass(/-translate-x-full/);
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
    await captureScreenshot(page, testInfo, `chat-mobile-${reducedMotion}`);
    expect(errors).toEqual([]);
  });
}
