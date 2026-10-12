// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: GitHub runner output files are used outside Turbo tasks.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const mobilePaths = [
  "apps/mobile",
  "packages/chat-ui",
  "packages/contracts",
  "packages/core",
  "packages/ui-tokens",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  "patches",
];

export function classifyPreviewChanges(files) {
  let changed = false;
  for (const file of files) {
    if (/\.(test\.[cm]?[jt]sx?|d\.ts|md)$/.test(file) || file.startsWith("apps/mobile/.maestro/")) {
      continue;
    }
    const javascript = /\.(ts|tsx)$/.test(file);
    const mobile = /^apps\/mobile\/(app|components|lib)\//.test(file);
    const shared = /^packages\/(chat-ui|contracts|core|ui-tokens)\/src\//.test(file);
    if ((mobile || shared) && javascript) {
      changed = true;
    } else if (file.startsWith("packages/chat-ui/src/") && file.endsWith(".css")) {
      changed = true;
    } else {
      return { publish: false, reason: "Native-sensitive changes require a new preview build." };
    }
  }
  return {
    publish: changed,
    reason: changed ? "Compatible preview update ready." : "No mobile bundle changes to publish.",
  };
}

export function previewBuildSource(builds, platform, version) {
  if (!Array.isArray(builds)) throw new Error("Invalid EAS build response");
  const build = builds[0];
  if (!build) return null;
  if (
    build.status !== "FINISHED" ||
    build.platform !== platform.toUpperCase() ||
    build.buildProfile !== "preview" ||
    build.distribution !== "INTERNAL" ||
    build.updateChannel?.name !== "preview" ||
    build.isForIosSimulator === true ||
    build.runtime?.version !== version ||
    build.appVersion !== version ||
    !/^[a-f0-9]{40}$/.test(build.gitCommitHash ?? "")
  ) {
    return null;
  }
  return build.gitCommitHash;
}

export function planPreviewUpdate(builds, platform, cwd = process.cwd()) {
  if (!["ios", "android"].includes(platform)) throw new Error("Invalid mobile platform");
  const config = JSON.parse(readFileSync(`${cwd}/apps/mobile/app.json`, "utf8")).expo;
  if (config.runtimeVersion?.policy !== "appVersion") {
    throw new Error("Preview publication requires the appVersion runtime policy");
  }
  const base = previewBuildSource(builds, platform, config.version);
  if (!base) {
    return { publish: false, reason: "Create a device preview build for the current app version." };
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, "HEAD"], { cwd, stdio: "pipe" });
  } catch {
    return {
      publish: false,
      reason: "Preview build source is unavailable or is outside this history.",
    };
  }
  const files = execFileSync(
    "git",
    ["diff", "--name-only", "-z", base, "HEAD", "--", ...mobilePaths],
    {
      cwd,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
  return classifyPreviewChanges(files);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = planPreviewUpdate(
    JSON.parse(readFileSync(process.argv[2], "utf8")),
    process.argv[3],
  );
  const output = `publish=${plan.publish}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${process.argv[3]} preview\n\n${plan.reason}\n`,
    );
  }
  process.stdout.write(`${output}${plan.reason}\n`);
}
