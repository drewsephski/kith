import type { Page, TestInfo } from "@playwright/test";
import { test } from "@playwright/test";

/** Visual record for the CI screenshot gallery. No content assertions. */
async function captureScreenshot(page: Page, testInfo: TestInfo, name: string) {
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
  await page.goto("/");
  await page.waitForLoadState("load");
  await captureScreenshot(page, testInfo, "01-marketing-homepage");

  await page.goto("/download/");
  await page.waitForLoadState("load");
  await captureScreenshot(page, testInfo, "02-marketing-desktop");
  await page.goto("/");
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "03-marketing-homepage-mobile");

  await page.goto("/zh/");
  await page.waitForLoadState("load");
  await captureScreenshot(page, testInfo, "03-marketing-homepage-zh");
});
