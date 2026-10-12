import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computerIntent, jevShadowDecision } from "@rakazo/adapters";
import { COMPUTER_ROUTING_FIXTURES } from "../computer-routing-fixtures.js";

// Synthetic fixtures only. Never load the application's .env or private conversation data.
const shadow = process.argv.includes("--jev-shadow");
const option = (name: string, fallback: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const maxCalls = Number(option("max-calls", "24"));
const maxUsd = Number(option("max-usd", "0.01"));
if (
  !Number.isInteger(maxCalls) ||
  maxCalls < 1 ||
  maxCalls > 24 ||
  !Number.isFinite(maxUsd) ||
  maxUsd <= 0 ||
  maxUsd > 0.01
)
  throw new Error("Evaluation limits must be 1–24 calls and at most USD 0.01");
if (shadow && !process.env.OPENROUTER_API_KEY)
  throw new Error("Shadow evaluation needs a server-side budget-limited OpenRouter key");
let calls = 0;
let chargedUsd = 0;
let unknownCost = false;
const rows = [];
for (const fixture of COMPUTER_ROUTING_FIXTURES) {
  const started = performance.now();
  const deterministic = computerIntent({ trigger: "user", resumed: false, ...fixture });
  const deterministicMs = performance.now() - started;
  // Reserve conservatively for the bounded request before each call; no retries.
  // The provider's reported cost is actual inference cost; sandbox billing is never inferred.
  const mayEvaluate = shadow && calls < maxCalls && !unknownCost && chargedUsd + 0.00025 <= maxUsd;
  const result = mayEvaluate
    ? await jevShadowDecision({
        mode: "shadow",
        sharingAllowed: true,
        apiKey: process.env.OPENROUTER_API_KEY,
        text: JSON.stringify({
          request: fixture.prompt,
          connectedSources: fixture.connectedSources ?? [],
          attachments: fixture.blocks?.map(({ kind }) => kind) ?? [],
        }),
      })
    : null;
  if (mayEvaluate) {
    calls++;
    if (result?.costUsd != null) chargedUsd += result.costUsd;
    else unknownCost = true; // Do not spend further after an unpriced or timed-out request.
  }
  rows.push({
    name: fixture.name,
    label: fixture.label,
    deterministic,
    deterministicMs,
    shadow: result,
    fallback: mayEvaluate && !result,
  });
}
const classified = rows.filter((row) => row.deterministic !== "uncertain");
const shadowRows = rows.filter((row) => row.shadow);
const report = {
  mode: shadow ? "synthetic_shadow" : "offline",
  productionEnabled: false,
  total: rows.length,
  deterministicClassified: classified.length,
  deterministicCorrect: classified.filter((row) => row.deterministic === row.label).length,
  deterministicAbstentions: rows.length - classified.length,
  falseComputerCandidates: rows.filter(
    (row) => row.deterministic === "computer_candidate" && row.label !== "computer_candidate",
  ).length,
  computerRequiredAbstentions: rows.filter(
    (row) => row.label === "computer_candidate" && row.deterministic === "uncertain",
  ).length,
  // An abstention keeps the existing full-agent catalog; it is not a denied computer task.
  extraModelCallsOnProductionPath: 0,
  shadowCalls: calls,
  shadowCorrect: shadowRows.filter((row) => row.shadow?.choice === row.label).length,
  chargedUsd,
  unknownCost,
  rows,
};
const output = path.resolve(option("output", "test-report/computer-routing/evaluation.json"));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    total: report.total,
    classified: report.deterministicClassified,
    correct: report.deterministicCorrect,
    abstentions: report.deterministicAbstentions,
    falseComputerCandidates: report.falseComputerCandidates,
    shadowCalls: calls,
    chargedUsd,
    unknownCost,
  }),
);
