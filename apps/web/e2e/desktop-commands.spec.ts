import { expect, test } from "@playwright/test";
import type { RakazoDesktop } from "@rakazo/contracts";
import { activeBotId, captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("native menu intents open shared settings and create one conversation", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const listeners = new Set<(command: "settings" | "new-conversation") => void>();
    window.__nativeCommand = (command) => {
      for (const listener of listeners) listener(command);
    };
    const state = {
      phase: "unsupported" as const,
      currentVersion: "0.1.7",
      availableVersion: null,
      percent: null,
      message: null,
      checkedAt: null,
    };
    const bridge: RakazoDesktop = {
      platform: "darwin",
      commands: {
        onCommand: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      window: {
        close: async () => {},
        minimize: async () => {},
        toggleMaximize: async () => {},
        state: async () => ({ minimized: false, maximized: false, fullScreen: false }),
      },
      update: {
        state: async () => state,
        check: async () => state,
        download: async () => state,
        install: async () => state,
      },
      oauth: { onCallback: () => () => {} },
    };
    window.rakazoDesktop = bridge;
  });
  await signup(
    page,
    `desktop-commands-${Date.now()}@example.test`,
    "password12",
    "Desktop Fixture",
  );
  await completeOnboarding(page);
  const assistantId = activeBotId(page);
  await expect(page.getByTestId("shell-root")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => window.__nativeCommand("settings"));
  await expect(page.getByTestId("user-settings")).toBeVisible();
  await captureScreenshot(page, testInfo, "desktop-native-settings");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("user-settings")).toBeHidden();
  const before = await rpc<Array<{ id: string }>>(page, "bots/list", {});
  await page.evaluate(() => {
    window.__nativeCommand("new-conversation");
    window.__nativeCommand("new-conversation");
  });
  await expect.poll(() => activeBotId(page)).not.toBe(assistantId);
  const after = await rpc<Array<{ id: string; parentBotId: string | null }>>(page, "bots/list", {});
  expect(after.length).toBe(before.length + 1);
  expect(after.find((bot) => bot.id === activeBotId(page))?.parentBotId).toBe(assistantId);
});

declare global {
  interface Window {
    __nativeCommand: (command: "settings" | "new-conversation") => void;
  }
}
