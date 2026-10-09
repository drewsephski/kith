import { I18nProvider } from "@lingui/react";
import type { ThreadMessage } from "@rakazo/contracts";
import { KithAvatar } from "@rakazo/ui-web";
import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { Composer, Transcript } from "../../src/pages/Shell";
import { CreateBotForm } from "../../src/pages/shell/bot-panel";
import "../../src/styles.css";

// This offline fixture renders production components with synthetic data.
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
const running = params.get("working") !== "off";
const streaming = params.get("streaming") === "on";
const assistantId = "layout-assistant";
const artifactTarget = { botId: assistantId };
const noop = () => undefined;
const resolve = async () => undefined;
const scrollPositions = new Map<string, { top: number; following: boolean }>();

function message(
  id: string,
  role: ThreadMessage["role"],
  text: string,
  seq: number,
): ThreadMessage {
  return {
    id,
    role,
    seq,
    threadId: "layout-thread",
    botId: role === "bot" ? assistantId : undefined,
    createdAt: `2026-10-09T10:00:${String(seq).padStart(2, "0")}.000Z`,
    blocks: [{ kind: "text", text }],
  };
}

const sampleMessages = [
  message("briefing", "bot", "## Tomorrow\n\nNo events tomorrow in your connected calendars.", 1),
  message("question", "user", "What do I have on the schedule for today?", 2),
  message("follow-up", "user", "And what should I prepare?", 3),
  message(
    "reply",
    "bot",
    "You have a clear morning. Here’s a simple plan for the afternoon:\n\n- Review the draft before your planning session.\n- Leave a little time between calls.\n\n### Your afternoon\n\n| Time | Event | Preparation |\n| --- | --- | --- |\n| 1:00 PM | Planning session | Review the draft |\n| 3:00 PM | Project check-in | Bring your open questions |",
    4,
  ),
  message("inbox", "user", "Any emails today?", 5),
];

function Conversation() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState(() =>
    params.has("long")
      ? [
          ...sampleMessages,
          message("long-user", "user", `A very long reference: ${"reference".repeat(70)}`, 6),
          message("long-reply", "bot", `A long reply: ${"detail".repeat(140)}`, 7),
        ]
      : streaming
        ? [
            ...sampleMessages,
            {
              ...message("progress:layout", "bot", "", 6),
              blocks: [
                { kind: "progress" as const, text: "Checking your inbox…", streaming: true },
              ],
            },
          ]
        : sampleMessages,
  );
  return (
    <div className="flex h-dvh min-w-0 bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-e border-sidebar-border bg-sidebar px-6 py-8 md:block">
        <span className="text-xl font-semibold tracking-tight">Kith.</span>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 px-5 py-4 md:px-10">
          <KithAvatar size={32} />
          <span className="font-medium">Kith</span>
        </header>
        <Transcript
          conversationKey="layout"
          scrollPositions={scrollPositions}
          scrollRef={scrollRef}
          scrollRequest={null}
          onScrollRequestHandled={noop}
          artifactTarget={artifactTarget}
          messages={messages}
          showToolActivity={false}
          olderCursor={null}
          loadingOlder={false}
          answerableAskMessageId={null}
          running={running}
          workingBots={
            running ? [{ botId: assistantId, name: "Kith", color: "ink", status: "running" }] : []
          }
          assistantId={assistantId}
          onLoadOlder={noop}
          onOpenBot={noop}
          onAnswer={resolve}
          onReply={noop}
          onQuote={noop}
          onReact={resolve}
          onJumpToMessage={noop}
          onOpenPeerMessages={noop}
          peerBot={() => ({ color: "ink", name: "Kith" })}
          onRefresh={resolve}
          onBotChanged={resolve}
          onAddRoutine={noop}
          voiceReady={false}
          speakingMessageId={null}
          onSpeak={noop}
          onOpenComputer={noop}
        />
        <Composer
          artifactTarget={artifactTarget}
          activeName="Kith"
          running={running}
          disabled={false}
          pendingAttachments={[]}
          sendError={null}
          runError={null}
          sending={false}
          fileInputRef={fileInputRef}
          onAttachmentPick={noop}
          onRemoveAttachment={noop}
          onSend={async (text) => {
            setMessages((current) => [
              ...current,
              message(`sent-${current.length}`, "user", text, current.length + 1),
            ]);
          }}
          onStop={resolve}
        />
      </main>
    </div>
  );
}

function Creation() {
  const [created, setCreated] = useState<
    Parameters<ComponentProps<typeof CreateBotForm>["onCreate"]>[0] | null
  >(null);
  const [cancelled, setCancelled] = useState(false);
  const attempts = useRef(0);
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-6 py-10 text-foreground md:py-16">
      <div className="w-full max-w-sm">
        {created || cancelled ? (
          <output data-testid="created-profile">
            {cancelled ? "Cancelled" : JSON.stringify(created)}
          </output>
        ) : (
          <CreateBotForm
            onCancel={() => setCancelled(true)}
            onCreate={async (input) => {
              attempts.current += 1;
              await new Promise((resolve) => window.setTimeout(resolve, 300));
              if (params.has("failure") && attempts.current === 1)
                throw new Error("Could not create bot");
              setCreated(input);
            }}
          />
        )}
      </div>
    </main>
  );
}

void bootstrapI18n("en").then(() => {
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <BrowserRouter>
        {params.get("view") === "create" ? <Creation /> : <Conversation />}
      </BrowserRouter>
    </I18nProvider>,
  );
});
