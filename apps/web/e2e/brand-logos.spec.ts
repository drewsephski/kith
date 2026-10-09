import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

// These fixtures deliberately omit provider artwork; the app supplies local SVGL assets.
const apps = [
  ["gmail", "Gmail"],
  ["googlecalendar", "Google Calendar"],
  ["googledrive", "Google Drive"],
  ["slack", "Slack"],
  ["notion", "Notion"],
  ["github", "GitHub"],
];

test("connections use offline SVGL artwork in both themes and at narrow widths", async ({
  page,
}, testInfo) => {
  await page.route("https://svgl.app/**", (route) => route.abort());
  await page.route("https://api.svgl.app/**", (route) => route.abort());
  await page.route("**/rpc/connections/catalog", (route) =>
    route.fulfill({
      json: {
        json: apps.map(([slug, name]) => ({
          connectorId: "fake",
          slug,
          name,
          connected: false,
          noAuth: false,
          logo: null,
        })),
      },
    }),
  );
  await signup(page, `brand-logos-${Date.now()}@rakazo.test`, "password12", "Logo Test");
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "More connections", exact: true }).click();
  const featured = page.getByTestId("featured-connectors");
  await expect(featured).toBeVisible();
  for (const [slug] of apps.slice(0, 5)) {
    const image = featured.locator(`[data-brand="${slug}"] img`).first();
    await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true);
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((next) => {
      document.documentElement.dataset.theme = next;
    }, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    await captureScreenshot(page, testInfo, `connections-svgl-${theme}`);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("dialog")).toBeVisible();
    const calendarName = featured.getByText("Google Calendar", { exact: true });
    expect(await calendarName.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const dialog = page.getByRole("dialog");
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await captureScreenshot(page, testInfo, `connections-svgl-${theme}-narrow`);
  }
});
