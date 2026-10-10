import type { Page, TestInfo } from "@playwright/test";
import { test } from "@playwright/test";

/** Visual record for the CI screenshot gallery. No content assertions. */
async function captureScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.locator("astro-dev-toolbar").evaluateAll((elements) => {
    for (const element of elements) element.remove();
  });
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    path: screenshotPath,
  });
  await testInfo.attach(name, { contentType: "image/png", path: screenshotPath });
}

test("homepage screenshots", async ({ page }, testInfo) => {
  // This is a capture job, enlarged to record the responsive and locale matrix.
  test.setTimeout(180_000);
  for (const width of [320, 375, 768, 860, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await page.locator("astro-island[ssr]").waitFor({ state: "detached" });
    await captureScreenshot(page, testInfo, `homepage-${width}`);
  }
  for (const locale of ["de", "ko", "zh"]) {
    for (const width of [375, 860, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/`);
      await page.evaluate(() => document.fonts.ready);
      await page.locator("#demo").scrollIntoViewIfNeeded();
      await page.locator("astro-island[ssr]").waitFor({ state: "detached" });
      await captureScreenshot(page, testInfo, `homepage-${locale}-${width}`);
    }
  }
  for (const path of [
    "download",
    "blog",
    "blog/self-host-an-ai-agent",
    "alternatives",
    "openclaw-alternative",
    "privacy",
    "terms",
    "about",
    "support",
    "self-hosted-ai-agent",
  ]) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${path}/`);
      await page.waitForLoadState("load");
      await captureScreenshot(page, testInfo, `${path.replaceAll("/", "-")}-${width}`);
    }
  }
});
