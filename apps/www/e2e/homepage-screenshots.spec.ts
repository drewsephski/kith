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
  test.setTimeout(240_000);
  for (const width of [320, 375, 768, 860, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await page.locator("astro-island[ssr]").waitFor({ state: "detached" });
    await captureScreenshot(page, testInfo, `homepage-${width}`);
  }
  for (const locale of ["de", "ko", "zh"]) {
    for (const width of [375, 860, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/`);
      await page.waitForFunction(() => document.fonts.status === "loaded");
      await page.locator("#demo").scrollIntoViewIfNeeded();
      await page.locator("astro-island[ssr]").waitFor({ state: "detached" });
      await captureScreenshot(page, testInfo, `homepage-${locale}-${width}`);
    }
  }
  for (const path of [
    "download",
    "blog",
    "blog/getting-started-with-kith",
    "blog/choosing-an-ai-assistant",
    "blog/openclaw-vs-hermes-vs-kith",
    "grok-bot-alternative",
    "muse-alternative",
    "dots-alternative",
    "instinct-alternative",
    "hark-alternative",
    "hermes-alternative",
    "alternatives",
    "openclaw-alternative",
    "privacy",
    "terms",
    "about",
    "support",
  ]) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${path}/`);
      await page.waitForLoadState("load");
      await captureScreenshot(page, testInfo, `${path.replaceAll("/", "-")}-${width}`);
      const faq = page.locator("[data-faq-item] summary");
      if (await faq.count()) {
        await faq.first().click();
        await page.waitForFunction(() => {
          const item = document.querySelector("[data-faq-item]");
          return item?.getAnimations({ subtree: true }).length === 0;
        });
        await captureScreenshot(page, testInfo, `${path.replaceAll("/", "-")}-faq-open-${width}`);
      }
    }
  }
});
