import { I18nProvider } from "@lingui/react";
import type { TaskStarterReceipt as Receipt, Routine, RunActivityRow } from "@rakazo/contracts";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TaskStarterReceipt } from "../../src/components/task-starters/TaskStarterReceipt";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { ActivityList } from "../../src/pages/ActivityList";
import { draftFromRoutine, RoutineEditor } from "../../src/pages/RoutineEditor";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const view = params.get("view");
const receipt: Receipt = {
  id: "receipt-demo",
  runId: "run-demo",
  starter: "inbox_todos",
  status: "completed",
  createdAt: "2026-10-09T18:00:00Z",
  updatedAt: "2026-10-09T18:00:00Z",
  error: null,
  result: {
    kind: "inbox_todos",
    summary: "",
    warnings: [],
    sources: [
      {
        id: "source-demo",
        connectionId: "connection-demo",
        title: "Launch checklist",
        url: null,
        retrievedAt: "2026-10-09T18:00:00Z",
      },
    ],
    actions: [
      {
        id: "todo-demo",
        title: "Review launch checklist",
        notes: "",
        dueDate: "2026-10-09",
        priority: "normal",
        reason: "Review the checklist before launch.",
        sourceIds: ["source-demo"],
        savedItemId: null,
      },
    ],
  },
};
const routine: Routine = {
  id: "routine-demo",
  botId: "bot-demo",
  name: "Launch review",
  prompt: "Review the launch checklist.",
  crons: ["@once"],
  timezone: "America/Chicago",
  active: true,
  notify: true,
  webhookEnabled: false,
  githubEnabled: false,
  messageProvider: null,
  modelProvider: null,
  modelId: null,
  thinkingLevel: null,
  lastRunAt: null,
  nextRunAt: null,
  createdAt: "2026-10-09T18:00:00Z",
};
const activity: RunActivityRow = {
  runId: "run-demo",
  botId: "bot-demo",
  botName: "Launch review",
  groupId: null,
  groupName: null,
  threadId: "thread-demo",
  status: "completed",
  trigger: "user",
  notificationsEnabled: false,
  promptSnippet: "Review the launch checklist.",
  updatedAt: "2026-10-09T18:00:00Z",
};

// Keep this production-component fixture offline for visual QA and CI.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const path = new URL(url, location.origin).pathname;
  if (!path.startsWith("/rpc/")) return realFetch(input, init);
  let body: unknown = [];
  if (path === "/rpc/taskStarters/receipt") body = receipt;
  if (path === "/rpc/runs/list") {
    const request = (
      input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body))
    ) as { json: { filter: string } };
    body = { runs: request.json.filter === "recent" ? [activity] : [] };
  }
  if (path === "/rpc/routines/history") body = { runs: [], cursor: null };
  return new Response(JSON.stringify({ json: body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

function Fixture() {
  const [draft, setDraft] = useState({
    ...draftFromRoutine(routine),
    runAtLocal: "2026-10-09T09:30",
  });
  return (
    <main className="ml-auto min-h-screen w-full max-w-96 border-l border-border bg-background p-4 text-foreground">
      {view === "todos" ? (
        <TaskStarterReceipt receiptId={receipt.id} />
      ) : view === "activity" ? (
        <ActivityList onOpenRun={() => undefined} />
      ) : (
        <RoutineEditor
          draft={draft}
          onChange={setDraft}
          editing={routine}
          timezone={routine.timezone}
          webhook={{ path: "/hooks/demo", secret: null, configured: false }}
          githubPath=""
          messageProviders={[]}
          saving={false}
          running={false}
          error={null}
          onBack={() => undefined}
          onClose={() => undefined}
          onSave={() => undefined}
          onTestRun={() => undefined}
          onDelete={() => undefined}
          onEnsureWebhook={async () => undefined}
        />
      )}
    </main>
  );
}

document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
void bootstrapI18n().then(() =>
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>,
  ),
);
