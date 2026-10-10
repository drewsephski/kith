import { I18nProvider } from "@lingui/react";
import type { EmailCard as EmailBlock, ThreadMessage } from "@rakazo/contracts";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EmailCard } from "../../src/components/EmailCard";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { applyUiAppearance } from "../../src/lib/ui-appearance";
import "../../src/styles.css";

const block: EmailBlock = {
  kind: "email",
  mode: "draft",
  draftId: "draft-fixture",
  email: {
    account: "work@example.test",
    from: "work@example.test",
    to: ["team@example.test"],
    cc: ["copy@example.test"],
    bcc: ["private@example.test"],
    subject: "Re: Project timeline",
    body: "Hi team,\n\nThanks for sending the updated timeline. I can review the proposal tomorrow and share feedback by Friday.\n\nCould you send the latest version before then?\n\nBest,\nAlex",
  },
};
const message: ThreadMessage = {
  id: "mail-preview",
  threadId: "thread-fixture",
  botId: "bot-fixture",
  role: "bot",
  seq: 1,
  blocks: [block],
  createdAt: "2026-10-09T12:00:00Z",
};
let latestAction: { edits?: { subject: string; body: string } } = {};
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (new URL(url, location.origin).pathname === "/rpc/threads/send") {
    const payload = JSON.parse(
      input instanceof Request ? await input.clone().text() : String(init?.body),
    ) as {
      json: { emailAction: typeof latestAction };
    };
    latestAction = payload.json.emailAction;
    return Response.json({
      json: { threadId: "thread-fixture", runId: "run-fixture", taskId: "task-fixture" },
    });
  }
  return realFetch(input, init);
};
applyUiAppearance();
function Fixture() {
  const [requested, setRequested] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-8">
      <h1 className="text-lg font-medium">Kith</h1>
      <p className="text-sm">I drafted a response for you to review.</p>
      <EmailCard
        block={block}
        message={
          requested
            ? {
                ...message,
                emailActions: [
                  {
                    blockIndex: 0,
                    runId: "run-fixture",
                    status: "queued",
                    email: { ...block.email, ...latestAction.edits },
                  },
                ],
              }
            : message
        }
        blockIndex={0}
        onUpdated={async () => setRequested(true)}
      />
      {requested ? (
        <p role="status" className="text-xs text-muted-foreground">
          Request queued
        </p>
      ) : null}
      <output data-testid="email-send-payload" className="hidden">
        {JSON.stringify(latestAction)}
      </output>
      <EmailCard
        block={{
          ...block,
          mode: "received",
          email: {
            ...block.email,
            from: "team@example.test",
            to: ["work@example.test"],
            cc: [],
            bcc: [],
            subject: "Project timeline",
            body:
              "Hi Alex,\n\nCan you review the updated proposal this week? Here is the reference: " +
              "long-reference-".repeat(35),
          },
        }}
        message={{ ...message, id: "received-preview" }}
        blockIndex={0}
      />
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
