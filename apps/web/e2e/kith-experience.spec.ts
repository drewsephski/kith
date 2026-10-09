import { expect, test } from "@playwright/test";
import { activeBotId, captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("new conversations offer editable task starters and align navigation with the header", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signup(page, `kith-starters-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  const primary = activeBotId(page);
  const navigation = page.getByTestId("kith-navigation");
  const composer = page.locator('textarea[name="chat-message"]');
  const welcome = page.getByTestId("assistant-welcome");
  await expect(welcome).toBeVisible();
  await navigation.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`/app/${primary}$`));
  const conversation = activeBotId(page);
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole("button")).toHaveCount(6);
  await expect(composer).toHaveValue("");
  const sidebarTop = await navigation.evaluate((element) => element.getBoundingClientRect().top);
  const shellTop = await page
    .getByTestId("shell-root")
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(sidebarTop).toBe(shellTop);
  const collapse = await navigation.getByRole("button", { name: "Collapse sidebar" }).boundingBox();
  expect(collapse!.y + collapse!.height / 2 - shellTop).toBe(32);
  await captureScreenshot(page, testInfo, "kith-new-conversation-desktop");

  await welcome.getByRole("button", { name: "Search all my Gmail accounts", exact: true }).click();
  await expect(composer).toHaveValue("Search all my connected Gmail accounts for…");
  await expect(composer).toBeFocused();
  await expect(page.getByRole("button", { name: "Remove task starter" })).toBeVisible();
  await composer.press("Enter");
  const setup = page.getByRole("dialog");
  await expect(setup.getByRole("heading", { name: "Choose task sources" })).toBeVisible();
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await navigation.getByTestId("main-conversation").click();
  await expect(composer).toHaveValue("");
  await navigation
    .getByRole("region", { name: "Recent conversations" })
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/${conversation}$`));
  await expect(composer).toHaveValue("Search all my connected Gmail accounts for…");
  await expect(page.getByRole("button", { name: "Remove task starter" })).toBeVisible();
  await welcome.getByRole("button", { name: "Plan tomorrow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove task starter" })).toHaveCount(0);
  await composer.press("Enter");
  await expect(welcome).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await navigation.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(welcome).toBeVisible();
  await expect(composer).toHaveValue("");
  await welcome.getByRole("button", { name: "Turn my inbox into a to-do list" }).click();
  await expect(composer).toHaveValue(
    "Turn emails from the past seven days into a prioritized to-do list, with links to each source.",
  );
  await expect(composer).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "kith-new-conversation-mobile");
});

test("Kith preserves its main conversation, drafts, and inspectable personal memory", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signup(page, `kith-experience-${Date.now()}@example.test`, "password12", "Alex");
  await completeOnboarding(page);
  const primary = activeBotId(page);
  const composer = page.locator('textarea[name="chat-message"]');
  await expect(page.getByTestId("assistant-welcome")).toBeVisible();
  await expect(composer).toHaveAttribute("placeholder", "Message Kith");
  const mainAvatar = page.getByTestId("main-conversation").locator("img");
  await expect(mainAvatar).toBeVisible();
  await expect
    .poll(() => mainAvatar.evaluate((image) => image.complete && image.naturalWidth > 0))
    .toBe(true);
  await expect(page.getByTestId("assistant-welcome").locator("img")).toHaveAttribute(
    "src",
    (await mainAvatar.getAttribute("src"))!,
  );
  await captureScreenshot(page, testInfo, "kith-desktop");

  await page.getByRole("button", { name: "Plan tomorrow", exact: true }).click();
  await expect(composer).toHaveValue("What's on my schedule tomorrow?");
  await expect(composer).toBeFocused();
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`/app/${primary}$`));
  const thread = activeBotId(page);
  await expect(composer).toHaveValue("");
  await composer.fill("Review the outline");
  await page.getByTestId("main-conversation").click();
  await expect(composer).toHaveValue("What's on my schedule tomorrow?");
  await page
    .getByRole("region", { name: "Recent conversations", exact: true })
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/${thread}$`));
  await expect(composer).toHaveValue("Review the outline");
  await page.getByTestId("main-conversation").click();
  await composer.fill("Remember that I prefer morning meetings.");
  await composer.press("Enter");
  await expect(
    page.getByText("noted — i will keep that in memory.", { exact: true }),
  ).toBeVisible();

  const navigation = page.getByTestId("kith-navigation");
  await navigation.getByRole("button", { name: "Memory", exact: true }).click();
  const memory = page.getByTestId("personal-memory");
  const entry = memory.getByRole("button", { name: /Personal memory.*morning meetings/ });
  await expect(entry).toBeVisible();
  await entry.click();
  await memory
    .getByRole("textbox", { name: "Edit Personal memory" })
    .fill("# Preferences\n\nI prefer meetings before noon.");
  await memory.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    memory.getByText("Preferences I prefer meetings before noon.", { exact: true }),
  ).toBeVisible();
  const documents = await rpc<Array<{ id: string; content: string; revision: number }>>(
    page,
    "memory/list",
    { botId: primary, scope: "bot" },
  );
  expect(
    documents.some((document) => document.content.includes("before noon") && document.revision > 1),
  ).toBe(true);
  await captureScreenshot(page, testInfo, "kith-memory");
  await memory.getByRole("button", { name: /Personal memory.*before noon/ }).click();
  await memory.getByRole("button", { name: "Delete Personal memory", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await rpc<Array<{ id: string }>>(page, "memory/list", { botId: primary, scope: "bot" }))
      .length,
  ).toBeGreaterThan(0);
  await memory.getByRole("button", { name: "Delete Personal memory", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    memory.getByText("Nothing remembered yet. Tell Kith what you’d like it to remember.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await rpc(page, "memory/list", { botId: primary, scope: "bot" })).toEqual([]);
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("side-panel")).toHaveAttribute("data-panel", "closed");

  await navigation.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    page.getByTestId("side-panel").getByRole("button", { name: "Kith, Completed", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, testInfo, "kith-task");
  await page.keyboard.press("Escape");
  await page.goto("/app");
  await expect(page).toHaveURL(new RegExp(`/app/${primary}$`));
  await expect(composer).toHaveValue("");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await captureScreenshot(page, testInfo, "kith-dark");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(composer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await captureScreenshot(page, testInfo, "kith-mobile");
});
