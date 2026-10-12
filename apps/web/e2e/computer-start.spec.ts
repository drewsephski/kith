import { expect, test } from "@playwright/test";
import {
  activeBotId,
  captureScreenshot,
  completeOnboarding,
  createNamedBot,
  openAdvancedNavigation,
  rpc,
  signup,
} from "./helpers";

test("computer navigation stays passive and Start provisions once", async ({ page }, testInfo) => {
  let boots = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/computer/boot")) boots++;
  });
  await signup(page, `computer-start-${Date.now()}@rakazo.test`, "password12", "Computer Start");
  await completeOnboarding(page);
  const firstId = activeBotId(page);
  const toggle = page.getByRole("button", { name: "Computer", exact: true });
  await toggle.click();
  const start = page.getByRole("button", { name: "Start computer", exact: true });
  await expect(start).toBeVisible();
  expect(boots).toBe(0);
  await captureScreenshot(page, testInfo, "computer-explicit-start");
  await page.reload();
  await expect(start).toBeVisible();
  expect(boots).toBe(0);
  await start.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByTestId("computer-preview").locator("iframe")).toBeVisible();
  expect(boots).toBe(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("computer-preview").locator("iframe")).toBeVisible();
  expect(boots).toBe(1);
  await rpc(page, "computer/stop", { botId: firstId });
  await page.reload();
  await expect(page.getByRole("button", { name: "Start computer", exact: true })).toBeVisible();
  expect(boots).toBe(1);
  await openAdvancedNavigation(page);
  const secondId = await createNamedBot(page, "Private Starter", { computerMode: "dedicated" });
  // The scripted fixture's introduction writes a file. Set up a stopped destination
  // after that intentionally demanded work before exercising passive navigation.
  await expect
    .poll(
      async () =>
        (await rpc<{ run: { status: string } | null }>(page, "threads/get", { botId: secondId }))
          .run?.status ?? "completed",
    )
    .toBe("completed");
  await rpc(page, "computer/stop", { botId: secondId });
  await page.reload();
  const computerToggle = page.getByRole("button", { name: "Computer", exact: true });
  if ((await computerToggle.getAttribute("aria-pressed")) !== "true") await computerToggle.click();
  await expect(start).toBeVisible();
  expect(boots).toBe(1);
  await page.goto(`/app/${firstId}`);
  await expect(start).toBeVisible();
  expect(boots).toBe(1);
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "computer-explicit-start-mobile");
});
