import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/settings-layout.html";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 600 },
  { width: 375, height: 812 },
]) {
  test(`settings keep their bounds across every tab at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    const settings = page.getByTestId("user-settings");
    await expect(settings.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    const bounds = await settings.boundingBox();
    expect(bounds).not.toBeNull();
    if (viewport.width < 768) {
      for (const item of await settings.getByTestId("settings-nav").getByRole("button").all()) {
        await expect(item).toBeInViewport();
      }
    }

    for (const section of [
      "general",
      "models",
      "memory",
      "voice",
      "usage",
      "computer",
      "billing",
      "updates",
    ]) {
      await settings.getByTestId(`settings-nav-${section}`).click();
      await expect(settings).toHaveAttribute("data-settings-section", section);
      await expect.poll(() => settings.boundingBox()).toEqual(bounds);
      if (section === "models") {
        await expect(settings.getByText("Connected · DeepSeek", { exact: true })).toBeVisible();
      }
      if (section === "voice") {
        await expect(settings.getByLabel("API key", { exact: true })).toBeVisible();
      }
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      const overflow = await settings.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      );
      expect(overflow).toBe(false);
      const contentOverflow = await settings.evaluate((element) =>
        [...element.querySelectorAll<HTMLElement>(".rk-scroll")].some(
          (scroll) => scroll.scrollWidth > scroll.clientWidth + 1,
        ),
      );
      expect(contentOverflow).toBe(false);
      if (["general", "models", "voice"].includes(section)) {
        await captureScreenshot(page, testInfo, `settings-${section}-${viewport.width}`);
      }
    }
    expect(errors).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
  });
}

test("narrow settings scroll to provider actions and reset when switching tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(fixture);
  const settings = page.getByTestId("user-settings");
  await settings.getByTestId("settings-nav-models").click();
  await settings
    .getByRole("button", { name: "Save backups", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    settings.getByRole("button", { name: "Save backups", exact: true }),
  ).toBeInViewport();
  await expect(settings.getByRole("heading", { name: "Models", exact: true })).toBeInViewport();
  await settings.getByTestId("settings-nav-voice").click();
  await settings.getByLabel("API key", { exact: true }).scrollIntoViewIfNeeded();
  await expect(settings.getByRole("button", { name: "Connect", exact: true })).toBeInViewport();
  await settings.getByTestId("settings-nav-general").click();
  await expect(settings.getByRole("heading", { name: "Account", exact: true })).toBeInViewport();
});
