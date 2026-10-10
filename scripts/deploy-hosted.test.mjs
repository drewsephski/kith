import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const source = "a".repeat(40);
const previous = `registry.example.test/backend@sha256:${"b".repeat(64)}`;

function fixture(failure = "", delayed = false) {
  const directory = mkdtempSync(path.join(tmpdir(), "kith-rollout-test-"));
  const scripts = {
    git: `[[ "$1" == rev-parse ]] && echo "$EXPECTED_SHA"; exit 0`,
    sleep: "exit 0",
    curl: `
echo "curl \${*: -1}" >> "$FIXTURE/log"
if [[ ! -f "$FIXTURE/deployed" && "$FAILURE" == preflight ]]; then exit 1; fi
if [[ -f "$FIXTURE/deployed" && ! -f "$FIXTURE/rolled-back" ]]; then
  [[ "$FAILURE" == health && "\${*: -1}" == */health ]] && exit 1
  [[ "$FAILURE" == auth && "\${*: -1}" == */capabilities ]] && exit 1
fi
if [[ -f "$FIXTURE/rolled-back" && "$FAILURE" == rollback-starting ]]; then
  count=0
  [[ -f "$FIXTURE/recovery-attempts" ]] && count=$(cat "$FIXTURE/recovery-attempts")
  echo $((count + 1)) > "$FIXTURE/recovery-attempts"
  [[ "$count" -lt 2 ]] && exit 1
fi
if [[ "\${*: -1}" == */health ]]; then echo '{"ok":true}'
else echo '{"passwordAuth":true,"passwordReset":true}'; fi`,
    flyctl: `
echo "flyctl $*" >> "$FIXTURE/log"
case "$1" in
  status) echo '{"Machines":[{"image_ref":{"registry":"registry.example.test","repository":"backend","digest":"sha256:${"b".repeat(64)}"}}]}' ;;
  deploy)
    if [[ "$*" == *--image* ]]; then
      [[ "$FAILURE" == rollback ]] && exit 1
      touch "$FIXTURE/rolled-back"
    else
      touch "$FIXTURE/deployed"
      [[ "$FAILURE" == deploy ]] && exit 1
    fi ;;
  ssh)
    count=0
    [[ -f "$FIXTURE/attempts" ]] && count=$(cat "$FIXTURE/attempts")
    echo $((count + 1)) > "$FIXTURE/attempts"
    [[ "$FAILURE" == runtime || "$FAILURE" == rollback || "$FAILURE" == rollback-starting ]] && exit 1
    [[ "$DELAYED" == true && "$count" -lt 2 ]] && exit 1 ;;
esac
exit 0`,
  };
  for (const [name, content] of Object.entries(scripts)) {
    const file = path.join(directory, name);
    writeFileSync(file, `#!/bin/bash\n${content}\n`);
    chmodSync(file, 0o755);
  }
  return {
    run: () =>
      spawnSync("bash", ["scripts/deploy-hosted.sh"], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          FIXTURE: directory,
          FAILURE: failure,
          DELAYED: String(delayed),
          EXPECTED_SHA: source,
          FLY_APP: "kith-fixture",
          HOSTED_ORIGIN: "https://api.example.test",
          GITHUB_STEP_SUMMARY: path.join(directory, "summary"),
        },
        encoding: "utf8",
        timeout: 15000,
      }),
    log: () => readFileSync(path.join(directory, "log"), "utf8"),
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("waits for supervised startup before reporting exact-source success", () => {
  const f = fixture("", true);
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.log().match(/flyctl ssh/g)?.length, 3);
    assert.doesNotMatch(f.log(), /--image/);
  } finally {
    f.close();
  }
});

for (const failure of ["runtime", "health", "auth", "deploy", "rollback-starting"]) {
  test(`restores the immutable prior image after ${failure} failure and keeps the job failed`, () => {
    const f = fixture(failure);
    try {
      const result = f.run();
      assert.equal(result.status, 1, result.stderr);
      assert.ok(f.log().includes(`--image ${previous}`));
      assert.ok(f.log().includes("--update-only"));
      assert.match(f.log().split("--image")[1], /curl https:\/\/api\.example\.test\/health/);
      assert.doesNotMatch(f.log(), /migrate|secrets|destroy|volumes/);
    } finally {
      f.close();
    }
  });
}

test("never deploys or rolls back when authentication preflight fails", () => {
  const f = fixture("preflight");
  try {
    assert.notEqual(f.run().status, 0);
    assert.doesNotMatch(f.log(), /flyctl/);
  } finally {
    f.close();
  }
});

test("reports a failed rollback without claiming recovery", () => {
  const f = fixture("rollback");
  try {
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Rollback failed/);
  } finally {
    f.close();
  }
});
