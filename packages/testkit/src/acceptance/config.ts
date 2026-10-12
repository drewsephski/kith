import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ModelConnectInputSchema } from "@rakazo/contracts";
import { validatePricing } from "../evals/measurement.js";

export function acceptanceOptions(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      live: { type: "boolean" },
      offline: { type: "boolean" },
      list: { type: "boolean" },
      connection: { type: "string" },
      pricing: { type: "string" },
      sandbox: { type: "string", default: "fake" },
      "max-usd": { type: "string" },
      "max-model-calls": { type: "string" },
      "max-computer-starts": { type: "string" },
      "max-runtime-ms": { type: "string" },
      output: { type: "string", default: "test-report/acceptance/product.json" },
    },
  });
  if (values.live && values.offline) throw new Error("Choose --live or --offline");
  if (!values.live && !values.offline) return { mode: "not-run" as const, list: values.list };
  if (values.list) return { mode: "not-run" as const, list: true };
  if (!["fake", "e2b"].includes(values.sandbox)) throw new Error("Choose --sandbox=fake or e2b");
  if (values.offline && values.sandbox !== "fake")
    throw new Error("Offline acceptance cannot use hosted computers");
  const bounded = (raw: string | undefined, fallback: number, limit: number) => {
    const value = Number(raw ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > limit)
      throw new Error("Acceptance budgets must be positive bounded integers");
    return value;
  };
  const limits = {
    maxCalls: bounded(values["max-model-calls"], 80, 500),
    maxStarts: bounded(values["max-computer-starts"], 4, 10),
    maxRuntimeMs: bounded(values["max-runtime-ms"], 600_000, 1_800_000),
  };
  if (values.offline)
    return { mode: "offline" as const, output: values.output, sandbox: "fake" as const, ...limits };
  if (env.VERIFY_PRODUCT_ACCEPTANCE !== "1")
    throw new Error("NOT RUN: live acceptance requires VERIFY_PRODUCT_ACCEPTANCE=1 and --live");
  if (
    !values.connection ||
    !values.pricing ||
    !values["max-usd"] ||
    !values["max-model-calls"] ||
    !values["max-computer-starts"] ||
    !values["max-runtime-ms"]
  )
    throw new Error(
      "NOT RUN: live acceptance requires connection, pricing and all four explicit budgets",
    );
  const maxUsd = Number(values["max-usd"]);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 100)
    throw new Error("NOT RUN: max-usd must be positive and at most 100");
  const read = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw new Error("NOT RUN: could not read private acceptance configuration");
    }
  };
  const connection = ModelConnectInputSchema.safeParse(read(values.connection));
  if (!connection.success || !connection.data.modelId || !connection.data.apiKey)
    throw new Error("NOT RUN: a valid explicit model connection and API key are required");
  const pricing = validatePricing(read(values.pricing));
  const e2bApiKey = values.sandbox === "e2b" ? env.E2B_API_KEY : undefined;
  if (values.sandbox === "e2b" && !e2bApiKey)
    throw new Error("NOT RUN: E2B_API_KEY is required for real computer acceptance");
  return {
    mode: "live" as const,
    output: values.output,
    sandbox: values.sandbox as "fake" | "e2b",
    connection: connection.data,
    pricing,
    e2bApiKey,
    maxUsd,
    ...limits,
  };
}

/** Never inherit deployment credentials, databases, OAuth, host tools or telemetry. */
export function isolateAcceptanceEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const keep = new Set([
    "PATH",
    "HOME",
    "TMPDIR",
    "SYSTEMROOT",
    "SystemRoot",
    "LANG",
    "LC_ALL",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "XDG_RUNTIME_DIR",
  ]);
  for (const key of Object.keys(env))
    if (!keep.has(key) && !key.startsWith("TESTCONTAINERS_")) delete env[key];
  Object.assign(env, {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "synthetic-acceptance-auth-secret-at-least-32-characters",
    ENCRYPTION_KEY: "synthetic-acceptance-encryption-key-at-least-32-characters",
    SANDBOX_SUPERVISOR_TOKEN: "synthetic-acceptance-supervisor-secret-at-least-32-characters",
    SCREEN_PROXY_SECRET: "synthetic-acceptance-screen-secret-at-least-32-characters",
    BETTER_AUTH_URL: "http://127.0.0.1:5173",
    WEB_ORIGIN: "http://127.0.0.1:5173",
    SIGNUPS_ENABLED: "true",
    SANDBOX_PROVIDER: "fake",
    CLOUD_AGENT_PROVIDER: "none",
    AGENT_RUNTIME: "pi",
    WAKEUP_DRIVER: "graphile",
    SECRET_STORE: "encrypted",
    MAX_TOOL_CALLS_PER_TURN: "24",
    WEB_PROVIDER: "fake",
    LOG_LEVEL: "off",
  });
}
