import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { captureMobileScreenScope, rpc } from "./api";

export type PushPermission = "allowed" | "denied" | "undetermined";
export async function pushPermission(): Promise<PushPermission> {
  const permission = await Notifications.getPermissionsAsync();
  return permission.granted
    ? "allowed"
    : permission.status === "undetermined"
      ? "undetermined"
      : "denied";
}

/** Startup registration is silent. Only an explicit, contextual action may ask permission. */
export async function registerPushToken({ requestPermission = false } = {}): Promise<boolean> {
  const current = captureMobileScreenScope();
  let permission = await Notifications.getPermissionsAsync();
  if (
    requestPermission &&
    !permission.granted &&
    permission.canAskAgain &&
    permission.status === "undetermined"
  ) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted || !current()) return false;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return false;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token || !current()) return false;
  await rpc("notifications/registerPush", { token });
  return current();
}

export async function unregisterPushToken() {
  await rpc("notifications/unregisterPush").catch(() => undefined);
}
