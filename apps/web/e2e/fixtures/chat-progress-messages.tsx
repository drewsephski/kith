import { I18nProvider } from "@lingui/react";
import type { ProductEvent, ThreadSnapshot } from "@rakazo/contracts";
import { isToolActivityBlock, withLiveStreamingProgress } from "@rakazo/core";
import { DEFAULT_GROK_BOT_COLOR } from "@rakazo/ui-web";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { RunStatus } from "../../src/components/ai/RunStatus";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { reduceThreadSnapshot } from "../../src/lib/thread-events";
import "../../src/styles.css";

const stream = new URLSearchParams(location.search).get("stream") !== "off";
const stages = ["thinking", "gmail", "drafts", "waiting", "complete", "cancelled"] as const;
type Stage = (typeof stages)[number];

function snapshotFor(stage: Stage): ThreadSnapshot {
  let snapshot: ThreadSnapshot = {
    threadId: "thread",
    botId: "bot",
    cursor: 0,
    olderCursor: null,
    run: null,
    messages: [],
  };
  let seq = 0;
  const apply = (type: string, payload: ProductEvent["payload"] = {}) => {
    snapshot = reduceThreadSnapshot(snapshot, {
      id: `event-${++seq}`,
      seq,
      type,
      payload,
      runId: "run",
      botId: "bot",
      threadId: "thread",
      spaceId: "space",
      createdAt: "2026-10-10T12:00:00.000Z",
    });
  };
  apply("thread.message.created", {
    messageId: "user",
    role: "user",
    blocks: [{ kind: "text", text: "Find unanswered emails and leave follow-ups as drafts." }],
  });
  apply("run.started", { trigger: "user" });
  apply("thread.message.created", {
    messageId: "acknowledgement",
    role: "bot",
    blocks: [
      {
        kind: "text",
        text: "I'll check the conversations and leave any needed follow-ups as unsent drafts.",
      },
    ],
  });
  apply("thread.progress", { text: "Thinking…", activity: true });
  if (stage !== "thinking") {
    apply("thread.progress", { text: "Checking Gmail", activity: true });
    apply("agent.tool.called", { name: "GMAIL_FETCH_EMAILS" });
  }
  if (stage === "drafts" || stage === "complete") {
    apply("thread.progress", { text: "Preparing drafts", activity: true });
    apply("agent.tool.called", { name: "GMAIL_CREATE_EMAIL_DRAFT" });
  }
  if (stage === "waiting") apply("run.waiting_input");
  if (stage === "cancelled") apply("run.cancelled");
  if (stage === "complete") {
    apply("thread.message.created", {
      messageId: "result",
      role: "bot",
      blocks: [{ kind: "text", text: "Saved two follow-up drafts. Nothing was sent." }],
    });
    apply("run.completed");
  }
  return withLiveStreamingProgress(snapshot, stream) ?? snapshot;
}

function Fixture() {
  const [stage, setStage] = useState<Stage>("thinking");
  const snapshot = snapshotFor(stage);
  const bots = [
    {
      botId: "bot",
      runId: "run",
      name: "Kith",
      color: DEFAULT_GROK_BOT_COLOR,
      status: snapshot.run?.status,
    },
  ];
  return (
    <main className="flex min-h-screen flex-col bg-background px-5 py-6 text-foreground">
      <nav aria-label="Fixture state" className="flex flex-wrap gap-2">
        {stages.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => setStage(state)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            {state}
          </button>
        ))}
      </nav>
      <div className="mx-auto mt-auto flex w-full max-w-3xl flex-col gap-5 py-8">
        {snapshot.messages.map((message) => {
          const text = message.blocks
            .filter(
              (block) =>
                (block.kind === "text" || block.kind === "progress") && !isToolActivityBlock(block),
            )
            .map((block) => block.text)
            .join("");
          return text ? (
            <div
              key={message.id}
              data-testid={message.role === "user" ? "user" : "response"}
              className={
                message.role === "user"
                  ? "self-end rounded-2xl bg-chat-user px-4 py-3"
                  : "leading-relaxed"
              }
            >
              {text}
            </div>
          ) : null;
        })}
        <RunStatus
          bots={bots}
          latestRun={snapshot.run}
          messages={snapshot.messages}
          assistantId="bot"
        />
      </div>
    </main>
  );
}

void bootstrapI18n("en").then(() =>
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>,
  ),
);
