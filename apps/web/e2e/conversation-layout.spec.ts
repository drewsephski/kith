import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/conversation-layout.html";

test("a visible reply keeps run activity without duplicating the avatar", async ({
  page,
}, testInfo) => {
  await page.goto(`${fixture}?response=final`);
  await expect(page.locator('[data-message-id="final-reply"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  const activity = page.getByTestId("active-bot-glyph");
  await expect(activity).toContainText("Working…");
  await expect(activity.locator("img[data-working]")).toHaveCount(0);
  await captureScreenshot(page, testInfo, "conversation-response-started");
});

test("the footer avatar disappears on first text and stays hidden when streaming is saved", async ({
  page,
}, testInfo) => {
  await page.goto(`${fixture}?response=lifecycle`);
  const indicator = page.getByTestId("active-bot-glyph");
  await expect(indicator).toBeVisible();
  await expect(indicator.locator("img[data-working]")).toHaveCount(1);
  await page.getByRole("button", { name: "Start response" }).click();
  await expect(page.getByTestId("assistant-response-row")).toContainText("I");
  await expect(indicator).toContainText("Working…");
  await expect(indicator.locator("img[data-working]")).toHaveCount(0);
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.locator('[data-message-id="final-reply"]')).toBeVisible();
  await expect(indicator.locator("img[data-working]")).toHaveCount(0);
  await captureScreenshot(page, testInfo, "conversation-response-saved");
  const composer = page.getByRole("combobox", { name: "Message Kith" });
  await composer.fill("What else?");
  await composer.press("Enter");
  await expect(indicator).toBeVisible();
  await expect(indicator.locator("img[data-working]")).toHaveCount(1);
});

test("a group reply keeps the loading indicator for a member that has not responded", async ({
  page,
}) => {
  await page.goto(`${fixture}?response=final&group`);
  await expect(page.locator('[data-message-id="final-reply"]')).toBeVisible();
  const activity = page.getByTestId("active-bot-glyph");
  await expect(activity).toHaveCount(2);
  await expect(activity.filter({ hasText: "Kith:" }).locator("img[data-working]")).toHaveCount(0);
  const research = activity.filter({ hasText: "Research:" });
  await expect(research).toContainText("Working…");
  await expect(research.locator(".rakazo-group-avatar")).toBeVisible();
});

test("the widened composer still sends and clears its draft", async ({ page }) => {
  await page.goto(`${fixture}?working=off`);
  const composer = page.getByRole("combobox", { name: "Message Kith" });
  await composer.fill("Save time for a walk.");
  await composer.press("Enter");
  await expect(page.getByTestId("message-user-bubble").last()).toHaveText("Save time for a walk.");
  await expect(composer).toHaveValue("");
});

test.describe("touch conversation", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test("long assistant prose uses the available width and actions stay reachable", async ({
    page,
  }, testInfo) => {
    await page.goto(`${fixture}?long&working=off`);
    const reply = page.locator('[data-message-id="long-reply"]');
    await expect(reply).toBeVisible();
    const width = await reply.evaluate((row) => ({
      row: row.getBoundingClientRect().width,
      bubble:
        row.querySelector('[data-testid="message-bot-bubble"]')?.getBoundingClientRect().width ?? 0,
    }));
    expect(width.bubble).toBeGreaterThan(width.row * 0.95);
    await expect(reply.getByRole("button", { name: "More", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, "conversation-touch-long");
  });
});

test("messages, working state, and composer share a wider responsive frame", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1920, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(fixture);
    const composer = page.getByTestId("composer-bar");
    await expect(composer).toBeVisible();
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const { x, y, width, height, right } = element.getBoundingClientRect();
        return { x, y, width, height, right };
      };
      return {
        row: box('[data-message-id="inbox"]'),
        bubble: box('[data-message-id="inbox"] [data-testid="message-user-bubble"]'),
        working: box('[data-testid="active-bot-glyph"]'),
        composer: box('[data-testid="composer-bar"]'),
        first: box('[data-message-id="question"]'),
        followup: box('[data-message-id="follow-up"]'),
        reply: box('[data-message-id="reply"]'),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(Math.abs(geometry.row.x - geometry.composer.x)).toBeLessThan(1);
    expect(Math.abs(geometry.row.right - geometry.composer.right)).toBeLessThan(1);
    expect(Math.abs(geometry.bubble.right - geometry.composer.right)).toBeLessThan(1);
    expect(Math.abs(geometry.working.x - geometry.composer.x)).toBeLessThan(1);
    expect(geometry.followup.y - geometry.first.y - geometry.first.height).toBeCloseTo(8, 0);
    expect(geometry.reply.y - geometry.followup.y - geometry.followup.height).toBeCloseTo(24, 0);
    if (width === 1920) expect(geometry.row.width).toBe(1120);
    await captureScreenshot(page, testInfo, `conversation-${width}`);
  }
  expect(errors).toEqual([]);
});

test("long replies and streaming stay inside narrow and split-panel layouts", async ({
  page,
}, testInfo) => {
  for (const width of [640, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${fixture}?long&working=off`);
    await expect(page.locator('[data-message-id="long-reply"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.goto(`${fixture}?streaming=on`);
    await expect(page.getByTestId("assistant-response-row")).toBeVisible();
    const activity = page.getByTestId("active-bot-glyph");
    await expect(activity).toContainText("Working…");
    await expect(activity.locator("img[data-working]")).toHaveCount(0);
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await captureScreenshot(page, testInfo, `conversation-streaming-${width}`);
  }
});

test("custom identity keeps failed input recoverable", async ({ page }, testInfo) => {
  await page.goto(`${fixture}?view=create&failure`);
  const card = page.getByTestId("bot-identity-card");
  await expect(card.getByRole("button", { name: "Custom", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "new-bot-identity");
  await card.getByRole("button", { name: "Custom", exact: true }).click();
  const name = card.getByRole("textbox", { name: "Name", exact: true });
  const role = card.getByRole("textbox", { name: "Role", exact: true });
  await expect(name).toBeFocused();
  const save = card.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await name.fill(" Research ");
  await role.fill(" Source review ");
  await save.click();
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(name).toHaveValue(" Research ");
  await expect(role).toHaveValue(" Source review ");
  await captureScreenshot(page, testInfo, "new-bot-custom-error");
  await role.press("Enter");
  await expect(page.getByTestId("created-profile")).toHaveText(
    JSON.stringify({ name: "Research", role: "Source review" }),
  );
});

test("identity cards and custom inputs fit mobile and respect keyboard cancellation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`${fixture}?view=create`);
  const card = page.getByTestId("bot-identity-card");
  await expect(card.getByTestId("bot-identity-pippin")).toBeVisible();
  await captureScreenshot(page, testInfo, "new-bot-mobile-identity");
  await card.getByRole("button", { name: "Custom", exact: true }).click();
  await card.getByRole("textbox", { name: "Name", exact: true }).fill("A".repeat(80));
  await card.getByRole("textbox", { name: "Role", exact: true }).fill("Research partner");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "new-bot-mobile-custom");
  const cancel = card.getByRole("button", { name: "Cancel", exact: true });
  await cancel.focus();
  await cancel.press("Enter");
  await expect(card.getByRole("textbox", { name: "Name", exact: true })).toHaveCount(0);
  await expect(card.getByTestId("bot-identity-miso")).toBeVisible();
});

test("shows Read beneath the user message while keeping the responding animation and text", async ({
  page,
}, testInfo) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${fixture}?working=off`);
    await expect(page.getByTestId("message-read-status")).toHaveCount(0);
    await page.goto(`${fixture}?working=off&read=older`);
    await expect(page.getByTestId("message-read-status")).toHaveCount(0);
    await page.goto(`${fixture}?read=latest`);
    const receipt = page.locator('[data-message-id="inbox"]').getByTestId("message-read-status");
    await expect(receipt).toHaveText("Read");
    await expect(page.getByTestId("message-read-status")).toHaveCount(1);
    const responding = page.getByTestId("active-bot-glyph");
    await expect(responding).toContainText("Working…");
    await expect(responding.locator("img[data-working]")).toHaveCount(1);
    const bubbleBox = await page
      .locator('[data-message-id="inbox"] [data-testid="message-bubble-frame"]')
      .boundingBox();
    const readBox = await receipt.boundingBox();
    expect(bubbleBox).toBeTruthy();
    expect(readBox).toBeTruthy();
    expect(Math.abs(readBox!.x + readBox!.width - (bubbleBox!.x + bubbleBox!.width))).toBeLessThan(
      2,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.reload();
    await expect(receipt).toHaveText("Read");
    await expect(responding.locator("img[data-working]")).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath(`message-read-${width}.png`),
      fullPage: true,
    });
    await testInfo.attach(`message-read-${width}`, {
      path: testInfo.outputPath(`message-read-${width}.png`),
      contentType: "image/png",
    });
  }
});
