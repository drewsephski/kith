import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Group } from "@rakazo/contracts";
import { Button, cn, KithAvatar } from "@rakazo/ui-web";
import {
  Brain,
  Check,
  CircleAlert,
  FolderOpen,
  ListTodo,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Puzzle,
  Search,
  Settings,
} from "lucide-react";

export function KithSidebar({
  assistantId,
  bots,
  groups,
  activeId,
  activeGroupId,
  onOpenBot,
  onOpenGroup,
  onSearch,
  onCollapse,
  onNewThread,
  onMemory,
  onActivity,
  onArtifacts,
  onIntegrations,
  onSettings,
  onAdvanced,
  creating,
}: {
  assistantId: string | null;
  bots: Bot[];
  groups: Group[];
  activeId?: string;
  activeGroupId?: string;
  onOpenBot: (id: string) => void;
  onOpenGroup: (id: string) => void;
  onSearch: () => void;
  onCollapse: () => void;
  onNewThread: () => void;
  onMemory: () => void;
  onActivity: () => void;
  onArtifacts: () => void;
  onIntegrations: () => void;
  onSettings: () => void;
  onAdvanced: () => void;
  creating: boolean;
}) {
  const { t } = useLingui();
  const threads = bots.filter((bot) => bot.id !== assistantId);
  const active = threads.filter((bot) =>
    ["running", "queued", "leased", "waiting_input", "waiting_takeover"].includes(bot.status),
  );
  const recent = threads
    .filter((bot) => !active.includes(bot))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const row = (bot: Bot) => (
    <Button
      key={bot.id}
      variant="ghost"
      className={cn(
        "h-auto min-h-10 w-full justify-start gap-2.5 px-3 py-2 text-start font-normal",
        activeId === bot.id && !activeGroupId && "bg-sidebar-accent",
      )}
      onClick={() => onOpenBot(bot.id)}
      aria-current={activeId === bot.id && !activeGroupId ? "page" : undefined}
    >
      {bot.status === "waiting_input" || bot.status === "waiting_takeover" ? (
        <CircleAlert size={15} className="shrink-0 text-warning" />
      ) : bot.status === "failed" ? (
        <CircleAlert size={15} className="shrink-0 text-destructive" />
      ) : bot.status === "completed" ? (
        <Check size={15} className="shrink-0 text-muted-foreground" />
      ) : (
        <MessageCircle size={15} className="shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{bot.name}</span>
      {bot.unread ? (
        <span className="size-1.5 shrink-0 rounded-full bg-foreground">
          <span className="sr-only">
            <Trans>Unread</Trans>
          </span>
        </span>
      ) : null}
    </Button>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="kith-navigation">
      <div className="flex items-center justify-between px-5 pb-5 pt-2">
        <span className="text-2xl font-semibold tracking-tight">
          Kith<span className="text-muted-foreground">.</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCollapse}
          aria-label={t`Collapse sidebar`}
          title={t`Collapse sidebar`}
          className="app-no-drag hidden md:flex"
        >
          <PanelLeftClose size={16} />
        </Button>
      </div>
      <nav aria-label={t`Assistant`} className="space-y-1 px-3">
        <Button
          variant="ghost"
          className={cn(
            "h-14 w-full justify-start gap-3 px-3",
            activeId === assistantId && !activeGroupId && "bg-sidebar-accent",
          )}
          onClick={() => assistantId && onOpenBot(assistantId)}
          disabled={!assistantId}
          aria-current={activeId === assistantId && !activeGroupId ? "page" : undefined}
          data-testid="main-conversation"
        >
          <KithAvatar size={36} />
          <span className="text-start">
            <span className="block text-sm font-medium">Kith</span>
            <span className="block text-xs font-normal text-muted-foreground">
              <Trans>Your assistant</Trans>
            </span>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="h-10 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          onClick={onSearch}
        >
          <Search size={16} />
          <Trans>Search</Trans>
          <kbd className="ms-auto text-xs">⌘K</kbd>
        </Button>
        <Button
          variant="ghost"
          className="h-10 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          onClick={onNewThread}
          disabled={creating}
        >
          <Plus size={16} />
          {creating ? <Trans>Opening…</Trans> : <Trans>New conversation</Trans>}
        </Button>
      </nav>
      <div className="rk-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-6">
        {active.length ? (
          <section aria-label={t`Active threads`}>
            <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">
              <Trans>In progress</Trans>
            </h2>
            {active.map(row)}
          </section>
        ) : null}
        {recent.length || groups.length ? (
          <section
            className={active.length ? "mt-6" : undefined}
            aria-label={t`Recent conversations`}
          >
            <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">
              <Trans>Conversations</Trans>
            </h2>
            {recent.map(row)}
            {groups.map((group) => (
              <Button
                key={group.id}
                variant="ghost"
                className={cn(
                  "h-10 w-full justify-start gap-3 px-3 font-normal",
                  activeGroupId === group.id && "bg-sidebar-accent",
                )}
                onClick={() => onOpenGroup(group.id)}
              >
                <MessageCircle size={15} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{group.name}</span>
              </Button>
            ))}
          </section>
        ) : null}
      </div>
      <nav aria-label={t`Personal assistant details`} className="space-y-0.5 px-3 pb-3 pt-3">
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          onClick={onActivity}
        >
          <ListTodo size={16} />
          <Trans>Tasks</Trans>
        </Button>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          onClick={onMemory}
        >
          <Brain size={16} />
          <Trans>Memory</Trans>
        </Button>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          onClick={onArtifacts}
        >
          <FolderOpen size={16} />
          <Trans>Files</Trans>
        </Button>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          onClick={onIntegrations}
        >
          <Puzzle size={16} />
          <Trans>Connections</Trans>
        </Button>
        <div className="mt-3 flex items-center gap-1 border-t border-sidebar-border pt-3">
          <Button
            variant="ghost"
            className="h-9 flex-1 justify-start gap-3 px-3 font-normal text-muted-foreground"
            onClick={onSettings}
          >
            <Settings size={16} />
            <Trans>Settings</Trans>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onAdvanced}
            aria-label={t`Advanced navigation`}
            title={t`Advanced navigation`}
          >
            <MoreHorizontal size={17} />
          </Button>
        </div>
      </nav>
    </div>
  );
}
