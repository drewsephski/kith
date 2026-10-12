import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

const fixture = "/e2e/fixtures/interface-polish.html";
test("the main sidebar offers creation and a menu without switching views", async ({
  page,
}, testInfo) => {
  await signup(page, `interface-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  await page.evaluate(() => localStorage.setItem("rakazo.activity-mode", "1"));
  await page.reload();
  await expect(page.getByPlaceholder("Message Kith")).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Privacy", exact: true })).toHaveAttribute(
    "href",
    "https://www.kith.surf/privacy/",
  );
  await expect(page).toHaveURL(url);
  await captureScreenshot(page, testInfo, "kith-more-menu");
  await page.keyboard.press("Escape");
  await page.getByTestId("create-menu-trigger").click();
  await expect(page.getByTestId("create-new-bot")).toBeVisible();
  await captureScreenshot(page, testInfo, "kith-new-menu");
});

test("a stalled computer boot can be stopped without blocking the conversation", async ({
  page,
}, testInfo) => {
  await signup(page, `boot-stop-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Computer", exact: true }).click();
  let release: (() => void) | undefined;
  await page.route("**/rpc/computer/boot", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.abort().catch(() => undefined);
  });
  await page.getByRole("button", { name: "Start computer", exact: true }).click();
  const progress = page.getByTestId("computer-boot-progress");
  await expect(progress).toContainText("Booting live desktop…");
  await captureScreenshot(page, testInfo, "boot-stop-control");
  await progress.getByRole("button", { name: "Stop", exact: true }).click();
  release?.();
  await expect(progress).toHaveCount(0);
  await expect(page.getByPlaceholder("Message Kith")).toBeVisible();
});
test("connected calendar, long activity labels, and navigation fit desktop and narrow windows", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(fixture);
    if (width === 375) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Workspace", exact: true })).toBeVisible();
    await expect(page.getByText("Back to Kith", { exact: true })).toHaveCount(0);
    await captureScreenshot(page, testInfo, `interface-menu-${width}`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Integrations", exact: true }).click();
    await expect(page.getByTestId("calendar-agenda")).toContainText(
      "Product planning and accessibility review",
    );
    await expect(
      page.getByRole("button", { name: "Connect Google Calendar", exact: true }),
    ).toHaveCount(0);
    await page.getByText("Calendar briefing", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Calendar", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, `interface-calendar-${width}`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const label = page.getByTitle(
      "Reviewing your connected calendar and checking the complete event description, attendees, and preparation details",
    );
    await expect(label).toBeVisible();
    expect(await label.evaluate((element) => getComputedStyle(element).textOverflow)).not.toBe(
      "ellipsis",
    );
    await expect(page.getByTestId("run-status")).toHaveText("Done");
    await expect(page.getByText("Preparing a response…", { exact: true })).toHaveCount(0);
    await captureScreenshot(page, testInfo, `interface-conversation-${width}`);
  }
});
test("recovery exposes Stop and shows the server's stopped result", async ({ page }, testInfo) => {
  await page.goto(`${fixture}?recovery`);
  await page.getByRole("button", { name: /Recovering Team Computer/ }).click();
  const dialog = page.getByTestId("computer-update-dialog");
  await expect(dialog).toContainText("Restoring your workspace");
  await captureScreenshot(page, testInfo, "recovery-stop-control");
  await dialog.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Stopped", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Recover computer", exact: true })).toHaveCount(
    0,
  );
  await expect(dialog).not.toContainText("Unsaved work may be lost");
  await expect(dialog.locator(".animate-spin")).toHaveCount(0);
  await captureScreenshot(page, testInfo, "recovery-stopped");
  await dialog.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Computer refreshed" })).toBeVisible();
});
test("calendar read errors offer recovery without a misleading empty schedule", async ({
  page,
}) => {
  await page.goto(`${fixture}?calendar&unavailable`);
  await expect(page.getByTestId("calendar-agenda")).toContainText("Could not load every calendar");
  await expect(page.getByTestId("calendar-agenda")).not.toContainText("No events");
  await expect(
    page.getByTestId("calendar-agenda").getByRole("button", { name: "Refresh" }),
  ).toBeEnabled();
});
