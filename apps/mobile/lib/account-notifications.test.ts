import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LIVE_NOTIFICATION_SETTINGS } from "./live-notifications";

vi.mock("expo", () => ({ requireNativeModule: vi.fn() }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("expo-notifications", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

// Exercise the screen handler with native/network boundaries replaced, as in account-delete.
const screen = readFileSync(new URL("../app/(settings)/account.tsx", import.meta.url), "utf8");
const handler = screen
  .slice(
    screen.indexOf("  async function updateNotifications("),
    screen.indexOf("  async function securityAction("),
  )
  .replace("next: LiveNotificationSettings", "next");
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;

function harness() {
  const dependencies = {
    notifications: DEFAULT_LIVE_NOTIFICATION_SETTINGS,
    setNotifications: vi.fn(),
    setNotificationPending: vi.fn(),
    setNotificationError: vi.fn(),
    setLiveNotificationSettings: vi.fn(async () => undefined),
    currentApiBase: () => "https://api.example.test",
    loadSessionToken: async () => "fixture-token",
    selectedSpaceId: () => "fixture-space",
    canPostPromotedNotifications: async () => true,
    openPromotedNotificationSettings: vi.fn(),
    registerPushToken: vi.fn(async () => true),
    errorText: (_cause: unknown, fallback: string) => fallback,
    t: (value: string) => value,
  };
  const next = { ...DEFAULT_LIVE_NOTIFICATION_SETTINGS, liveConnection: true };
  const run = new AsyncFunction(
    ...Object.keys(dependencies),
    "next",
    `${handler}; await updateNotifications(next);`,
  );
  return { ...dependencies, next, save: () => run(...Object.values(dependencies), next) };
}

describe("Android notification preferences", () => {
  it("keeps saved native preferences when optional hosted push registration fails", async () => {
    const h = harness();
    h.registerPushToken.mockRejectedValue(new Error("Hosted push unavailable"));
    await h.save();
    expect(h.setNotifications).toHaveBeenCalledExactlyOnceWith(h.next);
    expect(h.setNotificationError).toHaveBeenCalledExactlyOnceWith(null);
    expect(h.setNotificationPending).toHaveBeenLastCalledWith(false);
  });

  it("finishes saving before optional hosted registration settles", async () => {
    const h = harness();
    let finish!: (value: boolean) => void;
    h.registerPushToken.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const saving = h.save();
    try {
      await vi.waitFor(() => expect(h.setNotificationPending).toHaveBeenLastCalledWith(false));
    } finally {
      finish(true);
      await saving;
    }
    expect(h.setNotifications).toHaveBeenCalledExactlyOnceWith(h.next);
  });

  it("rolls back and reports an authoritative native save failure", async () => {
    const h = harness();
    h.setLiveNotificationSettings.mockRejectedValue(new Error("Native save failed"));
    await h.save();
    expect(h.setNotifications).toHaveBeenLastCalledWith(DEFAULT_LIVE_NOTIFICATION_SETTINGS);
    expect(h.setNotificationError).toHaveBeenLastCalledWith("Could not update notifications");
    expect(h.registerPushToken).not.toHaveBeenCalled();
    expect(h.setNotificationPending).toHaveBeenLastCalledWith(false);
  });
});
