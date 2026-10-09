import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

/** Only a public, credential-free HTTPS origin can become an external rewrite. */
export function publicBackendOrigin(value) {
  if (typeof value !== "string" || !/^https:\/\//i.test(value.trim())) {
    throw new Error("Set API_PROXY_TARGET to the public backend HTTPS origin.");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("API_PROXY_TARGET must be a valid public HTTPS origin.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !/^https:\/\/[^/\\?#]+\/?$/i.test(value.trim()) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    isIP(hostname.replace(/^\[|\]$/g, "")) ||
    !hostname.includes(".") ||
    hostname.endsWith(".") ||
    ["localhost", "local", "internal", "test", "invalid", "onion"].some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    ) ||
    !hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new Error(
      "API_PROXY_TARGET must be a public HTTPS origin without credentials or a path.",
    );
  }
  return url.origin;
}

export function vercelBuildConfig(target, authProxySecret) {
  const origin = publicBackendOrigin(target);
  if (authProxySecret !== undefined && !/^[A-Za-z0-9_-]{32,256}$/.test(authProxySecret)) {
    throw new Error("AUTH_PROXY_SECRET must contain 32 to 256 URL-safe characters.");
  }
  const privateResponseHeaders = {
    "Cache-Control": "private, no-store",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
  return {
    version: 3,
    routes: [
      ...(authProxySecret
        ? [
            {
              src: "^/(api/auth(?:/.*)?)$",
              dest: `${origin}/$1`,
              headers: privateResponseHeaders,
              transforms: [
                {
                  type: "request.headers",
                  op: "set",
                  target: { key: "x-kith-proxy-token" },
                  args: authProxySecret,
                },
              ],
            },
          ]
        : []),
      {
        src: "^/((?:api|rpc|novnc)(?:/.*)?)$",
        dest: `${origin}/$1`,
        headers: privateResponseHeaders,
      },
      {
        src: "^/health$",
        dest: `${origin}/health`,
        headers: privateResponseHeaders,
      },
      { handle: "filesystem" },
      {
        src: "^/.*$",
        dest: "/index.html",
        methods: ["GET", "HEAD"],
        headers: { "Cache-Control": "no-cache" },
      },
    ],
  };
}

export async function writeVercelOutput({ target, authProxySecret, dist, output }) {
  // Validate before changing output; a bad target must not create a broken deployment.
  const config = vercelBuildConfig(target, authProxySecret);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(dist, path.join(output, "static"), { recursive: true });
  await writeFile(path.join(output, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    throw new Error("The hosted web build failed; inspect the build output above.");
  }
}

export async function buildVercelWeb(env = process.env) {
  const target = publicBackendOrigin(env.API_PROXY_TARGET);
  const { AUTH_PROXY_SECRET: authProxySecret, ...staticEnv } = env;
  vercelBuildConfig(target, authProxySecret);
  // These defaults exist only in the static build process. No server secrets are
  // required by, or written to, the public frontend build.
  const buildEnv = { ...staticEnv, NODE_ENV: "production", RAKAZO_ALLOW_DEV_SECRETS: "1" };
  run("pnpm", ["--filter", "@rakazo/db", "generate"], path.resolve(webRoot, "../.."), buildEnv);
  run("pnpm", ["build"], webRoot, buildEnv);
  await writeVercelOutput({
    target,
    authProxySecret,
    dist: path.join(webRoot, "dist"),
    output: path.join(webRoot, ".vercel/output"),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildVercelWeb();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Hosted web build failed."}\n`,
    );
    process.exitCode = 1;
  }
}
