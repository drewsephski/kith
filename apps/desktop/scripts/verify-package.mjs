import { appendFile, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractFile, listPackage } from "@electron/asar";
import { parse } from "yaml";
import { requireReleaseServiceUrl } from "../dist/setup-config.js";

const [platform, architecture = "x64", mode = "release"] = process.argv.slice(2);
if (
  !["mac", "linux", "win"].includes(platform) ||
  !["arm64", "x64", "universal"].includes(architecture) ||
  !["release", "fixture"].includes(mode)
) {
  throw new Error(
    "Usage: verify-package.mjs <mac|linux|win> <arm64|x64|universal> [release|fixture]",
  );
}
const root = path.resolve(import.meta.dirname, "..");
const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const output = path.join(root, "out");
const folder =
  platform === "mac"
    ? `mac${architecture === "x64" ? "" : `-${architecture}`}`
    : `${platform}-unpacked`;
const unpacked = path.join(output, folder);
const appPath = platform === "mac" ? path.join(unpacked, "Kith.app") : unpacked;
if (platform === "mac") {
  const bundles = (await readdir(unpacked)).filter((file) => file.endsWith(".app"));
  if (bundles.length !== 1 || bundles[0] !== "Kith.app")
    throw new Error("Expected exactly one Kith.app bundle.");
}
const resources = path.join(appPath, platform === "mac" ? "Contents/Resources" : "resources");
const executable = path.join(
  appPath,
  platform === "mac" ? "Contents/MacOS/Kith" : platform === "win" ? "Kith.exe" : "rakazo",
);
if (!(await stat(executable)).isFile()) throw new Error("Packaged executable missing.");
const archive = path.join(resources, "app.asar");
const files = new Set(listPackage(archive));
for (const file of [
  "dist/main.js",
  "dist/preload.cjs",
  "dist/setup-preload.cjs",
  "dist/setup.html",
  "dist/setup.js",
  "dist/setup.css",
  "dist/tokens.css",
  "dist/kith-companion.webp",
  "dist/service-config.json",
]) {
  if (!files.has(`/${file}`)) throw new Error(`Packaged resource missing: ${file}`);
}
const packaged = JSON.parse(extractFile(archive, "package.json").toString());
if (
  packaged.version !== metadata.version ||
  packaged.productName !== "Kith" ||
  packaged.main !== "dist/main.js"
)
  throw new Error("Packaged metadata differs from release.");
const service = JSON.parse(extractFile(archive, "dist/service-config.json").toString());
if (mode === "release") {
  const reviewed = JSON.parse(await readFile(path.join(root, "release-service.json"), "utf8"));
  const expected = requireReleaseServiceUrl(process.env.RAKAZO_SERVICE_URL, reviewed.serviceUrl);
  if (
    Object.keys(service).sort().join(",") !== "releaseBuild,serviceUrl" ||
    service.serviceUrl !== expected ||
    service.releaseBuild !== true
  )
    throw new Error("Packaged service configuration differs from verified origin.");
} else if (service.serviceUrl !== null || service.releaseBuild !== false)
  throw new Error("CI fixture package must not embed a production service.");
for (const file of [
  "web/index.html",
  "stack/docker-compose.images.yml",
  "stack/.env.images.example",
]) {
  if (!(await stat(path.join(resources, file))).isFile())
    throw new Error(`Extra resource missing: ${file}`);
}
const feed = await readFile(path.join(resources, "app-update.yml"), "utf8")
  .then(parse)
  .catch((error) => {
    // electron-builder's --dir target intentionally omits updater metadata.
    if (mode === "fixture" && error.code === "ENOENT") return null;
    throw error;
  });
if (
  feed &&
  (feed.provider !== "github" ||
    feed.owner !== "drewsephski" ||
    feed.repo !== "kith" ||
    (feed.channel && feed.channel !== "latest"))
)
  throw new Error("Packaged update feed is not the stable Kith channel.");
if (platform === "win" && !feed?.publisherName)
  throw new Error("Windows feed missing signature publisher.");
console.log(
  `Verified Kith ${metadata.version}: ${folder}/${platform === "mac" ? "Kith.app/Contents/MacOS/Kith" : platform === "win" ? "Kith.exe" : "rakazo"}`,
);
if (process.env.GITHUB_OUTPUT && platform === "mac") {
  await appendFile(process.env.GITHUB_OUTPUT, `app=${appPath}\n`);
}
