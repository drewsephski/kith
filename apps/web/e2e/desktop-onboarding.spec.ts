import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./helpers";

// Exercise the shipped setup renderer without opening real Electron windows.
async function openSetup(page: Page) {
  const desktop = path.resolve(import.meta.dirname, "../../desktop/src");
  await page.route("**/__desktop-setup/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1) || "setup.html";
    const file =
      name === "tokens.css"
        ? path.resolve(import.meta.dirname, "../../../packages/ui-tokens/src/tokens.css")
        : name === "kith-companion.webp"
          ? path.resolve(
              import.meta.dirname,
              "../../../packages/ui-tokens/assets/kith-companion.webp",
            )
          : path.join(desktop, name);
    await route.fulfill({
      body: await readFile(file),
      contentType: name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".webp")
          ? "image/webp"
          : name.endsWith(".js")
            ? "text/javascript"
            : "text/html",
    });
  });
  await page.addInitScript(() => {
    let stack = {
      phase: "idle",
      message: null as string | null,
      output: [] as string[],
      layerBytes: {} as Record<string, number>,
    };
    let listener = () => {};
    const saves: unknown[] = [];
    window.addEventListener("test-stack", (event) => {
      stack = { ...stack, ...(event as CustomEvent).detail };
      listener();
    });
    Object.assign(window, {
      testSaves: saves,
      rakazoSetup: {
        platform: "browser",
        state: async () => ({ saved: null, defaultLocalUrl: "http://127.0.0.1:3100", error: null }),
        test: async (url: string) => ({ ok: true, url }),
        save: async (setup: unknown) => {
          saves.push(setup);
          return { ok: true };
        },
        quit: async () => {},
        openLink: async () => {},
        stack: {
          state: async () => stack,
          start: async () => {
            if (stack.phase === "ready") return stack;
            stack = {
              phase: "pulling",
              message: null,
              output: ["Downloading layer"],
              layerBytes: { layer: 412_000_000 },
            };
            return stack;
          },
          onChange: (next: () => void) => {
            listener = next;
          },
        },
      },
    });
  });
  await page.goto("/__desktop-setup/setup.html");
  await expect(page.getByRole("button", { name: "Get started" })).toBeFocused();
}

function saves(page: Page) {
  return page.evaluate(() => Reflect.get(window, "testSaves"));
}

test("desktop setup offers one action and reveals remote setup on demand", async ({
  page,
}, testInfo) => {
  await openSetup(page);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByLabel("Server address")).toBeHidden();
  await captureScreenshot(page, testInfo, "desktop-welcome");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await captureScreenshot(page, testInfo, "desktop-welcome-narrow");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Connect to a server" }).click();
  await expect(page.getByLabel("Server address")).toBeFocused();
  await page.getByLabel("Server address").fill("https://rakazo.example.test");
  await captureScreenshot(page, testInfo, "desktop-remote-setup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect
    .poll(() => saves(page))
    .toEqual([{ mode: "existing", serverUrl: "https://rakazo.example.test" }]);
});

test("desktop setup reports real download bytes and opens the ready local instance", async ({
  page,
}, testInfo) => {
  await openSetup(page);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("button", { name: "Setting up…" })).toBeDisabled();
  await expect(page.getByRole("progressbar")).toBeVisible();
  const progress = page.getByRole("progressbar");
  const initialProgress = Number(await progress.getAttribute("aria-valuenow"));
  expect(initialProgress).toBeGreaterThan(20);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-stack", { detail: { layerBytes: { layer: 824_000_000 } } }),
    ),
  );
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeGreaterThan(initialProgress);
  await expect(page.getByText("824 MB downloaded")).toBeVisible();
  await expect(page.locator("#stack-output")).toBeHidden();
  await captureScreenshot(page, testInfo, "desktop-download");
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("test-stack", { detail: { phase: "ready" } })),
  );
  await expect
    .poll(() => saves(page))
    .toEqual([{ mode: "new", serverUrl: "http://127.0.0.1:3100" }]);
});

test("leaving local setup prevents a late ready event from saving over the choice", async ({
  page,
}) => {
  await openSetup(page);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByText("412 MB downloaded")).toBeVisible();
  await page.getByRole("button", { name: "Connect to a server" }).click();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("test-stack", { detail: { phase: "ready" } })),
  );
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  expect(await saves(page)).toEqual([]);
  await page.getByRole("button", { name: "Use this computer" }).click();
  await expect
    .poll(() => saves(page))
    .toEqual([{ mode: "new", serverUrl: "http://127.0.0.1:3100" }]);
});

test("a local setup failure offers recovery with details only when needed", async ({
  page,
}, testInfo) => {
  await openSetup(page);
  await page.getByRole("button", { name: "Get started" }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-stack", {
        detail: {
          phase: "failed",
          message: "Could not download Kith.",
          output: ["Download interrupted"],
        },
      }),
    ),
  );
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
  await expect(page.locator("#stack-output")).toHaveText("Download interrupted");
  await expect(page.getByRole("progressbar")).toBeHidden();
  expect(await saves(page)).toEqual([]);
  await captureScreenshot(page, testInfo, "desktop-setup-retry");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("412 MB downloaded")).toBeVisible();
});
