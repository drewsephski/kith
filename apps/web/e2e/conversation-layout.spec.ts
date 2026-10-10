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

test("new bot creation keeps optional settings and failed input recoverable", async ({
  page,
}, testInfo) => {
  await page.goto(`${fixture}?view=create&failure`);
  const form = page.getByTestId("create-bot-form");
  const name = form.getByRole("textbox", { name: "Name", exact: true });
  const description = form.getByRole("textbox", { name: "Description", exact: true });
  const title = form.getByRole("textbox", { name: "Title", exact: true });
  const create = form.getByRole("button", { name: "Create", exact: true });
  await expect(name).toBeFocused();
  await expect(create).toBeDisabled();
  await expect(title).toBeHidden();
  await captureScreenshot(page, testInfo, "new-bot-minimal");
  await name.fill("   ");
  await expect(create).toBeDisabled();
  await name.fill(" Research ");
  await description.fill(" Summarize sources and keep useful links. ");
  const options = form.getByRole("button", { name: "More options", exact: true });
  await options.click();
  await title.fill(" Source review ");
  await form.getByTestId("create-bot-private").click();
  await options.click();
  await create.click();
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(name).toBeDisabled();
  await expect(form.getByRole("button", { name: "Cancel new bot" })).toBeDisabled();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(name).toHaveValue(" Research ");
  await expect(description).toHaveValue(" Summarize sources and keep useful links. ");
  await options.click();
  await expect(title).toHaveValue(" Source review ");
  await expect(form.getByTestId("create-bot-private")).toHaveAttribute("aria-pressed", "true");
  await captureScreenshot(page, testInfo, "new-bot-options-error");
  await name.press("Enter");
  await expect(page.getByTestId("created-profile")).toContainText('"computerMode":"dedicated"');
  const created = JSON.parse((await page.getByTestId("created-profile").textContent()) ?? "{}");
  expect(created).toEqual({
    name: "Research",
    title: "Source review",
    description: "Summarize sources and keep useful links.",
    computerMode: "dedicated",
  });
});

test("new bot form fits mobile and cancellation is keyboard accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`${fixture}?view=create`);
  const form = page.getByTestId("create-bot-form");
  await expect(form.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  await captureScreenshot(page, testInfo, "new-bot-mobile");
  await form.getByRole("button", { name: "More options", exact: true }).click();
  await expect(form.getByTestId("create-bot-private")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "new-bot-mobile-options");
  const cancel = form.getByRole("button", { name: "Cancel new bot" });
  await cancel.focus();
  await cancel.press("Enter");
  await expect(page.getByTestId("created-profile")).toHaveText("Cancelled");
});
