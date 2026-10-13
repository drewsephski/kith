import { expect, test } from "@playwright/test";
import {
  captureScreenshot,
  completeOnboarding,
  createBotFromPicker,
  openAdvancedNavigation,
  openNewBot,
  rpc,
  signup,
} from "./helpers";

async function setup(page: Parameters<typeof signup>[0], label: string) {
  await signup(page, `${label}-${Date.now()}@rakazo.test`, "password12", "Bot onboarding");
  await completeOnboarding(page);
}

test("New Bot opens a durable conversation with identity before focus", async ({
  page,
}, testInfo) => {
  await setup(page, "identity-first");
  const originalPath = new URL(page.url()).pathname;
  await openNewBot(page);
  const card = page.getByTestId("bot-identity-card");
  await expect(card).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`${originalPath}$`));
  await expect(page.getByTestId("create-bot-form")).toHaveCount(0);
  await expect(
    page.getByText("What should my name be, and what's my role?", { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText("What should I help you with first?", { exact: true })).toHaveCount(
    0,
  );
  for (const [id, name, role] of [
    ["miso", "Miso", "Inbox assistant"],
    ["pippin", "Pippin", "Research assistant"],
    ["orbit", "Orbit", "Planning assistant"],
    ["pixel", "Pixel", "Coding partner"],
  ]) {
    await expect(card.getByTestId(`bot-identity-${id}`)).toContainText(name);
    await expect(card.getByTestId(`bot-identity-${id}`)).toContainText(role);
  }
  await captureScreenshot(page, testInfo, "conversational-bot-identity");
  const botPath = new URL(page.url()).pathname;
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByTestId("bot-identity-pippin").click();
  await expect(page.getByPlaceholder("Message Pippin")).toBeVisible();
  await expect(
    page.getByText("What should my name be, and what's my role?", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("What should I help you with first?", { exact: true })).toHaveCount(
    1,
  );
  await captureScreenshot(page, testInfo, "conversational-bot-focus");
  const bots = await rpc<Array<{ id: string; name: string; title: string; description: string }>>(
    page,
    "bots/list",
    {},
  );
  const bot = bots.find((entry) => botPath.endsWith(entry.id))!;
  expect(bot).toMatchObject({ name: "Pippin", title: "Research assistant" });
  expect(bot.description).toBeTruthy();
  expect(bots.find((entry) => originalPath.endsWith(entry.id))?.name).toBe("Kith");
  await page.getByRole("button", { name: /Just start chatting/ }).click();
  await page.reload();
  await expect(page.getByPlaceholder("Message Pippin")).toBeVisible();
  await expect(page.getByText("What should I help you with first?", { exact: true })).toHaveCount(
    1,
  );
});

test("custom identity survives a lost response and remains consistent after reload", async ({
  page,
}, testInfo) => {
  await setup(page, "identity-custom");
  await openNewBot(page);
  const card = page.getByTestId("bot-identity-card");
  await card.getByRole("button", { name: "Custom", exact: true }).click();
  const name = card.getByRole("textbox", { name: "Name", exact: true });
  const role = card.getByRole("textbox", { name: "Role", exact: true });
  await expect(name).toBeFocused();
  await name.fill("Atlas");
  await role.fill("Research lead");
  await page.route("**/rpc/onboarding/identity", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByPlaceholder("Message Atlas")).toBeVisible();
  // SSE has durably answered the card before the intentionally lost HTTP reply settles.
  await expect(card).toHaveAttribute("aria-busy", "false");
  await expect(card).toContainText("Research lead");
  await expect(card.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("What should I help you with first?", { exact: true })).toHaveCount(
    1,
  );
  await page.unroute("**/rpc/onboarding/identity");
  await page.reload();
  await expect(page.getByPlaceholder("Message Atlas")).toBeVisible();
  await expect(card).toContainText("Research lead");
  await expect(page.getByText("What should I help you with first?", { exact: true })).toHaveCount(
    1,
  );
  await captureScreenshot(page, testInfo, "conversational-bot-custom-persisted");
});

test("lost create response retries one durable bot and rapid taps do not create another", async ({
  page,
}) => {
  await setup(page, "create-retry");
  const before = await rpc<Array<{ id: string }>>(page, "bots/list", {});
  await page.route("**/rpc/onboarding/create", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await openNewBot(page);
  await expect(page.getByTestId("create-bot-error")).toBeVisible();
  await page.unroute("**/rpc/onboarding/create");
  const retry = page
    .getByTestId("create-bot-recovery")
    .getByRole("button", { name: "Try again", exact: true });
  await retry.dblclick();
  await expect(page.getByTestId("bot-identity-card")).toBeVisible();
  const after = await rpc<Array<{ id: string }>>(page, "bots/list", {});
  expect(after.length).toBe(before.length + 1);
  await expect(
    page.getByText("What should my name be, and what's my role?", { exact: true }),
  ).toHaveCount(1);
});

test("first ordinary message before identity is retained and does not force focus", async ({
  page,
}) => {
  await setup(page, "free-chat");
  await openNewBot(page);
  await expect(page.getByTestId("bot-identity-card")).toBeVisible();
  const composer = page.getByRole("combobox", { name: /^Message/ });
  await composer.fill("Please help me research my project");
  await composer.press("Enter");
  await expect(
    page
      .getByTestId("transcript")
      .getByTestId("message-user-bubble")
      .getByText("Please help me research my project", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("transcript")
      .getByTestId("message-user-bubble")
      .getByText("Please help me research my project", { exact: true }),
  ).toBeVisible();
  await page.getByTestId("bot-identity-pixel").click();
  await expect(page.getByPlaceholder("Message Pixel")).toBeVisible();
  await expect(page.getByText("What should I help you with first?", { exact: true })).toHaveCount(
    0,
  );
});

test("advanced bot editing still supports Private computer mode", async ({ page }, testInfo) => {
  await setup(page, "advanced-mode");
  await createBotFromPicker(page, { computerMode: "dedicated" });
  await expect(page.getByPlaceholder("Message New Bot")).toBeVisible();
  const botId = page.url().split("/").pop()!;
  const bots = await rpc<Array<{ id: string; computerMode: string }>>(page, "bots/list", {});
  expect(bots.find((bot) => bot.id === botId)?.computerMode).toBe("dedicated");
  await captureScreenshot(page, testInfo, "conversational-bot-advanced-computer");
});

test("picker rows explain groups and spaces", async ({ page }, testInfo) => {
  const stamp = Date.now();
  await signup(page, `picker-info-${stamp}@rakazo.test`, "password12", "Picker Info");
  await completeOnboarding(page);
  await openAdvancedNavigation(page);
  await page.goto("/app");
  await page.waitForURL(/\/app\/[^/]+$/);
  await openAdvancedNavigation(page);

  await page.getByTestId("create-menu-trigger").click();
  const picker = page.getByTestId("bot-create-picker");
  await expect(picker).toBeVisible();

  await picker.getByTestId("create-new-group").hover();
  const groupInfo = picker.getByTestId("picker-info-group");
  await expect.poll(() => groupInfo.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await captureScreenshot(page, testInfo, "picker-group-info-hover");
  await groupInfo.click();
  const dialog = page.getByTestId("picker-info-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Groups", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("same thread");
  await expect(page.getByTestId("side-panel")).not.toHaveAttribute("data-panel", "create-group");
  await captureScreenshot(page, testInfo, "picker-group-info-dialog");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  await page.getByTestId("create-menu-trigger").click();
  const spaceInfo = picker.getByTestId("picker-info-space");
  await expect.poll(() => spaceInfo.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await picker.getByTestId("create-new-space").hover();
  await expect.poll(() => spaceInfo.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await spaceInfo.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Spaces", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("own bots and groups");
  await captureScreenshot(page, testInfo, "picker-space-info-dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

// Preserve the existing sidebar preference and drag-recovery acceptance.
test("sidebar collapse and drag recovery remain available after conversational creation", async ({
  page,
}, testInfo) => {
  await setup(page, "sidebar-preference");
  await createBotFromPicker(page);
  await openAdvancedNavigation(page);
  await page.getByTestId("minimize-bots-sidebar").click();
  await expect(page.getByTestId("bots-sidebar")).toHaveAttribute("data-collapsed", "true");
  const edge = page.getByTestId("bots-sidebar-edge");
  await expect(edge).toBeVisible();
  const restore = page.getByTestId("restore-bots-sidebar");
  await expect(restore).toBeVisible();
  await captureScreenshot(page, testInfo, "bots-sidebar-collapsed");

  await restore.click();
  await expect(page.getByTestId("bots-sidebar")).toHaveAttribute("data-collapsed", "false");
  await expect(restore).toHaveCount(0);
  await page.getByTestId("bots-sidebar").evaluate(async (sidebar) => {
    await Promise.all(
      sidebar.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });

  await page.getByTestId("minimize-bots-sidebar").click();
  await expect(page.getByTestId("bots-sidebar")).toHaveAttribute("data-collapsed", "true");

  const box = await edge.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 80, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("bots-sidebar")).toHaveAttribute("data-collapsed", "false");
  await captureScreenshot(page, testInfo, "bots-sidebar-expanded");
});
