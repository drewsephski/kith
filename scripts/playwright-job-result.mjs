import { readFileSync } from "node:fs";

// Only trusted workflow code classifies job metadata; artifact outcome files are
// diagnostics, never authority for whether required tests passed.
export function playwrightJobResult(pages) {
  const jobs = (Array.isArray(pages) ? pages : [pages]).flatMap((page) => page.jobs ?? []);
  const matches = jobs.filter((job) => job.name === "Web E2E / Web E2E");
  if (matches.length > 1) throw new Error("Expected at most one Playwright job");
  const result = matches.length === 0 ? "omitted" : matches[0].conclusion;
  if (!["success", "failure", "timed_out", "cancelled", "skipped", "omitted"].includes(result)) {
    throw new Error(`Unexpected Playwright job conclusion: ${result}`);
  }
  return {
    job_result: result,
    result,
    artifact_optional: String(["timed_out", "cancelled", "skipped", "omitted"].includes(result)),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const outputs = playwrightJobResult(JSON.parse(readFileSync(0, "utf8")));
  for (const [key, value] of Object.entries(outputs)) console.log(`${key}=${value}`);
}
