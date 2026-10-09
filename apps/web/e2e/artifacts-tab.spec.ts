import { expect, test } from "@playwright/test";
import { activeBotId, captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("Files opens over the conversation and keeps existing file links working", async ({
  page,
}, testInfo) => {
  await signup(page, `files-dialog-${Date.now()}@rakazo.test`, "password12", "Example");
  await completeOnboarding(page);
  await page.goto("/app");
  await page.waitForURL(/\/app\/(?!artifacts(?:\/|$))[^/]+$/);
  const botId = activeBotId(page);
  const conversationUrl = page.url();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Files", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox", { name: "Search files" })).toBeVisible();
  await expect(dialog).toContainText("No artifacts found.");
  await captureScreenshot(page, testInfo, "files-empty");
  await rpc(page, "artifacts/create", {
    botId,
    name: "notes/weekly-plan.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from("# Weekly plan").toString("base64"),
  });
  await page.reload();
  await expect(dialog.getByRole("link", { name: /notes\/weekly-plan\.md/ })).toBeVisible();
  await captureScreenshot(page, testInfo, "files-library");
  await dialog.getByRole("link", { name: /notes\/weekly-plan\.md/ }).click();
  const fileUrl = page.url();
  await expect(dialog.getByRole("heading", { name: "Weekly plan", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "files-preview");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByTestId("transcript")).toBeVisible();

  // Cold historic deep links retain the preview instead of being canonicalized to a bot route.
  await page.goto(fileUrl);
  await expect(dialog.getByRole("heading", { name: "Weekly plan", exact: true })).toBeVisible();
  await page.reload();
  await expect(dialog.getByRole("heading", { name: "Weekly plan", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Back to files" }).click();
  await expect(dialog.getByRole("searchbox", { name: "Search files" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await captureScreenshot(page, testInfo, "files-library-mobile");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("transcript")).toBeVisible();
});
