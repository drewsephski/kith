import { I18nProvider } from "@lingui/react";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import { AvatarStyleProvider, BotAvatar, Button, ConnectorIcon, Input } from "@rakazo/ui-web";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import TerminalApp from "../../src/components/computer/TerminalApp";
import { ThemeToggle } from "../../src/components/ThemeToggle";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { applyUiAppearance, watchUiAppearance } from "../../src/lib/ui-appearance";
import { GeneralSettingsPanels } from "../../src/pages/AccountSettingsOverlay";
import "../../src/styles.css";

applyUiAppearance();
watchUiAppearance();

function Fixture() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 flex items-center justify-between border-b border-border bg-sidebar px-4 py-3">
        <span>Kith</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(!settingsOpen)}>
            Settings
          </Button>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        {settingsOpen ? (
          <GeneralSettingsPanels
            name="Example"
            avatarStyle="organic"
            onAvatarStyleChange={() => Promise.resolve()}
          />
        ) : (
          <>
            <div
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              data-testid="theme-card"
            >
              <AvatarStyleProvider value="organic">
                <BotAvatar color="#3B82F6" identity="example" size={32} />
              </AvatarStyleProvider>
              <ChatMarkdown>{"Review **today’s notes** in `notes.md`."}</ChatMarkdown>
              <ConnectorIcon name="GitHub" />
            </div>
            <div className="flex h-52 min-h-0 flex-col overflow-hidden rounded-xl border border-border">
              <TerminalApp botId="fixture-bot" canUseShell={false} />
            </div>
            <Input aria-label="Message" placeholder="Message" />
          </>
        )}
      </main>
    </div>
  );
}

void bootstrapI18n("en").then(() => {
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>,
  );
});
