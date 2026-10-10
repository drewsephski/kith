import { I18nProvider } from "@lingui/react";
import type { ForYouConversationAttempt, ForYouSuggestion } from "@rakazo/core";
import { startForYouConversation } from "@rakazo/core";
import { KithAvatar } from "@rakazo/ui-web";
import { createRef, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { applyUiAppearance } from "../../src/lib/ui-appearance";
import { ForYouPage } from "../../src/pages/ForYou";
import { Composer } from "../../src/pages/Shell";
import { KithSidebar } from "../../src/pages/shell/kith-sidebar";
import { WindowChrome } from "../../src/pages/WindowChrome";
import "../../src/styles.css";

// Production page, navigation, launch flow, and composer with deterministic offline actions.
applyUiAppearance("system");
const desktopFixture = new URLSearchParams(location.search).has("desktop-collapsed");
if (desktopFixture) {
  Object.defineProperty(window, "rakazoDesktop", {
    value: {
      platform: "linux",
      window: { close: async () => {}, minimize: async () => {}, toggleMaximize: async () => {} },
    },
    configurable: true,
  });
}
function Fixture() {
  const [sent, setSent] = useState<{ botId: string; text: string; clientNonce: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(desktopFixture);
  const [creates, setCreates] = useState(0);
  const pending = useRef(false);
  const failOnce = useRef(new URLSearchParams(location.search).has("send-error"));
  const attempts = useRef(new Map<string, ForYouConversationAttempt>());
  async function select(suggestion: ForYouSuggestion) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    let attempt = attempts.current.get(suggestion.id);
    if (!attempt) {
      attempt = { clientNonce: crypto.randomUUID() };
      attempts.current.set(suggestion.id, attempt);
    }
    try {
      await startForYouConversation(suggestion, "assistant-fixture", attempt, {
        create: async () => {
          setCreates((count) => count + 1);
          return { id: "conversation-fixture" };
        },
        send: async (input) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (failOnce.current) {
            failOnce.current = false;
            throw new Error("Could not send. Select the suggestion to retry.");
          }
          setSent(input);
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="relative flex h-full overflow-hidden bg-background text-foreground">
      <aside
        className={`${sidebarOpen ? "absolute inset-y-0 start-0 z-40 flex" : "hidden"} w-64 shrink-0 flex-col border-e border-sidebar-border bg-sidebar md:static ${sidebarCollapsed ? "md:hidden" : "md:flex"}`}
      >
        <KithSidebar
          assistantId="assistant-fixture"
          bots={[]}
          groups={[]}
          forYouOpen={!sent}
          onForYou={() => {
            setSent(undefined);
            setSidebarOpen(false);
          }}
          onOpenBot={() => {}}
          onOpenGroup={() => {}}
          onContextMenu={() => {}}
          onArchive={() => {}}
          onSearch={() => {}}
          onCollapse={() => setSidebarOpen(false)}
          onNewThread={() => {}}
          onMemory={() => {}}
          onActivity={() => {}}
          onArtifacts={() => {}}
          onIntegrations={() => {}}
          onSettings={() => {}}
          onAdvanced={() => {}}
          creating={busy}
        />
      </aside>
      <main className="isolate flex min-h-0 min-w-0 flex-1 flex-col">
        {sent ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 px-5">
              <KithAvatar size={30} />
              <span>New conversation</span>
            </header>
            <div className="rk-scroll min-h-0 flex-1 overflow-y-auto px-5 py-8">
              <p
                data-testid="sent-prompt"
                className="ms-auto max-w-2xl rounded-2xl bg-chat-user px-4 py-3"
              >
                {sent.text}
              </p>
            </div>
            <Composer
              activeName="Kith"
              artifactTarget={{ botId: sent.botId }}
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
          </>
        ) : (
          <ForYouPage
            onSelect={(suggestion) => void select(suggestion)}
            busy={busy}
            error={error}
            onOpenNavigation={() => setSidebarOpen(true)}
            onShowSidebar={sidebarCollapsed ? () => setSidebarCollapsed(false) : undefined}
            windowChrome={sidebarCollapsed && desktopFixture ? <WindowChrome /> : undefined}
          />
        )}
        <output data-testid="created-count" className="sr-only">
          {creates}
        </output>
        <output data-testid="sent-target" className="sr-only">
          {sent?.botId}
        </output>
      </main>
    </div>
  );
}
void bootstrapI18n("en").then(() =>
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>,
  ),
);
