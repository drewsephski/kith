import { I18nProvider } from "@lingui/react";
import type { Bot, ComputerUpdate } from "@rakazo/contracts";
import { Button, KithAvatar, Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web";
import { Menu, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RunStatus } from "../../src/components/ai/RunStatus";
import { ComputerUpdateProgress } from "../../src/components/ComputerUpdateProgress";
import { ConnectionsPanel } from "../../src/components/integrations/ConnectionsPanel";
import { ToolSteps } from "../../src/components/ToolActivityDisclosure";
import { computerUpdates } from "../../src/lib/computer-updates";
import { bootstrapI18n, i18n } from "../../src/lib/i18n";
import { applyUiAppearance } from "../../src/lib/ui-appearance";
import { ResizableSidePanel } from "../../src/pages/ResizableSidePanel";
import { BotCreatePicker } from "../../src/pages/shell/bot-picker";
import { KithSidebar } from "../../src/pages/shell/kith-sidebar";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const bot: Bot = {
  id: "assistant",
  name: "Kith",
  status: "completed",
  updatedAt: "2026-10-12T12:00:00Z",
} as Bot;
let operation: ComputerUpdate = {
  id: "recovery",
  botId: bot.id,
  name: "Kith",
  mode: "team",
  action: "recover",
  status: "running",
  stage: "restoring",
};
const connection = {
  id: "calendar-account",
  connectorId: "composio",
  provider: "googlecalendar",
  displayName: "Google Calendar",
  status: "connected",
  capabilities: [],
  createdAt: "2026-10-12T12:00:00Z",
};
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const path = new URL(input instanceof Request ? input.url : String(input), location.origin)
    .pathname;
  if (path === "/rpc/computer/cancelUpdate") operation = { ...operation, status: "cancelled" };
  const values: Record<string, unknown> = {
    "/rpc/connections/list": [connection],
    "/rpc/connections/catalog": [],
    "/rpc/calendar/status": {
      configured: true,
      directConfigured: false,
      managedConnectorId: "composio",
      managedConnectionId: null,
      managedConnections: [{ id: connection.id, displayName: connection.displayName }],
      canConfigure: false,
      redirectUri: "https://example.test/callback",
      connectionId: null,
      status: "disconnected",
    },
    "/rpc/calendar/agenda": {
      unavailable: params.has("unavailable"),
      snapshots: params.has("unavailable")
        ? []
        : [
            {
              date: "2026-10-12",
              timezone: "America/Chicago",
              timeMin: "2026-10-12T12:00:00Z",
              timeMax: "2026-10-19T12:00:00Z",
              retrievedAt: "2026-10-12T12:00:00Z",
              sources: [],
              events: [
                {
                  id: "event",
                  calendarId: "primary",
                  title: "Product planning and accessibility review",
                  start: "2026-10-13T16:00:00Z",
                  end: "2026-10-13T17:00:00Z",
                  allDay: false,
                  url: "https://calendar.google.com/calendar/event?eid=fixture",
                  location: "Video call",
                  description: null,
                  recurringEventId: null,
                  busy: true,
                  response: null,
                },
              ],
            },
          ],
    },
    "/rpc/memory/list": [],
    "/rpc/computer/updates": params.has("recovery") ? [operation] : [],
    "/rpc/computer/cancelUpdate": { ok: true },
    "/rpc/computer/dismissUpdate": { ok: true },
  };
  if (Object.hasOwn(values, path)) return Response.json({ json: values[path] });
  if (path.startsWith("/rpc/")) return new Response("Unavailable in this fixture", { status: 501 });
  return realFetch(input, init);
};
applyUiAppearance();
function Fixture() {
  const [navigation, setNavigation] = useState(false);
  const [panel, setPanel] = useState(params.has("calendar"));
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState("");
  const [restoredPanel, setRestoredPanel] = useState(false);
  useEffect(() => {
    const restore = () => setRestoredPanel(true);
    window.addEventListener("fixture:restore-panel", restore);
    return () => window.removeEventListener("fixture:restore-panel", restore);
  }, []);
  const close = () => setNavigation(false);
  const creationMenu = (
    <Popover open={menu} onOpenChange={setMenu}>
      <PopoverTrigger
        render={<Button variant="ghost" className="h-10 w-full justify-start gap-3 px-3" />}
      >
        <Plus size={16} />
        New
      </PopoverTrigger>
      <PopoverContent align="start">
        <BotCreatePicker
          bots={[bot]}
          onCreateBot={() => {
            setSelected("Create bot");
            setMenu(false);
          }}
          onOpenBot={() => setMenu(false)}
          onCreateGroup={() => {
            setSelected("Create group");
            setMenu(false);
          }}
          onCreateSpace={() => {
            setSelected("Create space");
            setMenu(false);
          }}
          onShowGroupInfo={() => {}}
          onShowSpaceInfo={() => {}}
        />
      </PopoverContent>
    </Popover>
  );
  return (
    <main className="relative flex h-dvh min-w-0 overflow-hidden bg-background text-foreground">
      <aside
        className={`${navigation ? "flex" : "hidden"} absolute inset-y-0 start-0 z-20 w-[260px] flex-col border-e border-sidebar-border bg-sidebar md:static md:flex`}
      >
        <KithSidebar
          assistantId={bot.id}
          bots={[bot]}
          groups={[]}
          activeId={bot.id}
          activeDetail={panel ? "connections" : null}
          onOpenBot={close}
          onOpenGroup={close}
          onContextMenu={() => {}}
          onArchive={() => {}}
          onSearch={close}
          onCollapse={close}
          onNewThread={close}
          creationMenu={creationMenu}
          onMemory={close}
          onActivity={close}
          onArtifacts={close}
          onIntegrations={() => {
            setPanel(true);
            close();
          }}
          onSettings={close}
          onAdvanced={() => setSelected("Workspace")}
          creating={false}
          onForYou={close}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 px-5">
          <Button
            className="md:hidden"
            size="icon-sm"
            variant="ghost"
            aria-label="Open navigation"
            onClick={() => setNavigation(true)}
          >
            <Menu size={18} />
          </Button>
          <KithAvatar size={30} />
          Kith
        </header>
        <div className="rk-scroll min-h-0 flex-1 overflow-y-auto px-5 py-8 md:px-10">
          <div className="mx-auto max-w-2xl space-y-8">
            <p className="ms-auto w-fit rounded-2xl bg-chat-user px-4 py-3">
              Review my upcoming schedule.
            </p>
            <p>Your next event is ready to review. I saved your preferences for future planning.</p>
            <ToolSteps
              steps={[
                {
                  label:
                    "Reviewing your connected calendar and checking the complete event description, attendees, and preparation details",
                  count: 1,
                },
              ]}
            />
            <RunStatus bots={[]} messages={[]} latestRun={{ id: "run", status: "completed" }} />
            {selected ? <p role="status">{selected}</p> : null}
            {params.has("recovery") ? (
              <Button onClick={() => computerUpdates.open(operation.id)}>Show recovery</Button>
            ) : null}
          </div>
        </div>
        <div className="mx-5 mb-5 rounded-2xl border border-border bg-card px-4 py-3 text-muted-foreground">
          Message Kith
        </div>
      </div>
      {panel ? (
        <aside className="rk-scroll absolute inset-y-0 end-0 z-10 w-full max-w-96 overflow-y-auto border-s border-border bg-card p-5 md:static">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-medium">Integrations</h2>
            <Button variant="ghost" size="sm" onClick={() => setPanel(false)}>
              Close
            </Button>
          </div>
          <ConnectionsPanel botId={bot.id} />
        </aside>
      ) : null}
      <ComputerUpdateProgress onCompleted={() => setSelected("Computer refreshed")} />
      {params.has("panel-focus") ? (
        <ResizableSidePanel
          open={restoredPanel}
          panel="Restored panel"
          onClose={() => setRestoredPanel(false)}
        >
          <Button aria-label="Close restored panel" onClick={() => setRestoredPanel(false)}>
            Close restored panel
          </Button>
        </ResizableSidePanel>
      ) : null}
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
