import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const startScript = fileURLToPath(new URL("./start.sh", import.meta.url));
const requiredSecrets = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "ENCRYPTION_KEY",
  "SCREEN_PROXY_SECRET",
];

test("excludes root and nested private configuration from the remote build context", async () => {
  const ignoreFile = await readFile(new URL("../../.dockerignore", import.meta.url), "utf8");
  const patterns = ignoreFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const excluded = new Set(patterns);
  // These explicit rules protect both root-local deployment files and nested
  // app configuration. Keep this policy check offline; Docker COPY/export
  // acceptance separately verifies Docker's matching semantics.
  for (const pattern of [
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    ".tmp",
    "**/.tmp",
    ".claude",
    "**/.claude",
    "**/.impeccable/review",
    ".vercel",
    "**/.vercel",
    ".agents",
    ".codex",
    "outputs",
    "test-report",
    "verify-report",
  ]) {
    assert.ok(excluded.has(pattern), `Remote builds must exclude ${pattern}`);
  }
  assert.deepEqual(
    patterns.filter((pattern) => pattern.startsWith("!")),
    [],
    "Negated rules must not restore private files to the remote build context",
  );
});

test("uses explicit monorepo deployment paths without a config-relative Dockerfile override", async () => {
  const config = await readFile(new URL("./fly.toml", import.meta.url), "utf8");
  const docs = await readFile(new URL("../../docs/hosted-deployment.md", import.meta.url), "utf8");
  assert.doesNotMatch(config, /^\s*\[build\]\s*$/m);
  assert.match(docs, /fly deploy \. --app "\$KITH_BACKEND_APP" --config \.\/infra\/fly\/fly\.toml/);
  assert.match(docs, /--dockerfile \.\/infra\/fly\/Dockerfile --ignorefile \.\/\.dockerignore/);
  await Promise.all([
    access(new URL("./Dockerfile", import.meta.url)),
    access(new URL("../../.dockerignore", import.meta.url)),
    access(new URL("../../pnpm-lock.yaml", import.meta.url)),
  ]);
});

async function fixture(runTest) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kith-host-start-"));
  const log = path.join(dir, "commands.log");
  try {
    await writeFile(
      path.join(dir, "id"),
      `#!/bin/sh
printf "%s\\n" "\${TEST_UID:-1000}"
`,
    );
    await writeFile(
      path.join(dir, "pnpm"),
      `#!/bin/sh
if [ "\${ASSERT_NO_DEV_SECRETS:-}" = "1" ] && [ -n "\${RAKAZO_ALLOW_DEV_SECRETS:-}" ]; then exit 91; fi
printf "pnpm:%s\\n" "$*" >> "$START_LOG"
if [ "$1" = "db:migrate" ]; then exit "\${MIGRATION_EXIT:-0}"; fi
printf "host:%s\\n" "$RAKAZO_HOST" >> "$START_LOG"
`,
    );
    await chmod(path.join(dir, "id"), 0o755);
    await chmod(path.join(dir, "pnpm"), 0o755);
    const env = {
      PATH: `${dir}:/usr/bin:/bin`,
      START_LOG: log,
      FLY_APP_NAME: "kith-fixture",
      WEB_ORIGIN: "https://app.example.com",
      BETTER_AUTH_URL: "https://app.example.com",
      ...Object.fromEntries(requiredSecrets.map((key) => [key, "fake-offline-test-secret"])),
    };
    const run = (overrides = {}) => {
      const result = spawnSync("/bin/sh", [startScript], {
        env: { ...env, ...overrides },
        encoding: "utf8",
      });
      assert.equal(result.error, undefined);
      return result;
    };
    await runTest({ run, log });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("migrates before starting the supervised host as the non-root runtime user", async () => {
  await fixture(async ({ run, log }) => {
    assert.equal(run().status, 0);
    assert.equal(
      await readFile(log, "utf8"),
      "pnpm:db:migrate\npnpm:start:host\nhost:kith-fixture.fly.dev\n",
    );
  });
});

test("does not serve traffic if database migrations fail", async () => {
  await fixture(async ({ run, log }) => {
    assert.equal(run({ MIGRATION_EXIT: "7" }).status, 7);
    assert.equal(await readFile(log, "utf8"), "pnpm:db:migrate\n");
  });
});

test("does not carry static-build development-secret defaults into production", async () => {
  await fixture(async ({ run }) => {
    assert.equal(run({ RAKAZO_ALLOW_DEV_SECRETS: "1", ASSERT_NO_DEV_SECRETS: "1" }).status, 0);
  });
});

test("preserves an explicit gateway host", async () => {
  await fixture(async ({ run, log }) => {
    assert.equal(run({ RAKAZO_HOST: "gateway.example.com" }).status, 0);
    assert.match(await readFile(log, "utf8"), /host:gateway\.example\.com/);
  });
});

test("requires secrets and public origins before launching any service", async () => {
  for (const key of [...requiredSecrets, "WEB_ORIGIN", "BETTER_AUTH_URL"]) {
    await fixture(async ({ run, log }) => {
      const result = run({ [key]: "" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(key));
      assert.equal(result.stderr.includes("fake-offline-test-secret"), false);
      await assert.rejects(readFile(log), { code: "ENOENT" });
    });
  }
});

test("refuses to run migrations or backend services as root", async () => {
  await fixture(async ({ run, log }) => {
    const result = run({ TEST_UID: "0" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /without root privileges/);
    await assert.rejects(readFile(log), { code: "ENOENT" });
  });
});
