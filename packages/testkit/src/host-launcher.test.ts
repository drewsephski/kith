import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function launch(mode: string, values: NodeJS.ProcessEnv = {}) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "rakazo-host-")));
  roots.push(root);
  mkdirSync(path.join(root, "scripts"));
  const launcher = path.join(root, "scripts/run-host.mjs");
  copyFileSync(path.resolve(import.meta.dirname, "../../../scripts/run-host.mjs"), launcher);
  writeFileSync(path.join(root, ".env"), "SANDBOX_PROVIDER=none\nDATA_DIR=./persistent\n");
  const capture = path.join(root, "capture.json");
  const pnpm = path.join(root, "pnpm.cjs");
  writeFileSync(
    pnpm,
    `require('node:fs').writeFileSync(process.env.HOST_CAPTURE, JSON.stringify({
    args: process.argv.slice(2), cwd: process.cwd(), nodeEnv: process.env.NODE_ENV,
    sandbox: process.env.SANDBOX_PROVIDER, dataDir: process.env.DATA_DIR,
    sentinel: process.env.HOST_SENTINEL
  })); process.exit(Number(process.env.HOST_EXIT || 0));`,
  );
  const result = spawnSync(process.execPath, [launcher, mode], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, npm_execpath: pnpm, HOST_CAPTURE: capture, ...values },
    timeout: 10_000,
  });
  return { root, capture, result };
}

describe("Docker-free host launcher", () => {
  it("launches only API, worker, and web with a shared absolute data directory", () => {
    const { root, capture, result } = launch("dev");
    expect(result.status).toBe(0);
    const observed = JSON.parse(readFileSync(capture, "utf8"));
    expect(observed.args).toEqual([
      "exec",
      "turbo",
      "dev",
      "--env-mode=loose",
      "--filter=@rakazo/api",
      "--filter=@rakazo/worker",
      "--filter=@rakazo/web",
    ]);
    expect(observed).toMatchObject({
      cwd: root,
      nodeEnv: "development",
      sandbox: "none",
      dataDir: path.join(root, "persistent"),
    });
  });

  it("uses production mode and preserves caller-supplied remote provider configuration", () => {
    const { capture, result } = launch("start", {
      SANDBOX_PROVIDER: "daytona",
      NODE_ENV: "development",
      HOST_SENTINEL: "fake-setting",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(capture, "utf8"))).toMatchObject({
      nodeEnv: "production",
      sandbox: "daytona",
      sentinel: "fake-setting",
    });
  });

  it("rejects a Docker configuration before launching services", () => {
    const { result } = launch("dev", { SANDBOX_PROVIDER: "docker" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Host mode requires SANDBOX_PROVIDER=none");
  });

  it("propagates a service failure to the process supervisor", () => {
    expect(launch("start", { HOST_EXIT: "7" }).result.status).toBe(7);
  });
});
