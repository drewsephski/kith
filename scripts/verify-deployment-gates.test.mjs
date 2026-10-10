import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyDeploymentGates } from "./verify-deployment-gates.mjs";

const names = [
  "Lint",
  "Typecheck",
  "Production builds",
  "Unit tests",
  "Postgres journeys",
  "Web E2E / Web E2E",
  "Android native acceptance / Capture Android UI",
];
const jobs = names.map((name) => ({ name, conclusion: "success" }));
test("requires all critical exact-run checks, including native acceptance", () => {
  assert.doesNotThrow(() =>
    verifyDeploymentGates([{ jobs: jobs.slice(0, 3) }, { jobs: jobs.slice(3) }]),
  );
  for (const name of names) {
    for (const conclusion of ["failure", "cancelled", "skipped", null]) {
      assert.throws(() =>
        verifyDeploymentGates([
          { jobs: jobs.map((job) => (job.name === name ? { ...job, conclusion } : job)) },
        ]),
      );
    }
    assert.throws(() => verifyDeploymentGates([{ jobs: jobs.filter((job) => job.name !== name) }]));
  }
  assert.throws(() => verifyDeploymentGates([{ jobs: [...jobs, jobs[0]] }]));
});
