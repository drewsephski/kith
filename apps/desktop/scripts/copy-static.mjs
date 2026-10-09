import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeServiceUrl, SERVICE_CONFIG_FILE_NAME } from "../dist/setup-config.js";

// tsc only emits the TypeScript sources; the preload bridges and the setup
// window's static assets have to be copied into dist alongside them.
const STATIC_FILES = ["preload.cjs", "setup-preload.cjs", "setup.html", "setup.css", "setup.js"];
const TOKENS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/ui-tokens/src/tokens.css",
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const configuredServiceUrl = process.env.RAKAZO_SERVICE_URL?.trim();
const serviceUrl = configuredServiceUrl ? normalizeServiceUrl(configuredServiceUrl) : null;
if (configuredServiceUrl && serviceUrl === null) {
  throw new Error(
    "RAKAZO_SERVICE_URL must be a public HTTPS DNS origin without credentials or a path.",
  );
}

await mkdir(dist, { recursive: true });
await Promise.all([
  writeFile(path.join(dist, SERVICE_CONFIG_FILE_NAME), `${JSON.stringify({ serviceUrl })}\n`, {
    mode: 0o644,
  }),
  ...STATIC_FILES.map((file) => copyFile(path.join(root, "src", file), path.join(dist, file))),
  copyFile(TOKENS_FILE, path.join(dist, "tokens.css")),
  copyFile(
    path.resolve(root, "../../packages/ui-tokens/assets/kith-companion.webp"),
    path.join(dist, "kith-companion.webp"),
  ),
]);
