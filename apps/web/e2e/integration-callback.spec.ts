import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

for (const width of [1280, 375]) {
  test(`OAuth return is informational without a session at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    const accountRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/auth|\/rpc\//.test(request.url())) accountRequests.push(request.url());
    });
    await page.goto("/integrations/callback?status=success&connected_account_id=untrusted");
    await expect(page.getByText("Return to the app to finish connecting.")).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);
    expect(accountRequests).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await captureScreenshot(page, testInfo, `integration-callback-${width}`);
  });
}
