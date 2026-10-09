import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/files-dialog.html";

test("Files stays compact and returns to the conversation on desktop and mobile", async ({
  page,
}, testInfo) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(fixture);
    const draft = page.getByRole("textbox", { name: "Conversation draft" });
    await draft.fill("Keep this thought");
    await page.getByRole("button", { name: "Files", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Files", exact: true });
    await expect(dialog).toBeVisible();
    const search = dialog.getByRole("searchbox", { name: "Search files" });
    await expect(search).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Weekly plan/ })).toBeVisible();
    const geometry = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
    expect(geometry.width).toBeLessThanOrEqual(576);
    expect(geometry.height).toBeLessThanOrEqual(520);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.overflow).toBe(false);
    await captureScreenshot(page, testInfo, `files-dialog-${width}`);
    await search.fill("Weekly");
    await expect(dialog.getByRole("link")).toHaveCount(1);
    await dialog.getByRole("link", { name: /Weekly plan/ }).click();
    await expect(dialog.getByRole("heading", { name: "This week", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Download", exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, `files-preview-${width}`);
    await dialog.getByRole("button", { name: "Back to files" }).click();
    await expect(dialog.getByRole("searchbox", { name: "Search files" })).toHaveValue("Weekly");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(draft).toHaveValue("Keep this thought");
    await expect(page.getByRole("button", { name: "Files", exact: true })).toBeFocused();
  }
});

test("filters, versions, download, and confirmed deletion remain available", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Files", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Files", exact: true });
  await dialog.getByRole("button", { name: "Filters" }).click();
  await expect(dialog.getByRole("combobox", { name: "Conversation" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Filter by date" })).toBeVisible();
  await dialog.getByRole("link", { name: /Weekly plan/ }).click();
  await dialog.getByRole("combobox", { name: "Version" }).click();
  await page.getByRole("option", { name: /^v1/ }).click();
  await expect(dialog.getByRole("heading", { name: "Earlier plan" })).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Weekly plan.md");
  await dialog.getByRole("button", { name: "Back to files" }).click();
  await dialog.getByRole("button", { name: "Delete Weekly plan.md" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("all 2 versions");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog.getByRole("link", { name: /Weekly plan/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete Weekly plan.md" }).click();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByRole("link", { name: /Weekly plan/ })).toHaveCount(0);
});

test("empty and failed listings remain dismissible", async ({ page }, testInfo) => {
  for (const state of ["empty", "error"]) {
    await page.goto(`${fixture}?${state}`);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Files", exact: true });
    await expect(dialog).toContainText(
      state === "empty" ? "No artifacts found." : "Files are unavailable",
    );
    await captureScreenshot(page, testInfo, `files-${state}`);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
});
