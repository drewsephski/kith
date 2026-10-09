import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { darkTokens, lightTokens, UI_APPEARANCE_STORAGE_KEY } from "@rakazo/ui-tokens";
import { captureScreenshot } from "./helpers";

const fixture = "/e2e/fixtures/ui-appearance.html";

async function mockThemeDependencies(context: BrowserContext) {
  await context.route("**/rpc/computer/commands", (route) =>
    route.fulfill({
      json: {
        json: [
          {
            executionId: "fixture-command",
            kind: "shell",
            command: "echo ready",
            status: "done",
            exitCode: 0,
            output: "ready\n",
          },
        ],
      },
    }),
  );
  await context.route("**/api/account/security", (route) =>
    route.fulfill({ json: { hasPassword: false } }),
  );
  await context.route("**/rpc/approvalRules/list", (route) =>
    route.fulfill({ json: { json: [] } }),
  );
  await context.route("**/rpc/autoReview/get", (route) =>
    route.fulfill({ json: { json: { enabled: false } } }),
  );
}

async function expectTheme(page: Page, theme: "light" | "dark") {
  const tokens = theme === "light" ? lightTokens : darkTokens;
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName(
    theme === "light" ? "Switch to dark mode" : "Switch to light mode",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    tokens.background,
  );
  expect(await page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme)).toBe(
    theme,
  );
}

test.beforeEach(async ({ context }) => {
  await mockThemeDependencies(context);
});

test("header toggle persists across reloads and recolors mounted components", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(fixture);
  await expectTheme(page, "dark");
  await expect(page.locator(".xterm-screen canvas").first()).toBeVisible();
  await expect(page.getByTestId("computer-terminal")).toContainText("ready");
  const terminal = await page.locator(".xterm").elementHandle();
  const darkBackground = await page
    .getByTestId("theme-card")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByTestId("theme-toggle").click();
  await expectTheme(page, "light");
  expect(await page.evaluate((key) => localStorage.getItem(key), UI_APPEARANCE_STORAGE_KEY)).toBe(
    "light",
  );
  await expect
    .poll(() =>
      page.getByTestId("theme-card").evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .not.toBe(darkBackground);
  await expect
    .poll(() =>
      page.locator(".xterm-viewport").evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgb(250, 250, 251)");
  expect(await terminal?.evaluate((el) => el.isConnected)).toBe(true);
  await captureScreenshot(page, testInfo, "theme-toggle-light-components");
  await page.reload();
  await expectTheme(page, "light");
  await page.getByTestId("theme-toggle").click();
  await expectTheme(page, "dark");
  await captureScreenshot(page, testInfo, "theme-toggle-dark-components");
});

test("settings stays synchronized and System follows the OS until explicitly toggled", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(fixture);
  await expectTheme(page, "light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("ui-appearance-system")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("theme-toggle").click();
  await expect(page.getByTestId("ui-appearance-dark")).toHaveAttribute("aria-pressed", "true");
  await expectTheme(page, "dark");
  await captureScreenshot(page, testInfo, "theme-toggle-dark-settings");
  await page.getByTestId("ui-appearance-system").click();
  await expectTheme(page, "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme(page, "dark");
  await page.getByTestId("ui-appearance-light").click();
  await expectTheme(page, "light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme(page, "light");
  await captureScreenshot(page, testInfo, "theme-toggle-light-settings");
});

test("theme preference synchronizes between tabs", async ({ page, context }) => {
  await page.goto(fixture);
  const other = await context.newPage();
  await other.goto(fixture);
  await expect(other.getByTestId("theme-toggle")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByTestId("ui-appearance-light").click();
  await expectTheme(other, "light");
  await other.getByTestId("theme-toggle").click();
  await expectTheme(page, "dark");
  await expect(page.getByTestId("ui-appearance-dark")).toHaveAttribute("aria-pressed", "true");
});

test("mobile header toggle is reachable by keyboard and does not overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(fixture);
  const toggle = page.getByTestId("theme-toggle");
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await toggle.press("Enter");
  await expectTheme(page, "light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await captureScreenshot(page, testInfo, "theme-toggle-mobile-light");
  await toggle.press("Space");
  await expectTheme(page, "dark");
  await captureScreenshot(page, testInfo, "theme-toggle-mobile-dark");
});
