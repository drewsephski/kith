import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";

async function visibleWindow(app: ElectronApplication, matches: (page: Page) => Promise<boolean>) {
  // Read crash/visibility state in the main process before touching renderer targets.
  const visibleUrls = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((win) => !win.isDestroyed() && win.isVisible() && !win.webContents.isCrashed())
      .map((win) => win.webContents.getURL()),
  );
  for (const page of app.windows()) {
    if (page.isClosed() || !visibleUrls.includes(page.url())) continue;
    try {
      const visible = await (await app.browserWindow(page)).evaluate((win) => win.isVisible());
      if (visible && (await matches(page))) return page;
    } catch {
      // A crashed or closing window cannot be the user's recovery surface.
    }
  }
  return undefined;
}

// The harness provides the real API, migrated disposable PostgreSQL, scripted
// model and shared frontend. No production accounts or external providers.
test("packaged Kith authenticates, persists work and consumes native commands", async () => {
  const executable = process.env.RAKAZO_E2E_EXECUTABLE;
  const origin = process.env.PLAYWRIGHT_BASE_URL;
  if (!executable || !origin) throw new Error("Run through the packaged frontend harness");
  const profile = await mkdtemp(path.join(tmpdir(), "kith-frontend-"));
  await writeFile(
    path.join(profile, "setup.json"),
    JSON.stringify({ mode: "existing", serverUrl: origin }),
  );
  const launch = () =>
    electron.launch({
      executablePath: path.resolve(executable),
      env: {
        ...process.env,
        RAKAZO_PERFORMANCE_USER_DATA: profile,
        RAKAZO_DISABLE_AUTO_UPDATE: "1",
      },
    });
  let app: ElectronApplication | undefined;
  try {
    app = await launch();
    const page = await app.firstWindow();
    await waitForShownWindow(app, page);
    // Electron starts its own initial navigation after creating the window.
    // Wait for the shared auth screen before initiating a second navigation.
    await expect(page.getByRole("heading", { name: "Kith", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.getByPlaceholder("Your name").fill("Packaged acceptance");
    await page.getByPlaceholder("Your email address").fill(`packaged-${Date.now()}@example.test`);
    await page.getByPlaceholder("Password").fill("fixture-password-12");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Message Kith", exact: true })).toBeVisible();
    const route = page.url();
    const prompt = "Packaged acceptance harmless prompt";
    await page.getByRole("combobox", { name: "Message Kith", exact: true }).fill(prompt);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page
        .getByTestId("transcript")
        .getByTestId("message-user-bubble")
        .getByText(prompt, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("transcript").getByText(`done. i handled: ${prompt}`, { exact: true }),
    ).toBeVisible();
    const id = await (await app.browserWindow(page)).evaluate((win) => win.id);
    await app.evaluate(
      async ({ BrowserWindow }, windowId) =>
        BrowserWindow.fromId(windowId)!.webContents.session.cookies.flushStore(),
      id,
    );
    await test.step("Close the authenticated process", () => app!.close(), { timeout: 20_000 });
    app = await test.step("Relaunch the saved session", launch, { timeout: 20_000 });
    const restored = await app.firstWindow();
    await waitForShownWindow(app, restored);
    await expect(restored.getByRole("combobox", { name: /^Message/ })).toBeVisible();
    await restored.goto(route);
    await expect(
      restored.getByTestId("transcript").getByText(`done. i handled: ${prompt}`, { exact: true }),
    ).toBeVisible();
    await app.evaluate(({ Menu }) => {
      const settings = Menu.getApplicationMenu()!
        .items.flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.accelerator === "CmdOrCtrl+,");
      if (!settings) throw new Error("Missing native Settings command");
      settings.click();
    });
    await expect(restored.getByTestId("user-settings")).toBeVisible();
    await restored.keyboard.press("Escape");
    await expect(restored.getByTestId("user-settings")).toBeHidden();
    await app.evaluate(({ Menu }) => {
      const command = Menu.getApplicationMenu()!
        .items.flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.label === "New Conversation");
      if (!command) throw new Error("Missing New Conversation command");
      command.click();
    });
    await expect(restored.getByTestId("transcript").getByText(prompt, { exact: true })).toHaveCount(
      0,
    );
    await expect(restored).not.toHaveURL(route);
    const newComposer = restored.getByRole("combobox", {
      name: "Message New conversation",
      exact: true,
    });
    await expect(newComposer).toBeEditable();
    const newRoute = restored.url();
    const restoredId = await (await app.browserWindow(restored)).evaluate((win) => win.id);
    await app.evaluate(({ BrowserWindow }, windowId) => {
      // Return the control request before crashing its renderer/debug target.
      setTimeout(() => BrowserWindow.fromId(windowId)!.webContents.forcefullyCrashRenderer(), 100);
    }, restoredId);
    let setup: Page | undefined;
    await expect
      .poll(async () => {
        setup = await visibleWindow(app!, (page) =>
          page.getByText("Kith stopped responding.", { exact: false }).isVisible(),
        );
        return Boolean(setup);
      })
      .toBe(true);
    if (!setup) throw new Error("Missing visible renderer recovery window");
    await expect(setup.getByText("Kith stopped responding.", { exact: false })).toBeVisible();
    await setup.getByRole("button", { name: "Continue", exact: true }).click();
    let recoveredWindow: Page | undefined;
    await expect
      .poll(async () => {
        recoveredWindow = await visibleWindow(app!, (page) =>
          page.getByRole("combobox", { name: /^Message/ }).isEditable(),
        );
        return Boolean(recoveredWindow);
      })
      .toBe(true);
    if (!recoveredWindow) throw new Error("Missing recovered authenticated application window");
    await waitForShownWindow(app, recoveredWindow);
    await recoveredWindow.goto(newRoute);
    await expect(
      recoveredWindow.getByRole("combobox", {
        name: "Message New conversation",
        exact: true,
      }),
    ).toBeEditable();
  } finally {
    const kill = setTimeout(() => app?.process().kill("SIGKILL"), 10_000);
    try {
      await app?.close();
    } finally {
      clearTimeout(kill);
      await rm(profile, { recursive: true, force: true });
    }
  }
});

async function waitForShownWindow(app: ElectronApplication, page: Page) {
  const window = await app.browserWindow(page);
  try {
    // DOM visibility does not mean the native launch has committed. Navigating a
    // hidden renderer can race its initial load and leave recovery unarmed.
    await expect.poll(() => window.evaluate((win) => win.isVisible())).toBe(true);
  } finally {
    await window.dispose();
  }
}
