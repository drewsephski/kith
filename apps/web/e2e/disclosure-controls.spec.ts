import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`shared disclosures and selects support keyboard and ${reducedMotion} motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await signup(
      page,
      `disclosure-${reducedMotion}-${Date.now()}@rakazo.test`,
      "password12",
      "Controls Test",
    );
    await completeOnboarding(page);
    const settings = await openUserSettings(page);
    const advanced = settings.getByTestId("advanced-settings");
    const toggle = advanced.getByRole("button", { name: "Advanced", exact: true });
    const stream = advanced.getByTestId("response-streaming-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(stream).toBeVisible();
    // A collapse must animate through intermediate heights, rather than disappear
    // immediately. Reduced motion must omit that animation altogether.
    await expect
      .poll(() =>
        advanced.locator('[data-slot="collapsible-content"]').evaluate((panel) => {
          const height = panel.getBoundingClientRect().height;
          return height > 0 && Math.abs(height - panel.scrollHeight) < 1;
        }),
      )
      .toBe(true);
    const heights = await advanced.evaluate(async (root) => {
      const button = root.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!;
      const panel = root.querySelector<HTMLElement>('[data-slot="collapsible-content"]')!;
      const heights = [panel.getBoundingClientRect().height];
      button.click();
      const start = performance.now();
      while (performance.now() - start < 350) {
        await new Promise(requestAnimationFrame);
        heights.push(panel.getBoundingClientRect().height);
      }
      return heights;
    });
    await expect(stream).toBeHidden();
    expect(heights.at(-1)).toBe(0);
    if (reducedMotion === "no-preference") {
      expect(heights.some((height) => height > 0 && height < heights[0]!)).toBe(true);
    } else {
      const duration = await advanced
        .locator('[data-slot="collapsible-content"]')
        .evaluate((panel) => getComputedStyle(panel).transitionDuration);
      expect(duration.split(",").every((part) => parseFloat(part) < 0.001)).toBe(true);
    }
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(stream).toBeVisible();

    const language = settings.getByTestId("ui-locale-select");
    await language.focus();
    await page.keyboard.press("ArrowDown");
    const popup = page.locator('[data-slot="select-content"]');
    await expect(popup).toBeVisible();
    await expect(page.getByRole("option", { name: "English", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(language).toBeFocused();
    await expect(language).toHaveAttribute("data-value", "en");

    await page.setViewportSize({ width: 375, height: 812 });
    await language.click();
    await expect(popup).toBeVisible();
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, `select-${reducedMotion}-narrow`);
  });
}
