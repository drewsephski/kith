import { expect, test } from "@playwright/test";
import { activeBotId, captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("conversation context menu renames, archives, and confirms deletion without navigating", async ({
  page,
}, testInfo) => {
  await signup(page, `conversation-actions-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  const primary = activeBotId(page);
  const conversation = await rpc<{ id: string }>(page, "bots/create", {
    name: "Weekend plans",
    title: "",
    description: "",
    startEmpty: true,
    computerMode: "team",
  });
  await page.reload();
  const sidebar = page.getByTestId("kith-navigation");
  let row = sidebar.getByRole("button", { name: "Weekend plans", exact: true });
  await row.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Actions for Weekend plans" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
  await captureScreenshot(page, testInfo, "conversation-context-menu");
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  await row.press("Shift+F10");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename conversation" });
  await expect(rename.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
  await rename.getByRole("textbox", { name: "Name", exact: true }).fill("   ");
  await expect(rename.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await rename.getByRole("textbox", { name: "Name", exact: true }).fill("  Travel plans  ");
  await rename.getByRole("button", { name: "Save", exact: true }).click();
  row = sidebar.getByRole("button", { name: "Travel plans", exact: true });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const deletion = page.getByRole("alertdialog", { name: "Delete Travel plans?" });
  await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await rpc<Array<{ id: string }>>(page, "bots/listArchived")).toContainEqual(
    expect.objectContaining({ id: conversation.id }),
  );
  await rpc(page, "bots/restore", { botId: conversation.id });
  await page.reload();
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
});

test("hover archive is independent of navigation and group conversations share the menu", async ({
  page,
}, testInfo) => {
  await signup(page, `conversation-hover-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  const primary = activeBotId(page);
  const bot = await rpc<{ id: string }>(page, "bots/create", {
    name: "Research",
    title: "",
    description: "",
    startEmpty: true,
    computerMode: "team",
  });
  await page.reload();
  const sidebar = page.getByTestId("kith-navigation");
  const row = sidebar.getByRole("button", { name: "Research", exact: true });
  const archive = sidebar.getByRole("button", { name: "Archive Research", exact: true });
  await page.mouse.move(700, 100);
  await expect(archive).toHaveCSS("opacity", "0");
  await row.hover();
  await expect(archive).toHaveCSS("opacity", "1");
  await captureScreenshot(page, testInfo, "conversation-hover-archive");
  await archive.click();
  await expect(row).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
  expect(await rpc<Array<{ id: string }>>(page, "bots/listArchived")).toContainEqual(
    expect.objectContaining({ id: bot.id }),
  );
  await rpc(page, "bots/restore", { botId: bot.id });
  const group = await rpc<{ id: string }>(page, "groups/create", {
    name: "Planning",
    botIds: [primary, bot.id],
  });
  await page.reload();
  const groupRow = sidebar.getByRole("button", { name: "Planning", exact: true });
  await groupRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename conversation" });
  await rename.getByRole("textbox", { name: "Name", exact: true }).fill("Shared plans");
  await rename.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Shared plans", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const renamed = sidebar.getByRole("button", { name: "Shared plans", exact: true });
  await renamed.focus();
  await expect(sidebar.getByRole("button", { name: "Archive Shared plans" })).toHaveCSS(
    "opacity",
    "1",
  );
  await renamed.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Actions for Shared plans" })).toBeVisible();
  await captureScreenshot(page, testInfo, "conversation-context-menu-mobile");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.keyboard.press("Escape");
  await renamed.click();
  await expect(page).toHaveURL(new RegExp(`/app/g/${group.id}$`));
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await sidebar.getByRole("button", { name: "Archive Shared plans", exact: true }).click();
  await expect(renamed).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
  expect(await rpc<Array<{ id: string }>>(page, "groups/listArchived")).toContainEqual(
    expect.objectContaining({ id: group.id }),
  );
});
