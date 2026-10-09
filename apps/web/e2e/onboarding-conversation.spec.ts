import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  activeBotId,
  captureScreenshot,
  completeOnboarding,
  openUserSettings,
  rpc,
  signup,
} from "./helpers";

function gmailCard(page: Page) {
  return page.getByRole("group", { name: "Gmail connection" });
}

test("focus choice offers one relevant optional account and preserves its authorization", async ({
  page,
}, testInfo) => {
  await signup(page, `onboarding-${Date.now()}@example.test`, "password12", "Robin");
  await completeOnboarding(page);
  await expect(page.getByText("What should I help you with first?", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Organize my day", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Research and projects", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "choice-card-onboarding");
  await page.getByRole("button", { name: "Email and follow-ups", exact: true }).click();
  await expect(page.getByPlaceholder("Message Kith")).toBeVisible();
  await expect(page.getByRole("group", { name: / connection$/ })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Turn my inbox into a to-do list", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "02-app-suggestions");
  await gmailCard(page).getByRole("button", { name: "Connect Gmail", exact: true }).click();
  await expect(gmailCard(page).getByText("Connected", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      (await rpc<Array<{ provider: string; status: string }>>(page, "connections/list", {})).some(
        (item) => /gmail/i.test(item.provider) && item.status === "connected",
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(gmailCard(page).getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Organize my day", exact: true })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "04-connected-after-reload");
});

test("focus choice follows Simplified Chinese UI locale", async ({ page }, testInfo) => {
  await signup(page, `onboarding-zh-${Date.now()}@example.test`, "password12", "Robin");
  await completeOnboarding(page);
  const settings = await openUserSettings(page);
  await settings.getByTestId("ui-locale-select").click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await settings.getByRole("button", { name: "关闭用户设置" }).click();
  await expect(page.getByText("我应该先帮你做什么？", { exact: true })).toBeVisible();
  for (const name of ["安排我的一天", "邮件和跟进", "研究和项目", "直接开始聊天"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "choice-card-onboarding-zh-cn");
});

test("choice refresh failures leave options available for retry", async ({ page }) => {
  await signup(page, `choice-refresh-${Date.now()}@example.test`, "password12", "Choice Retry");
  await completeOnboarding(page);
  await rpc(page, "onboarding/promptFocus", { botId: activeBotId(page) });
  const choice = page.getByRole("button", { name: /Organize my day/ });
  await expect(choice).toBeEnabled();
  await page.route("**/rpc/onboarding/choose", (route) =>
    route.fulfill({ json: { json: { ok: true } } }),
  );
  await page.route("**/rpc/spaces/list", (route) => route.abort());
  await Promise.all([page.waitForRequest("**/rpc/spaces/list"), choice.click()]);
  await expect(choice).toBeEnabled();
});
