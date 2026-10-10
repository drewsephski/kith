import { readFile } from "node:fs/promises";
import { isRakazoHealth, readProbeJson, requireReleaseServiceUrl } from "../dist/setup-config.js";

const expected = JSON.parse(
  await readFile(new URL("../release-service.json", import.meta.url), "utf8"),
);
const origin = requireReleaseServiceUrl(process.env.RAKAZO_SERVICE_URL, expected.serviceUrl);
const request = (pathname, init = {}) =>
  fetch(`${origin}${pathname}`, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
const health = await request("/rpc/health", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: '{"json":{}}',
});
if (!health.ok || !isRakazoHealth(await readProbeJson(health)))
  throw new Error("Hosted health verification failed.");
const session = await request("/api/auth/get-session");
if (!session.ok || (await readProbeJson(session)) !== null)
  throw new Error("Anonymous auth session verification failed.");
const capabilities = await request("/api/auth/capabilities");
const config = await readProbeJson(capabilities);
if (!capabilities.ok || !config || typeof config !== "object")
  throw new Error("Authentication capabilities unavailable.");
if (config.passwordAuth === true && config.passwordReset !== true) {
  throw new Error(
    "Public password sign-in requires working password recovery. Configure hosted email before releasing.",
  );
}
const page = await request("/");
if (!page.ok || !page.headers.get("content-type")?.includes("text/html"))
  throw new Error("Hosted application document unavailable.");
console.log(
  "Reviewed service origin, backend health, anonymous session, auth capabilities, and application document verified. Live authentication and agent execution remain manual gates.",
);
