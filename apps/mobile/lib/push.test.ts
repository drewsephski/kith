import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: true }));
vi.mock("expo-constants", () => ({ default: { easConfig: { projectId: "fixture-project" } } }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));
vi.mock("./api", () => ({ rpc: vi.fn(), captureMobileScreenScope: () => () => state.current }));

import * as Notifications from "expo-notifications";
import { rpc } from "./api";
import { pushPermission, registerPushToken } from "./push";

beforeEach(() => {
  vi.clearAllMocks();
  state.current = true;
  vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
    data: "fixture-token",
    type: "expo",
  });
});
it("never prompts on sign-in and silently registers already-authorized users", async () => {
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
    status: "undetermined",
    canAskAgain: true,
  } as Notifications.NotificationPermissionsStatus);
  expect(await registerPushToken()).toBe(false);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Notifications.NotificationPermissionsStatus);
  expect(await registerPushToken()).toBe(true);
  expect(rpc).toHaveBeenCalledWith("notifications/registerPush", { token: "fixture-token" });
});
it("requests permission only after an explicit action, and never reprompts after denial", async () => {
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
    status: "undetermined",
    canAskAgain: true,
  } as Notifications.NotificationPermissionsStatus);
  vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Notifications.NotificationPermissionsStatus);
  await registerPushToken({ requestPermission: true });
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
    status: "denied",
    canAskAgain: false,
  } as Notifications.NotificationPermissionsStatus);
  await registerPushToken({ requestPermission: true });
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
  expect(await pushPermission()).toBe("denied");
});
it("does not register a token minted for an old account or Space", async () => {
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Notifications.NotificationPermissionsStatus);
  vi.mocked(Notifications.getExpoPushTokenAsync).mockImplementation(async () => {
    state.current = false;
    return { data: "old", type: "expo" };
  });
  expect(await registerPushToken()).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});
