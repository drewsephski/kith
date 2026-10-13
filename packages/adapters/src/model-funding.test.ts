import type { AgentRuntime } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deploymentFundsModel,
  MANAGED_CHATGPT_CONNECTION_MESSAGE,
  modelExecutionMode,
  modelProviderExecutionError,
} from "./deployment-model.js";
import { createRunExecutor } from "./executor.js";
import { validateHostedModelConnection } from "./model-connect.js";
import {
  assertStoredModelCredentialAvailable,
  validateModelAuthAvailability,
} from "./model-selection.js";
import { modelSecretExecutionError, PiOAuthLogins, resolveModelAuth } from "./pi-oauth.js";

const scope = { userId: "fixture-user", spaceId: "fixture-space" };
const luna = { provider: "openrouter", model: "openai/gpt-6-luna" };
const byok = {
  id: "fixture-credential",
  userId: scope.userId,
  provider: "openrouter",
  secretId: "fixture-secret",
  label: "Fixture key",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function executor(
  input: {
    settingsModel?: string;
    credential?: boolean;
    missingSecret?: boolean;
    override?: { modelProvider: string; modelId: string; thinkingLevel: null };
  } = {},
) {
  const load = vi.fn(async () => "fixture-user-owned-api-key");
  const secret = vi.fn(async ({ where }: { where: { userId: string } }) =>
    !input.missingSecret && where.userId === scope.userId
      ? { id: byok.secretId, ciphertext: "fixture-ciphertext" }
      : null,
  );
  const prisma = {
    bot: { findFirst: vi.fn(async () => input.override ?? null) },
    deploymentSettings: {
      findUnique: vi.fn(async () =>
        input.settingsModel
          ? { defaultModelProvider: "openrouter", defaultModelId: input.settingsModel }
          : null,
      ),
    },
    spaceModelPreference: { findFirst: vi.fn(async () => null) },
    userModelCredential: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; provider: string } }) =>
        input.credential && where.userId === scope.userId && where.provider === byok.provider
          ? byok
          : null,
      ),
    },
    secret: { findFirst: secret },
    spaceMember: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; spaceId: string } }) =>
        where.userId === scope.userId && where.spaceId === scope.spaceId
          ? { userId: scope.userId }
          : null,
      ),
    },
  } as unknown as PrismaClient;
  const runtime = {
    describe: () => ({ capabilities: { scripted: false } }),
    run: vi.fn(),
  } as unknown as AgentRuntime;
  const value = createRunExecutor({
    prisma,
    runtime,
    secretStore: { load },
    deploymentModelKey: "fixture-deployment-key",
    deploymentModelConfigured: true,
    modelExecutionMode: "managed",
  } as unknown as Parameters<typeof createRunExecutor>[0]);
  return { value, load, secret, runtime, prisma };
}

afterEach(() => vi.unstubAllEnvs());

describe("model funding policy", () => {
  it("binds managed deployment funding to the configured Luna pair", () => {
    expect(deploymentFundsModel(luna.provider, luna.model, luna, "managed")).toBe(true);
    expect(deploymentFundsModel("openrouter", "anthropic/claude-sonnet-5", luna, "managed")).toBe(
      false,
    );
    expect(deploymentFundsModel("openai", luna.model, luna, "managed")).toBe(false);
    expect(
      deploymentFundsModel(
        "anthropic",
        "claude-sonnet-5",
        { provider: "anthropic", model: "claude-sonnet-5" },
        "managed",
      ),
    ).toBe(false);
  });

  it("preserves explicitly configured self-hosted deployment defaults", () => {
    const deployment = { provider: "anthropic", model: "claude-sonnet-5" };
    expect(
      deploymentFundsModel(deployment.provider, deployment.model, deployment, "self-hosted"),
    ).toBe(true);
    expect(
      deploymentFundsModel(deployment.provider, "claude-opus-4-6", deployment, "self-hosted"),
    ).toBe(false);
    expect(() => modelExecutionMode({ MODEL_EXECUTION_MODE: "invalid" })).toThrow(
      "MODEL_EXECUTION_MODE",
    );
  });

  it("allows a fresh account's Luna without loading user secrets", async () => {
    vi.stubEnv("PI_DEFAULT_PROVIDER", "openrouter");
    vi.stubEnv("PI_DEFAULT_MODEL", luna.model);
    const test = executor();
    expect(await test.value.resolveModel(scope)).toMatchObject({
      provider: luna.provider,
      id: luna.model,
      apiKey: "fixture-deployment-key",
      fundingSource: "deployment",
    });
    expect(test.load).not.toHaveBeenCalled();
    expect(test.runtime.run).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary same-provider deployment setting before inference", async () => {
    const test = executor({ settingsModel: "anthropic/claude-sonnet-5" });
    await expect(test.value.resolveModel(scope)).rejects.toThrow(
      "Connect that model provider first",
    );
    expect(test.runtime.run).not.toHaveBeenCalled();
  });

  it("uses only a user's key for supported delegated model selections", async () => {
    const test = executor({ credential: true });
    expect(await test.value.resolveConnectedModel(scope, "openrouter", luna.model)).toMatchObject({
      apiKey: "fixture-user-owned-api-key",
      fundingSource: "user",
    });
    expect(test.secret).toHaveBeenCalledWith({
      where: { id: byok.secretId, userId: scope.userId, spaceId: null },
    });
  });

  it("blocks a revoked secret, including fallbacks, instead of reusing deployment funding", async () => {
    const test = executor({ credential: true, missingSecret: true });
    await expect(test.value.resolveConnectedModel(scope, "openrouter", luna.model)).rejects.toThrow(
      "no longer available",
    );
    await expect(
      test.value.resolveConnectedModel(scope, "openrouter", luna.model, undefined, true),
    ).rejects.toThrow("Backup model credential is no longer available");
    expect(test.load).not.toHaveBeenCalled();
  });

  it("does not resolve another account's credential", async () => {
    const test = executor({ credential: true });
    await expect(
      test.value.resolveConnectedModel(
        { ...scope, userId: "other-user" },
        "openrouter",
        luna.model,
      ),
    ).rejects.toThrow("Connect that model provider first");
    expect(test.load).not.toHaveBeenCalled();
  });

  it("blocks existing managed Codex connections before decrypting plan tokens", async () => {
    const test = executor({
      override: { modelProvider: "openai-codex", modelId: "gpt-5.4", thinkingLevel: null },
    });
    await expect(test.value.resolveModel({ ...scope, botId: "fixture-bot" })).rejects.toThrow(
      MANAGED_CHATGPT_CONNECTION_MESSAGE,
    );
    expect(test.load).not.toHaveBeenCalled();
  });

  it("keeps local Codex connections available but blocks managed login and refresh", async () => {
    expect(modelProviderExecutionError("openai-codex", "self-hosted")).toBeUndefined();
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    const login = vi.fn();
    const oauth = new PiOAuthLogins(login);
    await expect(oauth.begin({ ...scope, provider: "openai-codex" })).rejects.toThrow(
      MANAGED_CHATGPT_CONNECTION_MESSAGE,
    );
    await expect(resolveModelAuth("ignored-plan-token", "openai-codex")).rejects.toThrow(
      MANAGED_CHATGPT_CONNECTION_MESSAGE,
    );
    expect(login).not.toHaveBeenCalled();
  });

  it("rechecks both a stored credential and Space membership before another request", async () => {
    const test = executor({ credential: true });
    const model = await test.value.resolveConnectedModel(scope, "openrouter", luna.model);
    await expect(model.assertCredentialAvailable?.()).resolves.toBeUndefined();
    await expect(
      assertStoredModelCredentialAvailable(test.prisma, scope.userId, byok, "other-space"),
    ).rejects.toThrow("no longer available");
    vi.mocked(test.prisma.userModelCredential.findFirst).mockResolvedValueOnce(null);
    await expect(model.assertCredentialAvailable?.()).rejects.toThrow("no longer available");
  });

  it("rejects managed ChatGPT plan tokens relabeled as keys or another OAuth provider", () => {
    const payload = Buffer.from(
      JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } }),
    ).toString("base64url");
    const token = `fixture.${payload}.signature`;
    expect(modelSecretExecutionError("openrouter", token, "managed")).toBe(
      MANAGED_CHATGPT_CONNECTION_MESSAGE,
    );
    expect(
      modelSecretExecutionError(
        "openai-compatible",
        JSON.stringify({
          kind: "openai_compatible",
          baseUrl: "https://example.test/v1",
          apiKey: token,
        }),
        "managed",
      ),
    ).toBe(MANAGED_CHATGPT_CONNECTION_MESSAGE);
    expect(
      validateModelAuthAvailability(
        "openrouter",
        luna.model,
        JSON.stringify({
          kind: "oauth",
          credential: {
            type: "oauth",
            access: token,
            refresh: "fixture-refresh",
            expires: Date.now() + 600000,
          },
        }),
      ),
    ).toBeTruthy();
  });

  it("validates a hosted OpenRouter key through authentication without inference", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: { limit: 5 } }), { status: 200 }));
    await expect(
      validateHostedModelConnection(
        { provider: "openrouter", plaintext: "fixture-user-key", modelId: luna.model },
        fetch,
      ),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://openrouter.ai/api/v1/auth/key",
      expect.objectContaining({
        headers: { Authorization: "Bearer fixture-user-key", Accept: "application/json" },
        redirect: "error",
      }),
    );
  });

  it("rejects an invalid hosted key without issuing an inference request", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      validateHostedModelConnection(
        { provider: "openrouter", plaintext: "fixture-revoked-key", modelId: luna.model },
        fetch,
      ),
    ).rejects.toThrow("provider rejected this API key");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cannot use an OAuth plan token for another provider's API-key-only model", () => {
    const token = JSON.stringify({
      kind: "oauth",
      credential: {
        type: "oauth",
        access: "fixture-access",
        refresh: "fixture-refresh",
        expires: Date.now() + 600_000,
      },
    });
    expect(validateModelAuthAvailability("google", "gemini-2.5-pro", token)).toBeTruthy();
  });
});
