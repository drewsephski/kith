import path from "node:path";
import { fileURLToPath } from "node:url";

// Valid, anonymous requests exercise routing and authentication without reading
// personal sources or starting a task. Health alone cannot detect an older API.
const scope = {
  assistantId: "compatibility-probe",
  spaceId: "compatibility-probe",
  userId: "compatibility-probe",
};
const probes = [
  ["forYou/discover", { assistantId: scope.assistantId }],
  [
    "forYou/dismiss",
    { assistantId: scope.assistantId, recommendationId: "compatibility-probe", action: "dismiss" },
  ],
  [
    "bots/launchForYou",
    {
      ...scope,
      suggestionId: "weekly-plan",
      operationId: "00000000-0000-4000-8000-000000000000",
    },
  ],
];

export async function verifyForYouApi(origin, request = fetch) {
  await Promise.all(
    probes.map(async ([route, input]) => {
      try {
        const response = await request(new URL(`/rpc/${route}`, origin), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: input }),
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        const body = await response.json();
        if (
          response.status !== 401 ||
          body?.json?.code !== "UNAUTHORIZED" ||
          body.json.status !== 401
        ) {
          throw new Error("Unexpected API response");
        }
      } catch {
        // Do not print origins, proxy configuration, or response bodies in public
        // build logs. The missing route is sufficient to diagnose the mismatch.
        throw new Error(`For you API unavailable: ${route}. Deploy the compatible backend first.`);
      }
    }),
  );
}

/** A static page and liveness response can stay healthy while auth's DB is unavailable. */
async function verifyAnonymousRoute(origin, request, route, validBody) {
  try {
    const response = await request(new URL(route, origin), {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    if (!response.ok || !validBody(body)) {
      throw new Error("Unexpected readiness response");
    }
  } catch {
    throw new Error(`Hosted API unavailable: ${route}. Restore the compatible backend first.`);
  }
}

/** Existing clients need session/RPC compatibility before an older gateway is upgraded. */
export async function verifyHostedPreflight(origin, request = fetch) {
  await Promise.all([
    verifyForYouApi(origin, request),
    verifyAnonymousRoute(origin, request, "/api/auth/get-session", (body) => body === null),
  ]);
}

export async function verifyHostedApi(origin, request = fetch) {
  await Promise.all([
    verifyHostedPreflight(origin, request),
    verifyAnonymousRoute(
      origin,
      request,
      "/ready",
      (body) => body?.ok === true && body?.degraded === false,
    ),
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[3] === "--preflight") await verifyHostedPreflight(process.argv[2]);
  else await verifyHostedApi(process.argv[2]);
}
