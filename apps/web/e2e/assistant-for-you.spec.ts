import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/assistant-for-you.html";

test("readable prompt suggestions fit above the composer without covering the transcript", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
    { width: 375, height: 400 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    const suggestions = page.getByTestId("assistant-for-you");
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByRole("button")).toHaveCount(3);
    await expect(suggestions).not.toContainText("Completed");
    await expect(suggestions).not.toContainText("Needs attention");
    await expect(suggestions).not.toContainText("In progress");
    const transcript = page.getByTestId("transcript");
    await transcript.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const transcriptBox = (await transcript.boundingBox())!;
    const suggestionsBox = (await suggestions.boundingBox())!;
    const composerBox = (await page
      .getByRole("group", { name: "Message composer" })
      .boundingBox())!;
    expect(transcriptBox.y + transcriptBox.height).toBeLessThanOrEqual(suggestionsBox.y);
    expect(suggestionsBox.y + suggestionsBox.height).toBeLessThanOrEqual(composerBox.y);
    expect(suggestionsBox.height).toBeLessThanOrEqual(viewport.width < 640 ? 80 : 64);
    expect(suggestionsBox.x).toBe(composerBox.x);
    expect(suggestionsBox.width).toBe(composerBox.width);
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(suggestions).toHaveJSProperty("scrollWidth", Math.round(suggestionsBox.width));
    for (const button of await suggestions.getByRole("button").all()) {
      if (viewport.width < 640) {
        await button.focus();
        await expect(button).toBeInViewport();
        expect(
          await button
            .locator("span")
            .evaluate((span) => Number.parseFloat(getComputedStyle(span).fontSize)),
        ).toBeGreaterThanOrEqual(14);
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      } else {
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(suggestionsBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(suggestionsBox.x + suggestionsBox.width);
      }
    }
    const composer = page.locator('textarea[name="chat-message"]');
    const gmail = suggestions.getByRole("button", {
      name: "Draft important replies",
      exact: true,
    });
    await gmail.focus();
    await page.keyboard.press("Enter");
    await expect(composer).toHaveValue(/Go through my inbox.*create a draft response for each/);
    await expect(composer).toBeFocused();
    await expect(page.getByRole("button", { name: "Remove task starter" })).toHaveCount(0);
    await suggestions.getByRole("button", { name: "Collect recent receipts", exact: true }).click();
    await expect(composer).toHaveValue(/Find receipts and invoices.*past 30 days/);
    await expect(page.getByRole("button", { name: "Remove task starter" })).toHaveCount(0);
    const filledComposerBox = (await page
      .getByRole("group", { name: "Message composer" })
      .boundingBox())!;
    expect(filledComposerBox.y + filledComposerBox.height).toBeLessThanOrEqual(viewport.height);
    expect(
      (await composer.boundingBox())!.y + (await composer.boundingBox())!.height,
    ).toBeLessThanOrEqual(viewport.height);
    await captureScreenshot(
      page,
      testInfo,
      `prompt-suggestions-${viewport.width}x${viewport.height}`,
    );
  }
});

test("unavailable services leave no suggestions or reserved space", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 400 });
  await page.goto(`${fixture}?error=1`);
  await expect(page.locator('textarea[name="chat-message"]')).toBeVisible();
  await expect(page.getByTestId("assistant-for-you")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("conversation follow-ups fill the draft and refresh with each completed reply", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${fixture}?followups=1`);
    const strip = page.getByTestId("assistant-for-you");
    await expect(strip.getByRole("button")).toHaveCount(3);
    await expect(strip).not.toContainText("Draft important replies");
    await strip.getByRole("button", { name: "Compare milestone options", exact: true }).click();
    const composer = page.locator('textarea[name="chat-message"]');
    await expect(composer).toHaveValue(
      "Compare onboarding and search for the next milestone, including their tradeoffs.",
    );
    await expect(composer).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, `conversation-follow-ups-${viewport.width}`);
    await page.getByRole("button", { name: "Start response", exact: true }).click();
    await expect(strip).toHaveCount(0);
    await page.getByRole("button", { name: "Next reply", exact: true }).click();
    await expect(strip.getByRole("button")).toHaveCount(1);
    await expect(strip).toContainText("Break down onboarding work");
    await expect(strip).not.toContainText("Compare milestone options");
    await expect(composer).toHaveValue(
      "Compare onboarding and search for the next milestone, including their tradeoffs.",
    );
    await page.getByRole("button", { name: "Clear conversation", exact: true }).click();
    await expect(strip).toHaveCount(0);
  }
});

test("a follow-up provider failure leaves the composer usable without unrelated suggestions", async ({
  page,
}) => {
  await page.goto(`${fixture}?followups=1&error=1`);
  const composer = page.locator('textarea[name="chat-message"]');
  await composer.fill("Continue with the onboarding milestone");
  await expect(composer).toHaveValue("Continue with the onboarding milestone");
  await expect(page.getByTestId("assistant-for-you")).toHaveCount(0);
});

test("connected-service starters stay above the composer when follow-ups are empty or unavailable", async ({
  page,
}, testInfo) => {
  for (const mode of ["empty-followups", "error"]) {
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${fixture}?followups=1&connected=1&${mode}=1`);
      const strip = page.getByTestId("assistant-for-you");
      const starter = strip.getByRole("button", { name: "Draft important replies", exact: true });
      await expect(starter).toBeVisible();
      await starter.click();
      const composer = page.locator('textarea[name="chat-message"]');
      await expect(composer).toHaveValue(/Go through my inbox.*create a draft response for each/);
      await expect(composer).toBeFocused();
      await captureScreenshot(page, testInfo, `composer-starter-fallback-${mode}-${width}`);
      await page.getByRole("button", { name: "Start response", exact: true }).click();
      await expect(strip).toHaveCount(0);
    }
  }
});

test("mention menu and selected chips use service logos offline in both themes", async ({
  page,
}, testInfo) => {
  await page.route("https://svgl.app/**", (route) => route.abort());
  await page.route("https://brand.composio.dev/**", (route) => route.abort());
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${fixture}?followups=1&connected=1&empty-followups=1`);
      const composer = page.locator('textarea[name="chat-message"]');
      await composer.fill("@");
      const picker = page.getByTestId("mention-picker");
      await expect(picker.getByRole("option")).toHaveCount(8);
      for (const brand of [
        "gmail",
        "composio",
        "github",
        "googlecalendar",
        "notion",
        "googlesheets",
        "slack",
        "supabase",
      ]) {
        const images = picker.locator(`[data-brand="${brand}"] img:visible`);
        await expect(images).toHaveCount(1);
        await expect(images).toHaveAttribute("src", /^data:image\/svg\+xml/);
        await expect
          .poll(() =>
            images.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
          )
          .toBe(true);
      }
      await captureScreenshot(page, testInfo, `composer-mention-logos-${theme}-${width}`);
      await picker.getByRole("option", { name: "@Work inbox", exact: true }).click();
      await expect(
        page.getByTestId("mention-chip").locator('[data-brand="gmail"] img:visible'),
      ).toBeVisible();
      await expect(composer).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
    }
  }
});

test("prompt arrows animate on hover and honor reduced motion without shifting layout", async ({
  page,
}) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${fixture}?followups=1`);
    const button = page.getByTestId("assistant-for-you").getByRole("button").first();
    await expect(button).toBeVisible();
    const before = (await button.boundingBox())!;
    const sampling = button.locator("svg").evaluate(async (svg) => {
      const frames: string[] = [];
      const until = performance.now() + 650;
      while (performance.now() < until) {
        frames.push(getComputedStyle(svg).transform);
        await new Promise(requestAnimationFrame);
      }
      return frames;
    });
    await button.hover();
    const frames = await sampling;
    const moved = frames.some((frame) => frame !== "none" && frame !== "matrix(1, 0, 0, 1, 0, 0)");
    expect(moved).toBe(reducedMotion === "no-preference");
    const after = (await button.boundingBox())!;
    expect(after).toEqual(before);
    await expect(page.locator('textarea[name="chat-message"]')).toHaveValue("");
  }
});
