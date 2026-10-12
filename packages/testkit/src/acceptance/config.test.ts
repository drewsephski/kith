import { describe, expect, it } from "vitest";
import { acceptanceOptions, isolateAcceptanceEnvironment } from "./config.js";

describe("product acceptance safety", () => {
  it("does not activate live providers because keys or legacy flags exist", () => {
    expect(acceptanceOptions([], { E2B_API_KEY: "fixture", VERIFY_PROVIDERS: "1" }).mode).toBe(
      "not-run",
    );
    expect(() => acceptanceOptions(["--live"], { VERIFY_PRODUCT_ACCEPTANCE: "0" })).toThrow(
      "NOT RUN",
    );
    expect(() => acceptanceOptions(["--live"], { VERIFY_PRODUCT_ACCEPTANCE: "1" })).toThrow(
      "budgets",
    );
  });
  it("keeps offline execution bounded and refuses a live sandbox", () => {
    expect(acceptanceOptions(["--offline"]).mode).toBe("offline");
    expect(() => acceptanceOptions(["--offline", "--sandbox=e2b"])).toThrow("hosted");
    expect(() => acceptanceOptions(["--offline", "--max-model-calls=NaN"])).toThrow("budgets");
    expect(() => acceptanceOptions(["--offline", "--max-runtime-ms=0"])).toThrow("budgets");
    expect(() => acceptanceOptions(["--offline", "--live"])).toThrow("Choose");
  });
  it("removes inherited databases, connected accounts, model defaults and environment files", () => {
    const env = {
      PATH: "synthetic-path",
      HOME: "synthetic-home",
      DATABASE_URL: "production-placeholder",
      E2B_API_KEY: "fixture",
      COMPOSIO_API_KEY: "fixture",
      OPENROUTER_API_KEY: "fixture",
      PI_DEFAULT_CREDENTIALS: "fixture",
      AXIOM_TOKEN: "fixture",
      DOTENV_CONFIG_PATH: "fixture",
      DOCKER_HOST: "unix:///synthetic/docker.sock",
      TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: "/synthetic/docker.sock",
      XDG_RUNTIME_DIR: "/synthetic/runtime",
    };
    isolateAcceptanceEnvironment(env);
    expect(env.PATH).toBe("synthetic-path");
    expect(env.HOME).toBe("synthetic-home");
    expect(env.DOCKER_HOST).toBe("unix:///synthetic/docker.sock");
    expect(env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE).toBe("/synthetic/docker.sock");
    expect(env.XDG_RUNTIME_DIR).toBe("/synthetic/runtime");
    for (const key of [
      "DATABASE_URL",
      "E2B_API_KEY",
      "COMPOSIO_API_KEY",
      "OPENROUTER_API_KEY",
      "PI_DEFAULT_CREDENTIALS",
      "AXIOM_TOKEN",
      "DOTENV_CONFIG_PATH",
    ])
      expect(env).not.toHaveProperty(key);
  });
});
