import { getEnvApiKey } from "@earendil-works/pi-ai/compat";
import { resolveModelExecutionMode } from "@rakazo/db";

export const DEFAULT_OPENROUTER_MODEL_ID = "openai/gpt-6-luna";

/**
 * What Pi reports for a provider that authenticates from the host instead of a key: an AWS
 * profile or task role for Amazon Bedrock, Application Default Credentials for Vertex.
 */
const HOST_CREDENTIALS = "<authenticated>";

/** What a provider's host credentials are, for telling a user what a deployment runs on. */
const HOST_CREDENTIAL_SOURCES: Record<string, string> = {
  "amazon-bedrock": "AWS IAM",
  "google-vertex": "Google Cloud",
};

/** The kind of host credentials a provider authenticates with, e.g. "AWS IAM". */
export function hostCredentialSource(provider: string): string {
  return HOST_CREDENTIAL_SOURCES[provider] ?? "host";
}

/**
 * The deployment-wide model default: which provider a run falls back to when no user
 * credential applies, and the key for that provider.
 *
 * Keyless host authentication requires explicit opt-in and a model id. Bedrock resolves
 * its credential chain (including instance roles) at request time; other providers must
 * report host credentials in the process environment. Host credentials never become `key`.
 *
 * Vendor env names and model ids live here, in the adapter layer, not in core.
 */
export function resolveDeploymentModel(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.PI_DEFAULT_PROVIDER?.trim() || "openrouter";
  // A row per provider that ships a deployment key. A third one adds a row here, not a
  // branch at each call site — and an unknown provider gets no key rather than another
  // vendor's, which a ternary on one provider would not give.
  const keys: Record<string, string | undefined> = {
    openrouter: env.OPENROUTER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  };
  const models: Record<string, string> = {
    openrouter: DEFAULT_OPENROUTER_MODEL_ID,
    anthropic: "claude-sonnet-5",
  };
  const explicitModel = env.PI_DEFAULT_MODEL?.trim();
  const key = keys[provider];
  const hostCredentials =
    !key &&
    Boolean(explicitModel) &&
    env.PI_DEFAULT_CREDENTIALS?.trim() === "host" &&
    // Bedrock also resolves EC2 instance roles through IMDS at request time.
    (provider === "amazon-bedrock" || getEnvApiKey(provider) === HOST_CREDENTIALS);
  return {
    provider,
    model: explicitModel || models[provider] || models.openrouter!,
    key,
    configured: Boolean(key) || hostCredentials,
    hostCredentials,
  };
}

/** A managed service may not execute user subscription tokens on its shared servers. */
export type ModelExecutionMode = "managed" | "self-hosted";

export function modelExecutionMode(env: NodeJS.ProcessEnv = process.env): ModelExecutionMode {
  return resolveModelExecutionMode(env);
}

export const MANAGED_CHATGPT_CONNECTION_MESSAGE =
  "ChatGPT plan connections require a local or self-hosted Kith server. Use an OpenAI API key on hosted Kith.";

export function modelProviderExecutionError(
  provider: string,
  mode: ModelExecutionMode = modelExecutionMode(),
): string | undefined {
  return mode === "managed" && provider === "openai-codex"
    ? MANAGED_CHATGPT_CONNECTION_MESSAGE
    : undefined;
}

/** Host SDK transports must receive a real per-request key on the managed server. */
export function modelProviderApiKeyError(
  provider: string,
  apiKey: string | undefined,
  mode: ModelExecutionMode = modelExecutionMode(),
): string | undefined {
  if (mode !== "managed" || !Object.hasOwn(HOST_CREDENTIAL_SOURCES, provider)) return undefined;
  const key = apiKey?.trim();
  // Pi's Vertex transport treats this literal as ADC, not as an API key.
  const vertexHostMarker = provider === "google-vertex" && key === "gcp-vertex-credentials";
  return !key || vertexHostMarker || /^<[^>]+>$/.test(key)
    ? "Connect a user-owned API key for this provider. Host credentials require a self-hosted Kith server."
    : undefined;
}

/** Deployment funding is bound to one provider AND model, never a provider-wide key. */
export function deploymentFundsModel(
  provider: string,
  modelId: string,
  deployment: Pick<ReturnType<typeof resolveDeploymentModel>, "provider" | "model">,
  mode: ModelExecutionMode = modelExecutionMode(),
): boolean {
  return (
    provider === deployment.provider &&
    modelId === deployment.model &&
    (mode !== "managed" || (provider === "openrouter" && modelId === DEFAULT_OPENROUTER_MODEL_ID))
  );
}
