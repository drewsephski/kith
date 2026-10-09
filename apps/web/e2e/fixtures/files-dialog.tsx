import { I18nProvider } from "@lingui/react";
import { Button, KithAvatar } from "@rakazo/ui-web";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { ArtifactsPage } from "../../src/pages/Artifacts";
import "../../src/styles.css";

// The production dialog with synthetic files and deterministic offline RPC responses.
const params = new URLSearchParams(location.search);
const names = ["Weekly plan.md", "Research notes.md", `${"Long file name ".repeat(12)}.md`];
let items = names.map((name, index) => ({
  id: `file-${index}`,
  botId: "bot-1",
  groupId: null,
  runId: null,
  name,
  description: "Saved from the conversation",
  mimeType: "text/markdown",
  size: 128,
  version: index === 0 ? 2 : 1,
  versionCount: index === 0 ? 2 : 1,
  createdAt: "2026-10-09T12:00:00.000Z",
}));
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/rpc/")) return realFetch(input, init);
  const payload = request.method === "POST" ? (await request.json()).json : {};
  if (params.has("loading")) await new Promise((resolve) => setTimeout(resolve, 500));
  if (params.has("error") && path.endsWith("listSpace")) throw new Error("Files are unavailable");
  let json: unknown = {};
  if (path === "/rpc/bootstrap") {
    json = { bots: [{ id: "bot-1", name: "Kith", color: "ink", status: "idle" }] };
  } else if (path.endsWith("listSpace")) {
    json = { items: params.has("empty") ? [] : items, nextCursor: null };
  } else if (path.endsWith("listVersions")) {
    json = [
      { id: "file-0", version: 2, name: names[0], createdAt: "2026-10-09T12:00:00.000Z" },
      { id: "old-version", version: 1, name: names[0], createdAt: "2026-10-08T12:00:00.000Z" },
    ];
  } else if (path.endsWith("getById")) {
    json = {
      ...(items.find((item) => item.id === payload.artifactId) ?? items[0]),
      contentBase64: btoa(
        payload.artifactId === "old-version"
          ? "# Earlier plan\n\nAn earlier version."
          : "# This week\n\nMake room for the work that matters.\n\n- Finish the proposal\n- Review research\n- Plan next week",
      ),
    };
  } else if (path.endsWith("remove")) {
    items = items.filter((item) => item.id !== payload.artifactId);
  }
  return new Response(JSON.stringify({ json }), {
    headers: { "content-type": "application/json" },
  });
};

function FilesFixture() {
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <KithAvatar size={32} />
          <span className="font-medium">Kith</span>
        </div>
        <Button
          variant="ghost"
          onClick={() =>
            navigate("/app/artifacts", { state: { filesBackground: location.pathname } })
          }
        >
          Files
        </Button>
      </div>
      <div className="mx-auto max-w-xl px-6 pt-20">
        <h1 className="text-2xl font-medium">A little more room to think.</h1>
        <p className="mt-3 text-muted-foreground">
          Synthetic conversation for file navigation checks.
        </p>
        <input
          aria-label="Conversation draft"
          className="mt-8 w-full rounded-xl border border-border p-3"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      <Routes>
        <Route path="/app/artifacts" element={<ArtifactsPage />} />
        <Route path="/app/artifacts/:artifactId" element={<ArtifactsPage />} />
        <Route path="*" element={null} />
      </Routes>
    </main>
  );
}

void bootstrapI18n("en").then(() => {
  createRoot(document.getElementById("root")!).render(
    <I18nProvider i18n={i18n}>
      <BrowserRouter>
        <FilesFixture />
      </BrowserRouter>
    </I18nProvider>,
  );
});
