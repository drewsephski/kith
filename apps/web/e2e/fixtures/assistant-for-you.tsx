import { I18nProvider } from "@lingui/react";
import { KithAvatar } from "@rakazo/ui-web";
import { createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { applyUiAppearance } from "../../src/lib/ui-appearance";
import { Composer } from "../../src/pages/Shell";
import { AssistantForYou } from "../../src/pages/shell/assistant-for-you";
import "../../src/styles.css";

// Real prompt strip and composer with synthetic offline connections and a long conversation.
const params = new URLSearchParams(location.search);
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const path = new URL(url, location.origin).pathname;
  if (path === "/rpc/connections/list" || path === "/rpc/connections/catalog") {
    if (params.has("error")) return new Response("Unavailable", { status: 500 });
    const rows = path.endsWith("/list")
      ? [
          {
            id: "gmail-fixture",
            connectorId: "composio",
            provider: "gmail",
            displayName: "Gmail",
            status: "connected",
            capabilities: [],
            createdAt: "2026-10-09T12:00:00Z",
          },
        ]
      : [];
    return Response.json({ json: rows });
  }
  return realFetch(input, init);
};
applyUiAppearance();

function Fixture() {
  const [suggestedDraft, setSuggestedDraft] = useState<{
    text: string;
    nonce: number;
  }>();
  return (
    <main className="isolate flex h-full min-h-0 min-w-0 flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center gap-3 px-5 md:px-10">
        <KithAvatar size={30} />
        <span>Kith</span>
      </header>
      <div className="relative flex min-h-0 flex-1">
        <div
          data-testid="transcript"
          className="rk-scroll kith-transcript flex min-h-0 flex-1 flex-col overflow-y-auto py-5 md:py-8"
        >
          {Array.from({ length: 15 }, (_, index) => (
            <div key={index} className="kith-conversation-item relative shrink-0">
              <p className="mb-4 ms-auto w-fit rounded-2xl bg-chat-user px-4 py-3">
                Help me plan the next milestone.
              </p>
              <p>Here is the outline. Review the options and let me know which to start with.</p>
            </div>
          ))}
        </div>
      </div>
      <AssistantForYou
        botId="assistant-fixture"
        onSuggest={(text) => setSuggestedDraft({ text, nonce: Date.now() })}
      />
      <Composer
        suggestedDraft={suggestedDraft}
        activeName="Kith"
        artifactTarget={{ botId: "bot-0" }}
        running={false}
        sending={false}
        pendingAttachments={[]}
        attachmentNotice={null}
        sendError={null}
        runError={null}
        runErrorId={null}
        onRunErrorPresented={() => {}}
        onDismissError={() => {}}
        fileInputRef={createRef()}
        onAttachmentPick={() => false}
        onRemoveAttachment={() => {}}
        onSend={async () => false}
        onStop={async () => {}}
      />
    </main>
  );
}

void bootstrapI18n("en").then(() => {
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>,
  );
});
