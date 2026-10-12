import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { acceptanceOptions, isolateAcceptanceEnvironment } from "../acceptance/config.js";
import { ACCEPTANCE_SCENARIOS } from "../acceptance/fixtures.js";
import { guardAcceptanceNetwork } from "../acceptance/network.js";

async function main() {
  // Do not load .env: merely having credentials must never opt into paid tests.
  const options = acceptanceOptions(process.argv.slice(2));
  if (options.mode === "not-run") {
    console.log(
      options.list
        ? ACCEPTANCE_SCENARIOS.join("\n")
        : "NOT RUN: choose --offline, or explicitly opt into --live product acceptance",
    );
    return;
  }
  isolateAcceptanceEnvironment();
  const output = path.resolve(options.output);
  const dataDir = await mkdtemp(path.join(tmpdir(), "kith-product-acceptance-"));
  let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
  try {
    // Never accept DATABASE_URL from the operator; this CLI owns its entire database.
    postgres = await new PostgreSqlContainer("postgres:16-alpine").start();
    const databaseUrl = postgres.getConnectionUri();
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DATABASE_DIRECT_URL: databaseUrl,
      REALTIME_DATABASE_URL: databaseUrl,
    });
    execFileSync("pnpm", ["--filter", "@rakazo/db", "generate"], {
      stdio: "pipe",
      timeout: 120_000,
    });
    execFileSync("pnpm", ["--filter", "@rakazo/db", "exec", "prisma", "migrate", "deploy"], {
      stdio: "pipe",
      timeout: 120_000,
    });
    // Generation precedes imports which load Prisma's generated client.
    const { E2BSandboxProvider, FakeSandboxProvider, resolveRuntimeModel } = await import(
      "@rakazo/adapters"
    );
    const { runProductAcceptance } = await import("../acceptance/runner.js");
    const originalFetch = globalThis.fetch;
    const network =
      options.mode === "live"
        ? guardAcceptanceNetwork({
            modelOrigin: new URL(
              resolveRuntimeModel({
                provider: options.connection.provider,
                id: options.connection.modelId!,
                apiKey: options.connection.apiKey,
                baseUrl: options.connection.baseUrl,
                contextWindow: options.connection.contextWindow,
              }).model!.baseUrl,
            ).origin,
            e2b: options.sandbox === "e2b",
            maxRequests: options.maxCalls,
            deadline: Date.now() + options.maxRuntimeMs,
          })
        : undefined;
    if (network) globalThis.fetch = network.fetch;
    let report: Awaited<ReturnType<typeof runProductAcceptance>>;
    try {
      report = await runProductAcceptance({
        ...options,
        live: options.mode === "live",
        databaseUrl,
        dataDir,
        sandbox:
          options.mode === "live" && options.sandbox === "e2b"
            ? new E2BSandboxProvider(options.e2bApiKey!)
            : new FakeSandboxProvider(),
        physicalRequests: network ? () => network.requests : undefined,
        prepareCleanup: () => {
          if (network)
            globalThis.fetch = guardAcceptanceNetwork(
              {
                modelOrigin:
                  options.mode === "live"
                    ? new URL(
                        resolveRuntimeModel({
                          provider: options.connection.provider,
                          id: options.connection.modelId!,
                          apiKey: options.connection.apiKey,
                          baseUrl: options.connection.baseUrl,
                          contextWindow: options.connection.contextWindow,
                        }).model!.baseUrl,
                      ).origin
                    : "https://unused.example.test",
                e2b: options.sandbox === "e2b",
                maxRequests: 0,
                deadline: Date.now() + 60_000,
              },
              originalFetch,
            ).fetch;
        },
        save: async (result) => {
          await mkdir(path.dirname(output), { recursive: true });
          await writeFile(`${output}.tmp`, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
          await rename(`${output}.tmp`, output);
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    if (network) console.log(`Model HTTP requests: ${network.requests}`);
    for (const result of report.cases) console.log(`${result.scenario}: ${result.status}`);
    console.log(`Cleanup: ${report.cleanup}; model calls: ${report.modelCalls}`);
    if (report.status !== "passed") process.exitCode = 1;
  } finally {
    // Cleanup failures reject the command even when every scenario passed.
    try {
      await postgres?.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }
}
main().catch(() => {
  // Provider, parser and subprocess errors may contain credentials or private paths.
  console.error(
    "NOT PASSED: acceptance configuration, setup or cleanup failed. Check opt-in flags, private connection/pricing, budgets and Docker.",
  );
  process.exitCode = 1;
});
