import { expect, test } from "@playwright/test";
import { FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import { captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

const fixture = "/e2e/fixtures/for-you-page.html";
test("For you groups and filters prompts at desktop and mobile sizes", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    const suggestions = page.getByTestId("for-you-page");
    await expect(suggestions.getByRole("heading", { name: "Outreach", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, `for-you-${viewport.width}x${viewport.height}`);
    await suggestions.getByRole("button", { name: "Routines", exact: true }).click();
    await expect(
      suggestions.getByRole("button", {
        name: "Draft replies that need your attention",
        exact: true,
      }),
    ).toHaveCount(0);
    await suggestions
      .getByRole("button", { name: "Set up a daily reply and bounce tracker", exact: true })
      .click();
    await expect(page.getByTestId("sent-prompt")).toHaveText(
      FOR_YOU_SUGGESTIONS.find((suggestion) => suggestion.id === "outreach-tracker")!.prompt,
    );
    await expect(page.getByTestId("sent-target")).toHaveText("conversation-fixture");
    await expect(page.locator('textarea[name="chat-message"]')).toHaveValue("");
  }
});
test("retry reuses the conversation after a send failure", async ({ page }) => {
  await page.goto(`${fixture}?send-error=1`);
  const suggestion = page.getByRole("button", {
    name: "Draft replies that need your attention",
    exact: true,
  });
  await suggestion.click();
  await expect(page.getByRole("alert")).toContainText("Select the suggestion to retry");
  await suggestion.click();
  await expect(page.getByTestId("sent-prompt")).toHaveText(FOR_YOU_SUGGESTIONS[0]!.prompt);
  await expect(page.getByTestId("created-count")).toHaveText("1");
});

test("the authenticated For you route sends a prompt in a new chat and survives refresh", async ({
  page,
}) => {
  await signup(page, `for-you-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  await page
    .getByTestId("kith-navigation")
    .getByRole("button", { name: "For you", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/for-you$/);
  await page.reload();
  await expect(page.getByTestId("for-you-page")).toBeVisible();
  await page.getByRole("button", { name: "Make a plan for the week ahead", exact: true }).click();
  await expect(page).not.toHaveURL(/\/app\/for-you$/);
  const botId = page.url().split("/").pop()!;
  const thread = await rpc<{
    messages: Array<{ role: string; blocks: Array<{ kind: string; text?: string }> }>;
  }>(page, "threads/get", { botId });
  const prompt = FOR_YOU_SUGGESTIONS.find((suggestion) => suggestion.id === "weekly-plan")!.prompt;
  expect(
    thread.messages.some(
      (message) =>
        message.role === "user" &&
        message.blocks.some((block) => block.kind === "text" && block.text === prompt),
    ),
  ).toBe(true);
});

test("For you retains window controls with the desktop sidebar collapsed", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`${fixture}?desktop-collapsed=1`);
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Minimize", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fullscreen", exact: true })).toBeVisible();
  await expect(page.getByTestId("for-you-page")).toBeVisible();
  await captureScreenshot(page, testInfo, "for-you-desktop-collapsed");
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await expect(page.getByTestId("kith-navigation")).toBeVisible();
});
