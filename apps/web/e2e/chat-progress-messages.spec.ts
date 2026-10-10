import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
test("run status stays visible after prose and follows actual activity and terminal state", async ({
  page,
}, testInfo) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const stream of ["on", "off"]) {
      await page.goto(`/e2e/fixtures/chat-progress-messages.html?stream=${stream}`);
      await expect(page.getByTestId("response")).toContainText("I'll check the conversations");
      const status = page.getByTestId("run-status");
      await expect(status).toContainText("Thinking…");
      for (const [stage, label] of [
        ["gmail", "Checking Gmail"],
        ["drafts", "Preparing drafts"],
        ["waiting", "Waiting for your input"],
        ["complete", "Done"],
        ["cancelled", "Stopped"],
      ]) {
        await page.getByRole("button", { name: stage, exact: true }).click();
        await expect(status).toContainText(label!);
        await expect(status).not.toContainText(
          stage === "drafts" ? "Checking Gmail" : "Preparing drafts",
        );
        await expect(status.getByTestId("active-bot-glyph")).toHaveCount(
          ["gmail", "drafts"].includes(stage!) ? 1 : 0,
        );
        await captureScreenshot(page, testInfo, `${stage}-stream-${stream}-${viewport.name}`);
      }
      await expect(page.getByTestId("tool-activity")).toHaveCount(0);
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", viewport.width);
    }
  }
});
