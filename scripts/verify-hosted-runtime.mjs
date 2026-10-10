import { readdirSync, readFileSync, readlinkSync } from "node:fs";

const expected = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(expected ?? "")) throw new Error("Expected an exact source SHA");
const health = await fetch("http://127.0.0.1:3100/internal/health").then((response) => {
  if (!response.ok) throw new Error("Internal API health unavailable");
  return response.json();
});
if (!health.ok || health.degraded || health.revision !== expected) {
  throw new Error("API source or readiness does not match the tested revision");
}
const workers = readdirSync("/proc").filter((pid) => {
  if (!/^\d+$/.test(pid)) return false;
  try {
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    const cwd = readlinkSync(`/proc/${pid}/cwd`);
    if (
      !args.some(
        (arg) =>
          arg.endsWith("/apps/worker/src/index.ts") ||
          (arg === "src/index.ts" && cwd.endsWith("/apps/worker")),
      )
    )
      return false;
    if (!args[0].endsWith("node")) return false;
    const env = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    return env.includes(`GIT_SHA=${expected}`);
  } catch {
    return false;
  }
});
if (workers.length === 0) throw new Error("Expected source worker process is absent");
console.log(JSON.stringify({ ok: true, revision: expected, workerProcesses: workers.length }));
