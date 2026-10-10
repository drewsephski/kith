import { I18nProvider } from "@lingui/react";
import type { ModelCatalogEntry, SpaceMemoryConfig } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { SettingsOverlay } from "../../src/pages/SettingsOverlay";
import "../../src/styles.css";

const catalog: ModelCatalogEntry[] = [
  {
    provider: "deepseek",
    providerName: "DeepSeek",
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    billing: "Uses your provider API key.",
    auth: "api-key",
    thinkingLevels: ["low", "medium", "high"],
  },
  ...Array.from({ length: 12 }, (_, index) => ({
    provider: `provider-${index}`,
    providerName: `Example provider ${index + 1}`,
    id: `model-${index}`,
    label: `Example model ${index + 1}`,
    billing: "Uses your provider API key.",
    auth: "api-key" as const,
  })),
];

// Real settings components with synthetic data; no API or credentials required.
const responses: Record<string, unknown> = {
  "/api/auth/account-security": {
    hasPassword: true,
    passwordChangeEnabled: true,
    freshOidcAuth: false,
    ssoLinked: false,
    emailDeletion: false,
    sso: null,
  },
  "/rpc/models/list": catalog,
  "/rpc/models/credentials": [
    { provider: "deepseek", label: "DeepSeek", modelId: "deepseek-chat", hasKey: true },
  ],
  "/rpc/models/backups": [],
  "/rpc/me": {
    userId: "fixture-user",
    spaceId: "fixture-space",
    defaultProvider: "deepseek",
    defaultModel: "deepseek-chat",
    hostCredentialProvider: null,
  },
  "/rpc/memory/list": [],
  "/rpc/approvalRules/list": [],
  "/rpc/autoReview/get": { enabled: false, checkerAvailable: false },
  "/rpc/voice/catalog": [
    { id: "elevenlabs", name: "ElevenLabs", description: "Voice", transcribe: true },
    { id: "fish-audio", name: "Fish Audio", description: "Voice", transcribe: false },
  ],
  "/rpc/voice/credentials": [],
  "/rpc/voice/status": { ready: false, provider: null },
  "/rpc/billing/status": { state: "active", seats: 1, canManage: false, hasCustomer: false },
  "/rpc/updater/status": {
    installKind: "sidecar",
    supported: true,
    running: false,
    imageTag: "v0.1.0",
    lastRun: null,
  },
};
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const path = new URL(url, location.origin).pathname;
  if (Object.hasOwn(responses, path)) {
    const value = responses[path];
    return new Response(JSON.stringify(path.startsWith("/rpc/") ? { json: value } : value), {
      headers: { "content-type": "application/json" },
    });
  }
  if (path.startsWith("/rpc/") || path.startsWith("/api/")) {
    return new Response(JSON.stringify({ message: "Unavailable in this fixture." }), {
      status: 501,
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input, init);
};

function SettingsFixture() {
  const [open, setOpen] = useState(true);
  const [avatarStyle, setAvatarStyle] = useState<"robot" | "organic">("robot");
  const [memoryConfig, setMemoryConfig] = useState<SpaceMemoryConfig | null>(null);
  return (
    <main className="min-h-dvh bg-background p-6 text-foreground">
      <Button onClick={() => setOpen(true)}>Settings</Button>
      {open ? (
        <SettingsOverlay
          name="Jamie"
          email="jamie@example.test"
          avatarStyle={avatarStyle}
          onAvatarStyleChange={async (style) => setAvatarStyle(style)}
          usage={{ runs: 2, inputTokens: 10, outputTokens: 1, totalTokens: 11 }}
          onUsageOpen={() => undefined}
          isDeploymentOwner
          billingEnabled
          sandboxProvider="none"
          memoryConfig={memoryConfig}
          onMemoryConfigChange={setMemoryConfig}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  );
}

void bootstrapI18n("en").then(() => {
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <SettingsFixture />
      </MemoryRouter>
    </I18nProvider>,
  );
});
