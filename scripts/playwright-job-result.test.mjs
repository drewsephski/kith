import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { playwrightJobResult } from "./playwright-job-result.mjs";

for (const result of ["success", "failure", "timed_out", "cancelled", "skipped"]) {
  test(`preserves ${result} without inventing successful execution`, () => {
    const outputs = playwrightJobResult([
      { jobs: [{ name: "Production builds", conclusion: "failure" }] },
      { jobs: [{ name: "Web E2E / Web E2E", conclusion: result }] },
    ]);
    assert.equal(outputs.result, result);
    assert.equal(outputs.artifact_optional, String(!["success", "failure"].includes(result)));
  });
}
test("omission is distinct from skipped and passed", () => {
  assert.equal(playwrightJobResult({ jobs: [] }).result, "omitted");
});
test("ambiguous or nonterminal jobs fail closed", () => {
  const job = { name: "Web E2E / Web E2E", conclusion: "success" };
  assert.throws(() => playwrightJobResult({ jobs: [job, job] }));
  assert.throws(() => playwrightJobResult({ jobs: [{ ...job, conclusion: null }] }));
});
test("CLI produces real workflow outputs for cancelled jobs", () => {
  const run = spawnSync(process.execPath, ["scripts/playwright-job-result.mjs"], {
    input: JSON.stringify({ jobs: [{ name: "Web E2E / Web E2E", conclusion: "cancelled" }] }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /result=cancelled\n/);
  assert.match(run.stdout, /artifact_optional=true\n/);
});
