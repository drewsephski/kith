import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";
import type { RakazoDesktop } from "@rakazo/contracts";
import type { WebContents, WebPreferences } from "electron";

// Transport/security fixtures, not a claim of live account or provider acceptance.
// The production service configuration is checked inside app.asar separately.
// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a fixture pattern for testInfo.
test("packaged login transport retains its partition across restart and recovers a crash", async ({}, testInfo) => {
  test.setTimeout(90_000);
  const executable = process.env.RAKAZO_E2E_EXECUTABLE;
  test.skip(!executable, "Packaged acceptance runs against CI's packaged executable.");
  const profile = await mkdtemp(path.join(tmpdir(), "kith-packaged-"));
  const server = createServer((request, response) => {
    if (request.url === "/rpc/health") {
      response.setHeader("content-type", "application/json");
      response.end('{"json":{"ok":true,"version":"fixture"}}');
      return;
    }
    response.setHeader("content-type", "text/html");
    const loggedIn = request.headers.cookie?.includes("fixture-session=retained");
    response.end(
      `<!doctype html><title>Kith</title><main>${loggedIn ? "Existing assistant fixture" : '<form><label>Email<input type="email"></label><button type="button" onclick="document.cookie=\'fixture-session=retained; Max-Age=3600; SameSite=Lax; Path=/\'; location.reload()">Sign in</button></form>'}</main>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture port");
  const origin = `http://127.0.0.1:${address.port}`;
  await writeFile(
    path.join(profile, "setup.json"),
    JSON.stringify({ mode: "existing", serverUrl: origin }),
  );
  const launch = () => {
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    env.RAKAZO_PERFORMANCE_USER_DATA = profile;
    env.RAKAZO_DISABLE_AUTO_UPDATE = "1";
    delete env.RAKAZO_WEB_URL;
    delete env.RAKAZO_FORCE_SETUP;
    return electron.launch({
      executablePath: path.resolve(executable!),
      args: [],
      cwd: path.resolve(import.meta.dirname, ".."),
      env,
    });
  };
  let app: ElectronApplication | undefined;
  try {
    const startupAt = performance.now();
    app = await launch();
    const page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    console.info(`Packaged first usable fixture: ${Math.round(performance.now() - startupAt)}ms`);
    expect(await app.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.name }))).toEqual(
      { packaged: true, name: "Kith" },
    );
    let mainId = await (await app.browserWindow(page)).evaluate((win) => win.id);
    const prefs = await app.evaluate(({ BrowserWindow }, id) => {
      const contents = BrowserWindow.fromId(id)!.webContents as WebContents & {
        getLastWebPreferences(): WebPreferences;
      };
      const preferences = contents.getLastWebPreferences();
      return {
        nodeIntegration: preferences.nodeIntegration,
        contextIsolation: preferences.contextIsolation,
        sandbox: preferences.sandbox,
      };
    }, mainId);
    expect(prefs).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true });
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Existing assistant fixture")).toBeVisible();
    await app.evaluate(
      async ({ BrowserWindow }, id) =>
        BrowserWindow.fromId(id)!.webContents.session.cookies.flushStore(),
      mainId,
    );
    await app.close();
    app = await launch();
    const restored = await app.firstWindow();
    mainId = await (await app.browserWindow(restored)).evaluate((win) => win.id);
    await expect(restored.getByText("Existing assistant fixture")).toBeVisible();
    await promisify(execFile)(path.resolve(executable!), [], {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        RAKAZO_PERFORMANCE_USER_DATA: profile,
        RAKAZO_DISABLE_AUTO_UPDATE: "1",
      },
      timeout: 15000,
    });
    expect(app.windows()).toHaveLength(1);
    // Never open a real browser or provider in public CI.
    await app.evaluate(({ shell }) => {
      shell.openExternal = async () => {};
    });
    const reserve = createServer();
    await new Promise<void>((resolve) => reserve.listen(0, "127.0.0.1", resolve));
    const callbackAddress = reserve.address();
    if (!callbackAddress || typeof callbackAddress === "string")
      throw new Error("Missing callback fixture port");
    await new Promise<void>((resolve, reject) =>
      reserve.close((error) => (error ? reject(error) : resolve())),
    );
    const callbackUrl = `http://127.0.0.1:${callbackAddress.port}/callback`;
    const authorize = `https://provider.example.test/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&state=fixture-state`;
    await restored.evaluate(async (url) => {
      window.__callback = null;
      window.rakazoDesktop!.oauth.onCallback((value) => {
        window.__callback = value;
      });
      await window.rakazoDesktop!.oauth.open!(url);
    }, authorize);
    const callback = await fetch(`${callbackUrl}?code=fixture-code&state=fixture-state`);
    expect(callback.status).toBe(200);
    await expect
      .poll(() => restored.evaluate(() => window.__callback))
      .toEqual({ code: "fixture-code", state: "fixture-state" });
    await expect(restored.getByText("Existing assistant fixture")).toBeVisible();
    await restored.evaluate(() => {
      window.__commands = [];
      window.rakazoDesktop?.commands?.onCommand((command) => window.__commands.push(command));
    });
    await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()!;
      const settings = menu.items
        .flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.accelerator === "CmdOrCtrl+,");
      if (settings?.label !== "Settings…") throw new Error("Native preferences command missing");
      settings.click();
    });
    await expect.poll(() => restored.evaluate(() => window.__commands)).toEqual(["settings"]);
    await app.evaluate(({ BrowserWindow }, id) => {
      const win = BrowserWindow.fromId(id)!;
      const events: Array<Record<string, unknown>> = [];
      const state = () => ({
        at: Date.now(),
        id: win.id,
        webContentsId: win.webContents.id,
        visible: win.isVisible(),
        minimized: win.isMinimized(),
        focused: win.isFocused(),
        bounds: win.getBounds(),
      });
      const runtime = globalThis as typeof globalThis & {
        kithWindowDiagnostics?: { before: Record<string, unknown>; events: typeof events };
      };
      runtime.kithWindowDiagnostics = { before: state(), events };
      for (const event of ["minimize", "restore", "focus", "blur", "show", "hide"] as const) {
        win.on(event, () => events.push({ event, ...state() }));
      }
    }, mainId);
    try {
      await restored.evaluate(() => window.rakazoDesktop!.window.minimize());
      await expect
        .poll(() =>
          app!.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.isMinimized(), mainId),
        )
        .toBe(true);
      await app.evaluate(({ app }) => app.emit("activate"));
      await expect
        .poll(() =>
          app!.evaluate(
            ({ BrowserWindow }, id) => ({
              minimized: BrowserWindow.fromId(id)!.isMinimized(),
              visible: BrowserWindow.fromId(id)!.isVisible(),
              focused: BrowserWindow.fromId(id)!.isFocused(),
            }),
            mainId,
          ),
        )
        .toEqual({ minimized: false, visible: true, focused: true });
      const events = await app.evaluate(() => {
        const runtime = globalThis as typeof globalThis & {
          kithWindowDiagnostics?: { events: Array<{ event: string }> };
        };
        return runtime.kithWindowDiagnostics!.events.map((entry) => entry.event);
      });
      expect(events).toContain("minimize");
      expect(events).toContain("restore");
      expect(events.indexOf("restore")).toBeGreaterThan(events.indexOf("minimize"));
    } finally {
      const diagnostics = await app.evaluate(
        ({ BrowserWindow }, id) => ({
          windows: BrowserWindow.getAllWindows().map((win) => ({
            id: win.id,
            webContentsId: win.webContents.id,
            visible: win.isVisible(),
            minimized: win.isMinimized(),
            bounds: win.getBounds(),
          })),
          targetId: id,
          state: (globalThis as typeof globalThis & { kithWindowDiagnostics?: unknown })
            .kithWindowDiagnostics,
        }),
        mainId,
      );
      await testInfo.attach("native-window-events", {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: "application/json",
      });
    }
    const recovery = app.waitForEvent("window");
    await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.webContents.forcefullyCrashRenderer(),
      mainId,
    );
    const setup = await recovery;
    await expect(setup.getByText("Kith stopped responding.", { exact: false })).toBeVisible();
    await setup.getByRole("button", { name: "Continue", exact: true }).click();
    await expect
      .poll(async () => {
        const windows = app!.windows();
        return Promise.all(
          windows.map((win) =>
            win
              .locator("main")
              .textContent()
              .catch(() => null),
          ),
        );
      })
      .toContain("Existing assistant fixture");
  } finally {
    await app?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(profile, { recursive: true, force: true });
  }
});

declare global {
  interface Window {
    __commands: string[];
    __callback: { code: string; state?: string } | null;
    rakazoDesktop?: RakazoDesktop;
  }
}
