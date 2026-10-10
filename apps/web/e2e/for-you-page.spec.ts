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

test("retry after reload recovers the same launch after a lost response", async ({ page }) => {
  await page.goto(`${fixture}?send-error=1`);
  await page
    .getByRole("button", { name: "Draft replies that need your attention", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Select the suggestion to retry");
  await page.reload();
  await page
    .getByRole("button", { name: "Draft replies that need your attention", exact: true })
    .click();
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
  await page
    .getByTestId("for-you-starter")
    .getByRole("button", { name: "Make a plan for the week ahead", exact: true })
    .click();
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

test("narrow category controls reveal the final category with readable touch targets", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(fixture);
  const categories = page.getByRole("navigation", { name: "Suggestion categories" });
  await expect(page.getByRole("button", { name: "More categories", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More categories", exact: true }).click();
  const builders = categories.getByRole("button", { name: "For builders", exact: true });
  await expect(builders).toBeInViewport();
  await builders.click();
  await expect(builders).toHaveAttribute("aria-pressed", "true");
  const bounds = await builders.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "Review your launch readiness", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous categories", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "for-you-narrow-category-scroll");
});

test("For you prioritizes persisted approvals and changes connected suggestions by account", async ({
  page,
}, testInfo) => {
  const rows = [
    {
      runId: "result-fixture",
      botId: "bot-result",
      botName: "Weekly routine",
      groupId: null,
      groupName: null,
      threadId: "thread-result",
      messageId: "message-result",
      status: "completed",
      trigger: "routine",
      notificationsEnabled: false,
      promptSnippet: "Weekly review",
      updatedAt: "2026-10-09T12:00:00Z",
    },
    {
      runId: "approval-fixture",
      botId: "bot-approval",
      botName: "Inbox follow-up",
      groupId: null,
      groupName: null,
      threadId: "thread-approval",
      messageId: "message-approval",
      status: "waiting_input",
      trigger: "user",
      notificationsEnabled: false,
      promptSnippet: "Review reply before sending",
      updatedAt: "2026-10-09T11:00:00Z",
    },
  ];
  await page.route("**/rpc/runs/list", (route) =>
    route.fulfill({ json: { json: { runs: rows } } }),
  );
  await page.route("**/rpc/connections/list", (route) => route.fulfill({ json: { json: [] } }));
  let service = "github";
  await page.route("**/rpc/connections/catalog", (route) =>
    route.fulfill({
      json: {
        json: [
          {
            connectorId: "composio",
            slug: service,
            name: service,
            logo: null,
            connected: true,
            noAuth: false,
          },
        ],
      },
    }),
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${fixture}?personalized=1`);
    const work = page.getByTestId("for-you-work");
    await expect(work.getByRole("button").first()).toContainText("Review reply before sending");
    await work.getByRole("button").first().click();
    await expect(page.getByTestId("opened-work")).toHaveText("thread-approval:message-approval");
    const connected = page.getByTestId("for-you-connected");
    await expect(connected).toContainText(
      service === "github"
        ? "Get pull requests ready to ship"
        : "Draft replies that need your attention",
    );
    await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, `for-you-personalized-${viewport.width}`);
    service = "gmail";
  }
});

test("an uncertain authenticated launch survives reload without another conversation or prompt", async ({
  page,
}) => {
  await signup(page, `for-you-recovery-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  await page
    .getByTestId("kith-navigation")
    .getByRole("button", { name: "For you", exact: true })
    .click();
  const before = await rpc<Array<{ id: string }>>(page, "bots/list");
  await page.route("**/rpc/bots/launchForYou", async (route) => {
    // The server committed; simulate losing just the response, then use the real
    // endpoint on retry. The persisted client operation must survive the reload.
    await route.fetch();
    await route.abort("failed");
    await page.unroute("**/rpc/bots/launchForYou");
  });
  await page
    .getByTestId("for-you-starter")
    .getByRole("button", { name: "Make a plan for the week ahead", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  const after = await rpc<Array<{ id: string }>>(page, "bots/list");
  const launched = after.filter((bot) => !before.some((existing) => existing.id === bot.id));
  expect(launched).toHaveLength(1);
  await page.reload();
  await page
    .getByTestId("for-you-starter")
    .getByRole("button", { name: "Make a plan for the week ahead", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/${launched[0]!.id}$`));
  expect(await rpc(page, "bots/list")).toHaveLength(after.length);
  const thread = await rpc<{
    messages: Array<{ role: string; blocks: Array<{ kind: string; text?: string }> }>;
  }>(page, "threads/get", { botId: launched[0]!.id });
  const prompt = FOR_YOU_SUGGESTIONS.find((suggestion) => suggestion.id === "weekly-plan")!.prompt;
  expect(
    thread.messages.filter(
      (message) =>
        message.role === "user" &&
        message.blocks.some((block) => block.kind === "text" && block.text === prompt),
    ),
  ).toHaveLength(1);
});
