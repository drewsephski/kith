import { openBrowserAsync } from "expo-web-browser";

/** Use the native browser's Done/back control to return to the app. Browser
 * dismissal is not proof of authorization; the caller verifies with the API. */
export async function openIntegrationAuthorization(authorizationUrl: string): Promise<void> {
  const url = new URL(authorizationUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Account authorization requires a secure URL");
  await openBrowserAsync(url.href);
}
