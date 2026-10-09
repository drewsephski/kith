import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const imageSource = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
const runtimeInstall = imageSource.match(/install -d -m 750 -o node -g node([\s\S]*?)\n\n/)?.[1];
assert.ok(
  runtimeInstall,
  "The image must explicitly initialize narrowly scoped runtime directories",
);
const writablePaths = runtimeInstall.match(/\/(?:app|data)(?:\/[\w.-]+)*/g) ?? [];
const turboBinary = fileURLToPath(new URL("../../node_modules/.bin/turbo", import.meta.url));

// Test the actual Turbo binary against immutable application/source parents.
// Its cache and package log paths come from the image's ownership declaration.
test("the image grants node only the required cache and runtime directories", () => {
  const expected = [
    "/data",
    "/app/.turbo",
    "/app/apps/api/.turbo",
    "/app/apps/worker/.turbo",
    "/app/apps/web/.turbo",
    "/app/apps/web/node_modules/.vite-temp",
  ];
  assert.deepEqual([...writablePaths].sort(), expected.sort());
  assert.equal(writablePaths.includes("/app"), false);
  assert.doesNotMatch(imageSource, /chown\s+(?:--recursive|-R)[^\n]*\s\/app(?:\s|$)/);
});

async function proveRuntimeDirectories(cache) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kith-runtime-permissions-"));
  const sourceParents = [root, path.join(root, "apps")];
  const packages = ["api", "worker", "web"];
  try {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "kith-runtime-fixture",
        private: true,
        packageManager: "pnpm@9.15.0",
      }),
    );
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await writeFile(
      path.join(root, "pnpm-lock.yaml"),
      'lockfileVersion: "9.0"\nimporters:\n  .: {}\n  apps/api: {}\n  apps/worker: {}\n  apps/web: {}\n',
    );
    await writeFile(path.join(root, "turbo.json"), JSON.stringify({ tasks: { start: { cache } } }));
    for (const service of packages) {
      const directory = path.join(root, "apps", service);
      await mkdir(directory, { recursive: true });
      sourceParents.push(directory);
      await writeFile(
        path.join(directory, "package.json"),
        JSON.stringify({
          name: `@fixture/${service}`,
          version: "0.0.0",
          scripts: { start: "node -e \"process.stdout.write('ready\\n')\"" },
        }),
      );
    }
    for (const imagePath of writablePaths.filter((item) => item.startsWith("/app/"))) {
      const directory = path.join(root, imagePath.slice("/app/".length));
      await mkdir(directory, { recursive: true });
      await chmod(directory, 0o750);
    }
    sourceParents.push(path.join(root, "apps/web/node_modules"));
    const sourceFiles = [
      path.join(root, "package.json"),
      path.join(root, "pnpm-workspace.yaml"),
      path.join(root, "pnpm-lock.yaml"),
      path.join(root, "turbo.json"),
      ...packages.map((service) => path.join(root, "apps", service, "package.json")),
    ];
    for (const file of sourceFiles) await chmod(file, 0o444);
    for (const directory of sourceParents) await chmod(directory, 0o555);
    for (const directory of sourceParents) {
      assert.equal((await stat(directory)).mode & 0o222, 0, "Application parents remain read-only");
    }
    const result = spawnSync(turboBinary, ["run", "start", "--env-mode=loose"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        PATH: process.env.PATH,
        CI: "1",
        TURBO_TELEMETRY_DISABLED: "1",
        TURBO_CACHE: "local:rw",
      },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok((await stat(path.join(root, ".turbo/cache"))).isDirectory());
    for (const service of cache ? packages : []) {
      const log = await readFile(
        path.join(root, "apps", service, ".turbo/turbo-start.log"),
        "utf8",
      );
      assert.match(log, /ready/);
    }
    for (const directory of sourceParents) {
      assert.equal((await stat(directory)).mode & 0o222, 0);
    }
  } finally {
    for (const directory of sourceParents) await chmod(directory, 0o750).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

for (const cache of [false, true]) {
  test(
    `non-root Turbo starts all services with read-only source and cache ${cache ? "enabled" : "disabled"}`,
    { skip: process.getuid?.() === 0 || process.platform === "win32" },
    async () => proveRuntimeDirectories(cache),
  );
}

test("Tini registers as a subreaper under the Fly process supervisor", () => {
  const entrypoint = JSON.parse(imageSource.match(/^ENTRYPOINT (\[.*\])$/m)?.[1] ?? "null");
  assert.deepEqual(entrypoint, ["/usr/bin/tini", "-s", "--", "/app/infra/fly/entrypoint.sh"]);
});
