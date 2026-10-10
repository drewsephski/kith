import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const [directory, version, windows = "false", platform = "all"] = process.argv.slice(2);
if (!directory || !/^\d+\.\d+\.\d+$/.test(version ?? "") || !["true", "false"].includes(windows))
  throw new Error(
    "Usage: verify-artifacts.mjs <directory> <stable version> <windows built> [all|mac|linux|win]",
  );
const digest = async (file, algorithm, encoding) => {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
};
const platforms = {
  mac: ["latest-mac.yml", ["zip", "dmg"], "universal"],
  linux: ["latest-linux.yml", ["AppImage"], "x86_64"],
  ...(windows === "true" ? { win: ["latest.yml", ["exe"], "x64"] } : {}),
};
if (platform !== "all" && !platforms[platform]) throw new Error("Unexpected release platform.");
for (const [key, [name, extensions, arch]] of Object.entries(platforms)) {
  if (platform !== "all" && platform !== key) continue;
  const feed = parse(await readFile(path.join(directory, name), "utf8"));
  if (feed.version !== version || !Array.isArray(feed.files) || !feed.files.length)
    throw new Error(`Invalid update feed: ${name}`);
  const expected = extensions.map((ext) => `Kith-${version}-${arch}.${ext}`);
  for (const filename of expected)
    if (!(await stat(path.join(directory, filename))).isFile())
      throw new Error(`Missing release installer: ${filename}`);
  const seen = new Set();
  for (const file of feed.files) {
    if (!expected.includes(file.url) || seen.has(file.url))
      throw new Error(`Unexpected or duplicate update artifact in ${name}`);
    seen.add(file.url);
    const artifact = path.join(directory, file.url);
    const info = await stat(artifact);
    if (
      info.size === 0 ||
      info.size !== file.size ||
      (await digest(artifact, "sha512", "base64")) !== file.sha512
    )
      throw new Error(`Update size/checksum mismatch: ${file.url}`);
  }
  // macOS updates consume ZIP, Linux AppImage, and Windows NSIS; DMG is installation-only.
  const update = expected[0];
  if (
    !seen.has(update) ||
    feed.path !== update ||
    feed.sha512 !== (await digest(path.join(directory, update), "sha512", "base64"))
  )
    throw new Error(`Missing compatible primary updater artifact: ${name}`);
}
const files = await readdir(directory);
if (platform === "all") {
  const allowed = new Set(["SHA256SUMS"]);
  for (const [feed, extensions, arch] of Object.values(platforms)) {
    allowed.add(feed);
    for (const extension of extensions) {
      const name = `Kith-${version}-${arch}.${extension}`;
      allowed.add(name);
      allowed.add(`${name}.blockmap`);
    }
  }
  if (files.some((file) => !allowed.has(file)))
    throw new Error("Unexpected or stale publication asset.");
}
if (
  platform === "all" &&
  windows === "false" &&
  files.some((file) => file.endsWith(".exe") || file === "latest.yml")
)
  throw new Error("Unexpected Windows assets without signing.");
console.log(
  "Installer names, stable versions, updater paths, sizes and SHA-512 checksums verified.",
);
