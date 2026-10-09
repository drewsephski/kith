import { I18nProvider } from "@lingui/react";
import type { Bot } from "@rakazo/contracts";
import { Button, KithAvatar } from "@rakazo/ui-web";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import type { Panel } from "../../src/lib/right-panel-state";
import { BotSettings } from "../../src/pages/shell/bot-panel";
import { ConversationMenu } from "../../src/pages/shell/conversation-menu";
import "../../src/styles.css";

// Production controls with synthetic state and deterministic offline responses.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (new URL(url, location.origin).pathname.startsWith("/rpc/")) {
    return new Response(JSON.stringify({ json: [] }), {
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input, init);
};
const params = new URLSearchParams(location.search);
const bot: Bot = {
  id: "bot-1",
  spaceId: "space-1",
  name: "Kith",
  title: "",
  description: "",
  instructions: "",
  color: "ink",
  notifyOnFinish: true,
  pinned: false,
  sectionId: null,
  archivedAt: null,
  unread: false,
  parentBotId: null,
  memoryScope: null,
  threadId: "thread-1",
  preview: "",
  status: "idle",
  computerMode: "team",
  updatedAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  voiceId: null,
  autoSpeak: false,
  modelProvider: null,
  modelId: null,
  thinkingLevel: null,
  teamChatAmbientEnabled: false,
  teamChatRules: "",
  disabledBuiltinTools: [],
  webhookConfigured: false,
  spawnKey: null,
};

function Controls() {
  const [panel, setPanel] = useState<Panel>(null);
  const [saved, setSaved] = useState("");
  const [action, setAction] = useState("");
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl bg-background px-5 py-4 text-foreground">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <KithAvatar size={30} />
          <span className="truncate font-medium">Kith</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setPanel("connections")}
          >
            Connections
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setPanel("activity")}
          >
            Tasks
          </Button>
          <ConversationMenu inGroup={params.has("group")} showConnections onSelect={setPanel} />
        </div>
      </header>
      {panel === "settings" ? (
        <section
          aria-label="Settings"
          className="mx-auto mt-6 w-full max-w-sm rounded-xl bg-sidebar p-5"
        >
          <h2 className="text-sm font-medium">Settings</h2>
          <BotSettings
            bot={bot}
            memoryProviderConfigured={false}
            onSkillsChange={() => undefined}
            onSave={async (patch) => {
              await new Promise((resolve) => window.setTimeout(resolve, 150));
              if (params.has("save-error")) throw new Error("Could not save");
              setSaved(JSON.stringify(patch));
            }}
            onExport={async () => {
              if (params.has("export-error")) throw new Error("Could not export");
              setAction("export");
            }}
            onClear={() => setAction("clear")}
          />
        </section>
      ) : (
        <output data-testid="selected-panel">{panel}</output>
      )}
      <output data-testid="saved-profile" className="sr-only">
        {saved}
      </output>
      <output data-testid="conversation-action" className="sr-only">
        {action}
      </output>
    </main>
  );
}

void bootstrapI18n("en").then(() => {
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <Controls />
    </I18nProvider>,
  );
});
