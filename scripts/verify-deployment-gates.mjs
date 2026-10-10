import { readFileSync } from "node:fs";

export function verifyDeploymentGates(pages) {
  const jobs = pages.flatMap((page) => page.jobs);
  for (const name of [
    "Lint",
    "Typecheck",
    "Production builds",
    "Unit tests",
    "Postgres journeys",
    "Web E2E / Web E2E",
    "Android native acceptance / Capture Android UI",
  ]) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].conclusion !== "success") {
      throw new Error(`Deployment blocked: required job ${name} did not pass`);
    }
  }
}

if (process.argv[1]?.endsWith("verify-deployment-gates.mjs")) {
  verifyDeploymentGates(JSON.parse(readFileSync(process.argv[2], "utf8")));
}
