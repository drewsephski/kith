import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "kith-release-feed-"));
  directories.push(directory);
  const version = "0.1.7";
  const binary = Buffer.from("deterministic installer fixture");
  const sha512 = createHash("sha512").update(binary).digest("base64");
  for (const [name, files] of Object.entries({
    "latest-mac.yml": [`Kith-${version}-universal.zip`, `Kith-${version}-universal.dmg`],
    "latest-linux.yml": [`Kith-${version}-x86_64.AppImage`],
  })) {
    for (const file of files) writeFileSync(path.join(directory, file), binary);
    writeFileSync(
      path.join(directory, name),
      stringify({
        version,
        files: files.map((url) => ({ url, size: binary.length, sha512 })),
        path: files[0],
        sha512,
      }),
    );
  }
  const verify = () =>
    execFileSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "../scripts/verify-artifacts.mjs"),
        directory,
        version,
        "false",
      ],
      { stdio: "pipe" },
    ).toString();
  return { directory, version, verify };
}
describe("release artifact verification", () => {
  it("verifies actual updater-referenced bytes across every required platform", () => {
    expect(fixture().verify()).toContain("SHA-512 checksums verified");
  });
  it("rejects an extra installer from an older release", () => {
    const { directory, verify } = fixture();
    writeFileSync(path.join(directory, "Kith-0.1.6-universal.dmg"), "stale");
    expect(verify).toThrow();
  });
  it("rejects tampered artifacts", () => {
    const { directory, verify, version } = fixture();
    writeFileSync(path.join(directory, `Kith-${version}-universal.zip`), "tampered");
    expect(verify).toThrow();
  });
  it("rejects stale release names and external updater URLs", () => {
    const { directory, verify, version } = fixture();
    writeFileSync(
      path.join(directory, "latest-mac.yml"),
      stringify({
        version,
        files: [{ url: "https://untrusted.example.com/update.zip", size: 1, sha512: "bad" }],
      }),
    );
    expect(verify).toThrow();
  });
  it("rejects unexpected unsigned Windows assets", () => {
    const { directory, verify } = fixture();
    writeFileSync(path.join(directory, "Kith.exe"), "unsigned");
    expect(verify).toThrow();
  });
  it("requires the installation-only DMG as well as the update ZIP", () => {
    const { directory, verify, version } = fixture();
    rmSync(path.join(directory, `Kith-${version}-universal.dmg`));
    expect(verify).toThrow();
  });
});
