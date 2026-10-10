import { expect, test } from "@playwright/test";
import type { Bot } from "@rakazo/contracts";
import {
  activeBotId,
  captureScreenshot,
  completeOnboarding,
  createNamedBot,
  rpc,
  signup,
} from "./helpers";

test("Web handoff safely resumes one assistant across sign-up, concurrent tabs and reload", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/start?next=https://untrusted.example.test");
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByPlaceholder("Your name").fill("Alex");
  await page.getByPlaceholder("Your email address").fill(`journey-${Date.now()}@example.test`);
  await page.getByPlaceholder("Password").fill("password12");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await completeOnboarding(page);
  const assistant = activeBotId(page);
  const other = await context.newPage();
  await other.goto("/start");
  await expect(other).toHaveURL(new RegExp(`/app/${assistant}$`));
  expect(await rpc<Bot[]>(page, "bots/list", {})).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "Connect a model" })).toHaveCount(0);
  await page.getByText("Name your assistant", { exact: true }).click();
  await page.getByRole("textbox", { name: "Assistant name", exact: true }).fill("Juniper");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("main-conversation")).toContainText("Juniper");
  await expect(page.getByPlaceholder("Message Juniper")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await captureScreenshot(page, testInfo, "consumer-first-run");
  await page.getByRole("button", { name: "Research and projects", exact: true }).click();
  const nextAction = page.getByRole("button", { name: "What are you working on?", exact: true });
  await expect(nextAction).toBeVisible();
  const composer = page.getByPlaceholder("Message Juniper");
  await composer.fill("Compare these ideas for my project");
  await nextAction.click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("Compare these ideas for my project");
  await expect(page.getByTestId("transcript")).not.toContainText(
    "Compare these ideas for my project",
  );
  await other.reload();
  await expect(other.getByText("What are you working on?", { exact: true })).toBeVisible();
  await expect(other.getByTestId("main-conversation")).toContainText("Juniper");
  await page.goto("/start");
  await expect(page).toHaveURL(new RegExp(`/app/${assistant}$`));
  await expect(page.getByText("What are you working on?", { exact: true })).toBeVisible();
  await other.close();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByPlaceholder("Message Juniper")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "consumer-first-run-narrow");
});

test("returning home offers concrete connected-service prompts instead of task activity", async ({
  page,
}, testInfo) => {
  await signup(page, `returning-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  const primary = activeBotId(page);
  const project = await createNamedBot(page, "Project conversation");
  const composer = page.locator('textarea[name="chat-message"]');
  await composer.fill("Help me outline a research project");
  await composer.press("Enter");
  await expect
    .poll(async () =>
      (
        await rpc<{ runs: Array<{ botId: string; status: string }> }>(page, "runs/list", {
          filter: "recent",
        })
      ).runs.some((run) => run.botId === project && run.status === "completed"),
    )
    .toBe(true);
  await page.goto("/start");
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
  const highlights = page.getByTestId("assistant-for-you");
  await expect(highlights).toHaveCount(0);
  await page.reload();
  await expect(highlights).toHaveCount(0);
  const companion = page.getByTestId("assistant-welcome").locator("img");
  await expect(companion).toBeVisible();
  const companionBox = await companion.boundingBox();
  const transcriptBox = await page.locator(".kith-transcript").boundingBox();
  expect(companionBox!.y).toBeGreaterThanOrEqual(transcriptBox!.y);
  await captureScreenshot(page, testInfo, "consumer-returning-home");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(highlights).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "consumer-returning-home-narrow");

  await page.route("**/rpc/connections/list", (route) =>
    route.fulfill({
      json: {
        json: [
          {
            id: "gmail-fixture",
            connectorId: "composio",
            provider: "gmail",
            displayName: "Gmail",
            status: "connected",
            capabilities: [],
            createdAt: "2026-10-09T12:00:00Z",
          },
        ],
      },
    }),
  );
  await composer.fill("Remember that I prefer morning meetings.");
  await composer.press("Enter");
  await expect(page.getByTestId("message-bot-bubble").last()).toBeVisible();
  const prompt = highlights.getByRole("button", { name: "Draft important replies", exact: true });
  await expect(prompt).toBeVisible();
  await expect(highlights).not.toContainText("Needs attention");
  await expect(highlights).not.toContainText("In progress");
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const transcriptBox = (await page.getByTestId("transcript").boundingBox())!;
    const highlightsBox = (await highlights.boundingBox())!;
    const composerBox = (await page
      .getByRole("group", { name: "Message composer" })
      .boundingBox())!;
    expect(transcriptBox.y + transcriptBox.height).toBeLessThanOrEqual(highlightsBox.y);
    expect(highlightsBox.y + highlightsBox.height).toBeLessThanOrEqual(composerBox.y);
    expect(highlightsBox.height).toBeLessThanOrEqual(width < 640 ? 80 : 64);
    await captureScreenshot(page, testInfo, `consumer-prompt-suggestions-${width}`);
  }
  await prompt.click();
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
  await expect(composer).toHaveValue(/Go through my inbox.*create a draft response for each/);
  await expect(composer).toBeFocused();
});
