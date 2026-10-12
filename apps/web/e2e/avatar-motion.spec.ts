import { expect, test } from "@playwright/test";

test("bot avatar ring stays still when reduced motion is enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e/fixtures/avatar-motion.html");

  const avatar = page.locator(".rakazo-bot-avatar");
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("data-working", "true");

  const ring = avatar.locator(".rakazo-bot-avatar-ring");
  await expect(ring).toBeVisible();
  const snapshot = () =>
    ring.evaluate((el: SVGElement) => ({
      animationName: getComputedStyle(el).animationName,
      transform: getComputedStyle(el).transform,
    }));
  const first = await snapshot();
  await page.waitForTimeout(300);
  const second = await snapshot();

  expect(first.animationName).toBe("none");
  expect(second).toEqual(first);
});

test("default organic avatar stays still when reduced motion is enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e/fixtures/avatar-motion.html");
  const avatar = page.locator(".rakazo-organic-avatar");
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("data-working", "true");
  await expect(avatar.locator("animate")).toHaveCount(0);
  const body = avatar.locator(".rakazo-organic-avatar-body-working");
  const eyes = avatar.locator(".rakazo-organic-avatar-eyes-working");
  await expect(body).toHaveCSS("animation-name", "none");
  await expect(eyes).toHaveCSS("animation-name", "none");
  const snapshot = () =>
    body.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      path: el.getAttribute("d"),
    }));
  const first = await snapshot();
  await page.waitForTimeout(300);
  expect(await snapshot()).toEqual(first);
});
