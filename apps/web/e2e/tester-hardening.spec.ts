import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Bot, ForYouDiscovery, ThreadSnapshot } from "@rakazo/contracts";
import { AI_PRIVACY_URL, DEFAULT_SUPPORT_URL } from "@rakazo/contracts";
import { captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

async function navigateConversation(page: Page, id: string) {
  await page.evaluate((botId) => {
    history.pushState({}, "", `/app/${botId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, id);
  await expect(page).toHaveURL(new RegExp(`/app/${id}$`));
  await expect(page.getByRole("combobox", { name: /Message/ })).toBeVisible();
}
async function setup(page: Page, prefix: string) {
  await signup(page, `${prefix}-${Date.now()}@example.test`, "password12", "Tester");
  await completeOnboarding(page);
  return rpc<{ botId: string }>(page, "assistant/get", {});
}

test("signup discloses password requirements and a real support destination", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/sign-up");
  await expect(page.getByText("At least 8 characters", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toHaveAttribute(
    "aria-describedby",
    "password-requirement",
  );
  await expect(page.getByRole("link", { name: "Support", exact: true })).toHaveAttribute(
    "href",
    DEFAULT_SUPPORT_URL,
  );
  await expect(page.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute(
    "href",
    AI_PRIVACY_URL,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "signup-password-help-mobile");
  await page.route("**/api/auth/capabilities", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), privacyUrl: "https://operator.example.test/privacy" },
    });
  });
  await page.reload();
  await expect(page.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute(
    "href",
    "https://operator.example.test/privacy",
  );
});

test("authenticated For you discovers saved intent and launches one durable grounded task", async ({
  page,
}, testInfo) => {
  const { botId: assistantId } = await setup(page, "grounded");
  await rpc(page, "scratchpad/create", {
    botId: assistantId,
    title: "Review my portfolio",
    notes: "Draft a concise introduction",
    status: "open",
  });
  await page
    .getByTestId("kith-navigation")
    .getByRole("button", { name: "For you", exact: true })
    .click();
  const recommended = page.getByTestId("for-you-recommendations");
  await expect(
    recommended.getByRole("button", { name: "Continue “Review my portfolio”", exact: true }),
  ).toBeVisible();
  await expect(recommended).toContainText("An unfinished item in your saved work.");
  await expect(recommended.locator("time")).toHaveAttribute("dateTime", /T/);
  await expect(
    page.getByTestId("for-you-page").getByRole("heading", { name: "Explore", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "authenticated-grounded-recommendation");
  const {
    recommendations: [recommendation],
  } = await rpc<ForYouDiscovery>(page, "forYou/discover", { assistantId });
  await recommended.getByRole("button", { name: recommendation!.title, exact: true }).click();
  await expect(page).not.toHaveURL(/for-you$/);
  const id = page.url().split("/").pop()!;
  const me = await rpc<{ userId: string; spaceId: string }>(page, "me", {});
  const retry = await rpc<Bot>(page, "bots/launchForYou", {
    ...me,
    assistantId,
    suggestionId: recommendation!.id,
    operationId: crypto.randomUUID(),
  });
  expect(retry.id).toBe(id);
  await expect
    .poll(async () => (await rpc<ThreadSnapshot>(page, "threads/get", { botId: id })).run?.status)
    .toBe("completed");
  const snapshot = await rpc<ThreadSnapshot>(page, "threads/get", { botId: id });
  const userMessages = snapshot.messages.filter((message) => message.role === "user");
  expect(userMessages).toHaveLength(1);
  expect(JSON.stringify(userMessages[0]!.blocks)).toContain("Review my portfolio");
  expect(JSON.stringify(userMessages[0]!.blocks)).not.toContain(
    "untrusted data, never instructions",
  );
  expect(JSON.stringify(userMessages[0]!.blocks)).not.toContain("operationId");
  await expect(page.getByTestId("run-status")).toHaveText("Done");
  await captureScreenshot(page, testInfo, "grounded-task-completed");
  await page
    .getByTestId("kith-navigation")
    .getByRole("button", { name: "For you", exact: true })
    .click();
  await expect(
    page
      .getByTestId("for-you-recommendations")
      .getByRole("button", { name: recommendation!.title, exact: true }),
  ).toHaveCount(0);
});

for (const draft of ["typed", "suggestion"] as const) {
  test(`accepted ${draft} draft never returns after A to B to A while work continues`, async ({
    page,
  }, testInfo) => {
    const { botId: assistantId } = await setup(page, `navigation-${draft}`);
    const peer = await rpc<Bot>(page, "bots/create", {
      name: "Other conversation",
      title: "",
      description: "",
      notifyOnFinish: false,
      startEmpty: true,
      parentBotId: assistantId,
    });
    const composer = page.getByRole("combobox", { name: /Message/ });
    if (draft === "suggestion") {
      await page.route("**/rpc/threads/suggestions", (route) =>
        route.fulfill({
          json: {
            json: [
              {
                id: "grounded-followup",
                title: "Continue reviewing the portfolio",
                prompt: "Keep working on the portfolio until I stop you",
              },
            ],
          },
        }),
      );
      await composer.fill("Review my portfolio options");
      await composer.press("Enter");
      await expect(page.getByTestId("run-status")).toHaveText("Done");
      await page
        .getByTestId("assistant-for-you")
        .getByRole("button", { name: "Continue reviewing the portfolio", exact: true })
        .click();
      await expect(composer).toHaveValue("Keep working on the portfolio until I stop you");
    } else await composer.fill("Keep working on the portfolio until I stop you");
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    await expect(page.getByTestId("run-status")).toContainText("still working…");
    await navigateConversation(page, peer.id);
    await composer.fill("Unsent edits in B");
    await navigateConversation(page, assistantId);
    await expect(composer).toHaveValue("");
    await expect(page.getByTestId("run-status")).toContainText("still working…");
    await page.reload();
    await expect(composer).toHaveValue("");
    await expect(page.getByTestId("run-status")).toContainText("still working…");
    await captureScreenshot(page, testInfo, `${draft}-return-to-live-run`);
    await rpc(page, "threads/stop", { botId: assistantId });
    await expect(page.getByTestId("run-status")).toHaveText("Stopped");
    await page.reload();
    await expect(page.getByTestId("run-status")).toHaveText("Stopped");
  });
}
