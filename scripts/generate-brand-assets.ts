import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { lightTokens } from "../packages/ui-tokens/src/index.js";

// Design maintenance only. ImageMagick is not a product runtime dependency.
const root = path.resolve(import.meta.dirname, "..");
const assets = "packages/ui-tokens/assets";
const source = `${assets}/kith-companion-source.png`;
const master = `${assets}/kith-app-icon.png`;
const temporary = mkdtempSync(path.join(tmpdir(), "kith-brand-"));

function convert(...args: string[]) {
  const result = spawnSync("magick", args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "ImageMagick conversion failed");
}

function copy(from: string, to: string) {
  copyFileSync(path.resolve(root, from), path.resolve(root, to));
}

function foreground(size: number, output: string) {
  convert(
    source,
    "-resize",
    `${size}x${size}`,
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "1024x1024",
    "-strip",
    output,
  );
}

function svgMark(image: string, output: string) {
  const data = readFileSync(path.resolve(root, image)).toString("base64");
  writeFileSync(
    path.resolve(root, output),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">Kith mark</title><image width="512" height="512" href="data:image/png;base64,${data}" /></svg>\n`,
  );
}

try {
  convert(
    source,
    "-resize",
    "256x256",
    "-strip",
    "-quality",
    "90",
    `${assets}/kith-companion.webp`,
  );
  convert(source, "-resize", "512x512", "-strip", `${assets}/kith-companion.png`);
  foreground(900, `${assets}/Rakazo.icon/Assets/orange-bot.png`);
  convert(
    `${assets}/Rakazo.icon/Assets/orange-bot.png`,
    "-background",
    lightTokens.background,
    "-alpha",
    "remove",
    "-alpha",
    "off",
    "-strip",
    master,
  );

  copy(master, "apps/desktop/assets/icon.png");
  copy(master, "apps/mobile/assets/icon.png");
  foreground(640, "apps/mobile/assets/adaptive-icon.png");
  foreground(900, "apps/mobile/assets/splash-icon.png");
  convert(
    "-size",
    "1024x1024",
    `xc:${lightTokens.background}`,
    "-strip",
    "apps/mobile/assets/icon-background.png",
  );
  convert(
    "apps/mobile/assets/adaptive-icon.png",
    "-channel",
    "RGB",
    "-evaluate",
    "set",
    "100%",
    "+channel",
    "-strip",
    "apps/mobile/assets/monochrome-icon.png",
  );
  convert(
    "apps/mobile/assets/monochrome-icon.png",
    "-resize",
    "96x96",
    "-strip",
    "apps/mobile/assets/notification-icon.png",
  );
  convert(master, "-resize", "48x48", "-strip", "apps/mobile/assets/favicon.png");
  convert(
    master,
    "-define",
    "icon:auto-resize=256,128,64,48,32,16",
    "apps/desktop/assets/icon.ico",
  );

  const dock = path.join(temporary, "dock.png");
  const mask = path.join(temporary, "mask.png");
  convert(
    master,
    "-resize",
    "824x824",
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "1024x1024",
    dock,
  );
  convert(
    "-size",
    "1024x1024",
    "xc:none",
    "-fill",
    "white",
    "-draw",
    "roundrectangle 100,100 923,923 185,185",
    mask,
  );
  convert(
    dock,
    mask,
    "-alpha",
    "off",
    "-compose",
    "CopyOpacity",
    "-composite",
    "-strip",
    "apps/desktop/assets/icon-macos.png",
  );

  for (const app of ["web", "www"]) {
    const publicDir = `apps/${app}/public`;
    for (const [name, size] of [
      ["favicon-16x16", 16],
      ["favicon-32x32", 32],
      ["apple-touch-icon", 180],
      ["icon-192", 192],
      ["icon-512", 512],
    ] as const) {
      convert(master, "-resize", `${size}x${size}`, "-strip", `${publicDir}/${name}.png`);
    }
    convert(master, "-define", "icon:auto-resize=48,32,16", `${publicDir}/favicon.ico`);
  }
  copy(`${assets}/kith-companion.webp`, "apps/www/public/brand/kith-companion.webp");
  svgMark("apps/www/public/favicon-32x32.png", "apps/www/public/favicon.svg");
  svgMark(`${assets}/kith-companion.png`, "apps/www/public/brand/rakazo-mark.svg");

  convert(
    source,
    "-resize",
    "560x560",
    "-background",
    lightTokens.background,
    "-gravity",
    "center",
    "-extent",
    "1200x630",
    "-alpha",
    "remove",
    "-alpha",
    "off",
    "-strip",
    "apps/www/public/og-image.png",
  );

  const provenance = JSON.stringify(
    {
      source: "kith-companion-source.png",
      sourceSha256: createHash("sha256")
        .update(readFileSync(path.resolve(root, source)))
        .digest("hex"),
      origin: "User-supplied artwork",
      generator: "pnpm exec tsx scripts/generate-brand-assets.ts",
    },
    null,
    2,
  );
  writeFileSync(path.resolve(root, `${assets}/kith-companion.webp.json`), `${provenance}\n`);
  copy(`${assets}/kith-companion.webp.json`, "apps/www/public/brand/kith-companion.webp.json");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
