import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  classifyPreviewChanges,
  planPreviewUpdate,
  previewBuildSource,
} from "./preview-mobile-update.mjs";

const source = "a".repeat(40);
const build = {
  status: "FINISHED",
  platform: "IOS",
  buildProfile: "preview",
  distribution: "INTERNAL",
  updateChannel: { name: "preview" },
  runtime: { version: "1.0.8" },
  appVersion: "1.0.8",
  gitCommitHash: source,
  isForIosSimulator: false,
};

test("accepts a finished preview for the exact installed runtime and platform", () => {
  assert.equal(previewBuildSource([build], "ios", "1.0.8"), source);
  assert.equal(previewBuildSource([{ ...build, platform: "ANDROID" }], "android", "1.0.8"), source);
});

test("missing, stale, simulator, production and untraceable builds cannot authorize updates", () => {
  assert.equal(previewBuildSource([], "ios", "1.0.8"), null);
  assert.throws(() => previewBuildSource({}, "ios", "1.0.8"));
  for (const invalid of [
    { status: "ERRORED" },
    { platform: "ANDROID" },
    { buildProfile: "production" },
    { distribution: "STORE" },
    { updateChannel: { name: "production" } },
    { runtime: { version: "1.0.7" } },
    { appVersion: "1.0.7" },
    { isForIosSimulator: true },
    { gitCommitHash: "main" },
    { gitCommitHash: "" },
  ]) {
    assert.equal(previewBuildSource([{ ...build, ...invalid }], "ios", "1.0.8"), null);
  }
});

test("uses the newest build rather than falling back to an obsolete runtime", () => {
  assert.equal(
    previewBuildSource([{ ...build, runtime: { version: "1.0.9" } }, build], "ios", "1.0.8"),
    null,
  );
});

test("UI, translations and shared mobile code can update without a cloud build", () => {
  assert.equal(
    classifyPreviewChanges([
      "apps/mobile/app/thread.tsx",
      "apps/mobile/components/composer.tsx",
      "apps/mobile/lib/locales/en.ts",
      "packages/chat-ui/src/markdown.native.tsx",
      "packages/contracts/src/messages.ts",
      "packages/core/src/conversation.ts",
      "packages/ui-tokens/src/index.ts",
    ]).publish,
    true,
  );
});

test("native-sensitive files block an otherwise eligible UI change", () => {
  for (const file of [
    "apps/mobile/app.json",
    "apps/mobile/app.config.ts",
    "apps/mobile/eas.json",
    "apps/mobile/package.json",
    "apps/mobile/modules/widget/index.ts",
    "apps/mobile/plugins/share.js",
    "apps/mobile/ios/App.swift",
    "apps/mobile/metro.config.js",
    "packages/chat-ui/package.json",
    "packages/ui-tokens/assets/App.icon",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".npmrc",
    "patches/native.patch",
  ]) {
    assert.equal(classifyPreviewChanges(["apps/mobile/app/thread.tsx", file]).publish, false, file);
  }
});

test("test and documentation changes alone do not publish", () => {
  assert.equal(classifyPreviewChanges([]).publish, false);
  assert.equal(
    classifyPreviewChanges([
      "apps/mobile/lib/app.test.ts",
      "apps/mobile/lib/app.test.tsx",
      "apps/mobile/README.md",
      "apps/mobile/.maestro/smoke.yaml",
      "packages/core/src/environment.d.ts",
    ]).publish,
    false,
  );
});

test("checks the full build-to-head history, including native changes in an earlier push", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "mobile-preview-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const save = (path, contents) => writeFileSync(join(cwd, path), contents);
  mkdirSync(join(cwd, "apps/mobile/app"), { recursive: true });
  save(
    "apps/mobile/app.json",
    JSON.stringify({ expo: { version: "1.0.8", runtimeVersion: { policy: "appVersion" } } }),
  );
  save("apps/mobile/app/thread.tsx", "initial");
  save("apps/mobile/package.json", "{}");
  git("init");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  const baseline = commit();
  const builds = [{ ...build, gitCommitHash: baseline }];
  assert.equal(planPreviewUpdate(builds, "ios", cwd).publish, false);
  save("apps/mobile/app/thread.tsx", "updated");
  commit();
  assert.equal(planPreviewUpdate(builds, "ios", cwd).publish, true);
  save("apps/mobile/package.json", '{"dependencies":{"native-module":"1.0.0"}}');
  commit();
  save("apps/mobile/app/thread.tsx", "another UI change");
  commit();
  assert.equal(planPreviewUpdate(builds, "ios", cwd).publish, false);
  // A fresh build alone cannot separate older installations sharing this runtime.
  const freshBuilds = [{ ...build, gitCommitHash: git("rev-parse", "HEAD") }];
  save("apps/mobile/app/thread.tsx", "compatible with the new build");
  commit();
  assert.equal(planPreviewUpdate(freshBuilds, "ios", cwd).publish, false);
  save(
    "apps/mobile/app.json",
    JSON.stringify({ expo: { version: "1.0.9", runtimeVersion: { policy: "appVersion" } } }),
  );
  const newRuntimeSource = commit();
  const newRuntimeBuilds = [
    {
      ...build,
      appVersion: "1.0.9",
      runtime: { version: "1.0.9" },
      gitCommitHash: newRuntimeSource,
    },
  ];
  save("apps/mobile/app/thread.tsx", "compatible with the bumped native runtime");
  commit();
  assert.equal(planPreviewUpdate(newRuntimeBuilds, "ios", cwd).publish, true);
  // Reusing an earlier runtime cannot erase its original native baseline.
  save(
    "apps/mobile/app.json",
    JSON.stringify({ expo: { version: "1.0.8", runtimeVersion: { policy: "appVersion" } } }),
  );
  const reusedRuntimeSource = commit();
  assert.equal(
    planPreviewUpdate([{ ...build, gitCommitHash: reusedRuntimeSource }], "ios", cwd).publish,
    false,
  );
  assert.equal(planPreviewUpdate([{ ...build, gitCommitHash: source }], "ios", cwd).publish, false);
  assert.throws(() => planPreviewUpdate(builds, "all", cwd));
});
