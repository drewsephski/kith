import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

test("email content and sending stay in chat and fit mobile without horizontal scrolling", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/e2e/fixtures/email-cards.html");
    await expect(page.getByTestId("email-card")).toHaveCount(2);
    expect((await page.getByTestId("email-card").first().boundingBox())!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(
      await page
        .getByLabel("Email body")
        .first()
        .evaluate((node) => getComputedStyle(node).fontSize),
    ).toBe("12px");
    await expect(page.getByTestId("email-card").first()).toContainText("private@example.test");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Requested", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Email sent");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    const previews = page.getByTestId("email-preview");
    await expect(previews).toHaveCount(2);
    for (const preview of await previews.all()) {
      const box = (await preview.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    await captureScreenshot(page, testInfo, `email-send-${viewport.width}`);
    await expect(page.getByRole("button", { name: "Reply", exact: true })).toBeVisible();
  }
});

test("inline mail edits retain typography, expose all content, and send without a second approval", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/e2e/fixtures/email-cards.html");
    const body = page.getByLabel("Email body").first();
    const before = await body.evaluate((node) => getComputedStyle(node).fontSize);
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await page.getByLabel("Email subject").fill("My revised subject");
    const content =
      "My revised response\n\n" +
      "A full email paragraph with a long reference. ".repeat(100) +
      "\nLast line.";
    await body.fill(content);
    await expect(body).toHaveValue(content);
    expect(await body.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
    expect(await body.evaluate((node) => getComputedStyle(node).borderWidth)).toBe("0px");
    expect(await body.evaluate((node) => getComputedStyle(node).fontSize)).toBe(before);
    expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight + 1)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await captureScreenshot(page, testInfo, `inline-email-${viewport.width}`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByTestId("email-preview").first()).toContainText("My revised subject");
    await expect(page.getByLabel("Email body").first()).toHaveValue(content);
  }
});
test("Send submits inline edits immediately with no save or repeated approval", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/email-cards.html");
  await page.getByLabel("Email body").first().fill("Updated response");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Email sent");
  await expect(page.getByTestId("email-send-payload")).toHaveText(
    JSON.stringify({
      messageId: "mail-preview",
      blockIndex: 0,
      edits: { subject: "Re: Project timeline", body: "Updated response" },
    }),
  );
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
});
