import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";

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
    await page.goto(`${origin}/sign-up`);
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
    await app.close();
    app = await launch();
    const restored = await app.firstWindow();
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
    const restoredId = await (await app.browserWindow(restored)).evaluate((win) => win.id);
    const recovered = restored.waitForEvent("domcontentloaded");
    await app.evaluate(
      ({ BrowserWindow }, windowId) =>
        BrowserWindow.fromId(windowId)!.webContents.forcefullyCrashRenderer(),
      restoredId,
    );
    await recovered;
    await expect(newComposer).toBeEditable();
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
