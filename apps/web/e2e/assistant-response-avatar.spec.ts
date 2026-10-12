import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/response-streaming.html";

test("the assistant animation stays visible while generating and streaming", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${fixture}?stream=off`);
  const avatar = page.getByTestId("active-bot-glyph").locator("img");
  await expect(avatar).toHaveAttribute("data-animated", "true");
  await expect
    .poll(() =>
      avatar.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect(avatar).toHaveAttribute("src", /kith-companion-working/);
  await captureScreenshot(page, testInfo, "assistant-response-avatar-desktop");

  await page.goto(`${fixture}?stream=on`);
  await expect(page.getByTestId("message-bot-bubble")).toContainText("Lisbon is the cap");
  const inlineAvatar = page.locator('[data-message-id^="progress:"] img');
  await expect(inlineAvatar).toHaveAttribute("data-animated", "true");
  await expect(page.getByTestId("active-bot-glyph")).toBeVisible();
  await expect(page.getByTestId("active-bot-glyph").locator("img")).toHaveCount(0);
  const avatarBox = await inlineAvatar.boundingBox();
  const messageBox = await page
    .getByTestId("assistant-response-row")
    .locator(".rk-chat-markdown")
    .boundingBox();
  expect(avatarBox).not.toBeNull();
  expect(messageBox).not.toBeNull();
  expect(avatarBox!.x + avatarBox!.width).toBeLessThan(messageBox!.x);
  expect(
    Math.abs(avatarBox!.y + avatarBox!.height / 2 - (messageBox!.y + messageBox!.height / 2)),
  ).toBeLessThan(2);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "assistant-response-avatar-mobile");
  await page.emulateMedia({ colorScheme: "dark" });
  await captureScreenshot(page, testInfo, "assistant-response-avatar-dark");

  await page.goto(`${fixture}?phase=done`);
  await expect(page.getByTestId("active-bot-glyph")).toHaveCount(0);
  await expect(page.locator('img[data-working="true"]')).toHaveCount(0);
});

test("other bots retain their own avatars", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${fixture}?stream=off&bot=other`);
  const glyph = page.getByTestId("active-bot-glyph");
  await expect(glyph).toBeVisible();
  await expect(glyph.locator(".rakazo-bot-avatar")).toBeVisible();
  await expect(glyph.locator("img")).toHaveCount(0);
  await page.goto(`${fixture}?stream=on&bot=other`);
  await expect(glyph).toBeVisible();
  await expect(glyph.locator(".rakazo-bot-avatar")).toHaveCount(0);
});

test("reduced motion and offscreen loading use the still companion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${fixture}?stream=off`);
  const avatar = page.getByTestId("active-bot-glyph").locator("img");
  await expect(avatar).toHaveAttribute("data-animated", "false");
  await expect(avatar).toHaveAttribute("src", /kith-companion\.webp/);
  await expect(page.getByRole("status")).toContainText("Working…");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(avatar).toHaveAttribute("data-animated", "true");
  await avatar.evaluate((image: HTMLImageElement) => {
    image.style.transform = "translateY(1500px)";
  });
  await expect(avatar).toHaveAttribute("data-animated", "false");
  await avatar.evaluate((image: HTMLImageElement) => {
    image.style.transform = "";
  });
  await expect(avatar).toHaveAttribute("data-animated", "true");
});

test("an unavailable animation falls back to the still avatar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/*kith-companion-working.webp*", (route) => route.abort());
  await page.goto(`${fixture}?stream=off`);
  const avatar = page.getByTestId("active-bot-glyph").locator("img");
  await expect(avatar).toHaveAttribute("data-animated", "false");
  await expect(avatar).toHaveAttribute("src", /kith-companion\.webp/);
  await expect
    .poll(() =>
      avatar.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
});
