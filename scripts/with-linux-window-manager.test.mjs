import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const wrapper = path.resolve("scripts/with-linux-window-manager.sh");
function fixture(openbox, xprop, command) {
  const directory = mkdtempSync(path.join(tmpdir(), "kith-wm-test-"));
  for (const [name, script] of Object.entries({ openbox, xprop, acceptance: command })) {
    const file = path.join(directory, name);
    writeFileSync(file, `#!/bin/bash\n${script}\n`);
    chmodSync(file, 0o755);
  }
  return {
    directory,
    run: () =>
      spawnSync("bash", [wrapper, "acceptance"], {
        env: {
          ...process.env,
          DISPLAY: ":fixture",
          PATH: `${directory}:${process.env.PATH}`,
          WM_FIXTURE: directory,
        },
        encoding: "utf8",
        timeout: 15000,
      }),
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("waits for the EWMH manager and preserves native acceptance failure", () => {
  const f = fixture(
    "exec sleep 60",
    `
if [[ "$*" == *"_NET_SUPPORTING_WM_CHECK"* ]]; then
  count=0
  [[ -f "$WM_FIXTURE/count" ]] && count=$(cat "$WM_FIXTURE/count")
  echo $((count+1)) > "$WM_FIXTURE/count"
  if ((count < 2)); then echo 'no such atom'; else echo 'window id # 0x123'; fi
elif [[ "$*" == *"_NET_WM_NAME"* ]]; then echo 'Openbox'
else echo '_NET_WM_STATE_HIDDEN'; fi`,
    `
test "$(cat "$WM_FIXTURE/count")" -ge 3 || exit 99
echo ran > "$WM_FIXTURE/result"
exit 23`,
  );
  try {
    const result = f.run();
    assert.equal(result.status, 23, result.stderr);
    assert.equal(readFileSync(path.join(f.directory, "result"), "utf8"), "ran\n");
  } finally {
    f.close();
  }
});

test("does not execute acceptance when the manager exits before readiness", () => {
  const f = fixture("exit 1", "echo 'no such atom'", "echo invalid-success; exit 0");
  try {
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exited before becoming ready/);
    assert.doesNotMatch(result.stdout, /invalid-success/);
  } finally {
    f.close();
  }
});
