import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/assistant-for-you.html";

test("prefilled prompts fit above the composer without scrolling or covering the transcript", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
    { width: 375, height: 400 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    const suggestions = page.getByTestId("assistant-for-you");
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByRole("button")).toHaveCount(3);
    await expect(suggestions).not.toContainText("Completed");
    await expect(suggestions).not.toContainText("Needs attention");
    await expect(suggestions).not.toContainText("In progress");
    const transcript = page.getByTestId("transcript");
    await transcript.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const transcriptBox = (await transcript.boundingBox())!;
    const suggestionsBox = (await suggestions.boundingBox())!;
    const composerBox = (await page
      .getByRole("group", { name: "Message composer" })
      .boundingBox())!;
    expect(transcriptBox.y + transcriptBox.height).toBeLessThanOrEqual(suggestionsBox.y);
    expect(suggestionsBox.y + suggestionsBox.height).toBeLessThanOrEqual(composerBox.y);
    expect(suggestionsBox.height).toBeLessThanOrEqual(viewport.width < 640 ? 80 : 64);
    expect(suggestionsBox.x).toBe(composerBox.x);
    expect(suggestionsBox.width).toBe(composerBox.width);
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(suggestions).toHaveJSProperty("scrollWidth", Math.round(suggestionsBox.width));
    for (const button of await suggestions.getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(suggestionsBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(suggestionsBox.x + suggestionsBox.width);
    }
    const composer = page.locator('textarea[name="chat-message"]');
    const gmail = suggestions.getByRole("button", {
      name: "Draft important replies",
      exact: true,
    });
    await gmail.focus();
    await page.keyboard.press("Enter");
    await expect(composer).toHaveValue(/Go through my inbox.*create a draft response for each/);
    await expect(composer).toBeFocused();
    await expect(page.getByRole("button", { name: "Remove task starter" })).toHaveCount(0);
    await suggestions.getByRole("button", { name: "Collect recent receipts", exact: true }).click();
    await expect(composer).toHaveValue(/Find receipts and invoices.*past 30 days/);
    await expect(page.getByRole("button", { name: "Remove task starter" })).toHaveCount(0);
    const filledComposerBox = (await page
      .getByRole("group", { name: "Message composer" })
      .boundingBox())!;
    expect(filledComposerBox.y + filledComposerBox.height).toBeLessThanOrEqual(viewport.height);
    expect(
      (await composer.boundingBox())!.y + (await composer.boundingBox())!.height,
    ).toBeLessThanOrEqual(viewport.height);
    await captureScreenshot(
      page,
      testInfo,
      `prompt-suggestions-${viewport.width}x${viewport.height}`,
    );
  }
});

test("unavailable services leave no suggestions or reserved space", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 400 });
  await page.goto(`${fixture}?error=1`);
  await expect(page.locator('textarea[name="chat-message"]')).toBeVisible();
  await expect(page.getByTestId("assistant-for-you")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
