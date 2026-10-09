import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (!["dev", "start"].includes(mode)) {
  process.stderr.write("Use pnpm dev:host or pnpm start:host.\n");
  process.exit(1);
}
const envFile = path.join(root, ".env");
if (existsSync(envFile)) loadEnvFile(envFile);
const sandbox = process.env.SANDBOX_PROVIDER?.trim() || "none";
if (sandbox === "docker") {
  process.stderr.write("Host mode requires SANDBOX_PROVIDER=none or a remote computer provider.\n");
  process.exit(1);
}
const pnpm = process.env.npm_execpath;
if (!pnpm) {
  process.stderr.write("Launch host mode through pnpm.\n");
  process.exit(1);
}
// Turbo owns all three children and stops the remaining services on failure.
const child = spawn(
  process.execPath,
  [
    pnpm,
    "exec",
    "turbo",
    mode,
    "--env-mode=loose",
    ...["api", "worker", "web"].map((service) => `--filter=@rakazo/${service}`),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      NODE_ENV: mode === "start" ? "production" : "development",
      SANDBOX_PROVIDER: sandbox,
      DATA_DIR: path.resolve(root, process.env.DATA_DIR || "data"),
    },
  },
);
const onSigint = () => child.kill("SIGINT");
const onSigterm = () => child.kill("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);
child.on("error", () => {
  process.stderr.write("Could not launch the host services.\n");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
