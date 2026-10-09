import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Group } from "@rakazo/contracts";
import { Button, KithAvatar, NavigationButton, SelectionGroup } from "@rakazo/ui-web";
import {
  Archive,
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
import type { ReactNode } from "react";
import type { ContextMenuPosition } from "../BotContextMenu";

type ConversationTarget = { kind: "bot" | "group"; id: string };
type OpenConversationMenu = (
  target: ConversationTarget,
  anchor: HTMLButtonElement,
  position: ContextMenuPosition,
) => void;

function ConversationRow({
  target,
  name,
  selected,
  children,
  onOpen,
  onContextMenu,
  onArchive,
}: {
  target: ConversationTarget;
  name: string;
  selected: boolean;
  children: ReactNode;
  onOpen: () => void;
  onContextMenu: OpenConversationMenu;
  onArchive: (target: ConversationTarget) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="group/conversation relative">
      <NavigationButton
        selected={selected}
        variant="ghost"
        className="h-auto min-h-10 gap-2.5 px-3 py-2 pe-11"
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(target, event.currentTarget, { x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          onContextMenu(target, event.currentTarget, {
            x: bounds.left + bounds.width / 2,
            y: bounds.bottom,
          });
        }}
        aria-current={selected ? "page" : undefined}
      >
        {children}
      </NavigationButton>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/conversation:opacity-100 group-focus-within/conversation:opacity-100 [@media(hover:none)]:opacity-100"
        aria-label={t`Archive ${name}`}
        title={t`Archive`}
        onClick={() => onArchive(target)}
      >
        <Archive size={15} />
      </Button>
    </div>
  );
}

export function KithSidebar({
  assistantId,
  bots,
  groups,
  activeId,
  activeGroupId,
  activeDetail,
  onOpenBot,
  onOpenGroup,
  onContextMenu,
  onArchive,
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
  activeDetail?: "activity" | "memory" | "connections" | "settings" | null;
  onOpenBot: (id: string) => void;
  onOpenGroup: (id: string) => void;
  onContextMenu: OpenConversationMenu;
  onArchive: (target: ConversationTarget) => void;
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
    <ConversationRow
      target={{ kind: "bot", id: bot.id }}
      name={bot.name}
      selected={activeId === bot.id && !activeGroupId}
      key={bot.id}
      onOpen={() => onOpenBot(bot.id)}
      onContextMenu={onContextMenu}
      onArchive={onArchive}
    >
      {bot.status === "waiting_input" || bot.status === "waiting_takeover" ? (
        <CircleAlert size={15} className="shrink-0 text-warning" />
      ) : bot.status === "failed" ? (
        <CircleAlert size={15} className="shrink-0 text-destructive" />
      ) : bot.status === "completed" ? (
        <Check size={15} className="shrink-0" />
      ) : (
        <MessageCircle size={15} className="shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{bot.name}</span>
      {bot.unread ? (
        <span className="size-1.5 shrink-0 rounded-full bg-primary">
          <span className="sr-only">
            <Trans>Unread</Trans>
          </span>
        </span>
      ) : null}
    </ConversationRow>
  );
  return (
    <SelectionGroup>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="kith-navigation">
        <div className="app-drag flex h-16 shrink-0 items-center justify-between px-5">
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
          <NavigationButton
            selected={activeId === assistantId && !activeGroupId}
            className="h-14 gap-3 px-3"
            onClick={() => assistantId && onOpenBot(assistantId)}
            disabled={!assistantId}
            aria-current={activeId === assistantId && !activeGroupId ? "page" : undefined}
            data-testid="main-conversation"
          >
            <KithAvatar size={36} />
            <span className="min-w-0 text-start">
              <span className="block text-sm font-medium">Kith</span>
              <span className="block text-xs font-normal text-muted-foreground">
                <Trans>Your assistant</Trans>
              </span>
            </span>
          </NavigationButton>
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
                <ConversationRow
                  target={{ kind: "group", id: group.id }}
                  name={group.name}
                  selected={activeGroupId === group.id}
                  key={group.id}
                  onOpen={() => onOpenGroup(group.id)}
                  onContextMenu={onContextMenu}
                  onArchive={onArchive}
                >
                  <MessageCircle size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                </ConversationRow>
              ))}
            </section>
          ) : null}
        </div>
        <SelectionGroup>
          <nav aria-label={t`Personal assistant details`} className="space-y-0.5 px-3 pb-3 pt-3">
            <NavigationButton
              selected={activeDetail === "activity"}
              aria-current={false}
              aria-pressed={activeDetail === "activity"}
              className="h-9 w-full justify-start gap-3 px-3"
              onClick={onActivity}
            >
              <ListTodo size={16} />
              <Trans>Tasks</Trans>
            </NavigationButton>
            <NavigationButton
              selected={activeDetail === "memory"}
              aria-current={false}
              aria-pressed={activeDetail === "memory"}
              className="h-9 w-full justify-start gap-3 px-3"
              onClick={onMemory}
            >
              <Brain size={16} />
              <Trans>Memory</Trans>
            </NavigationButton>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
              onClick={onArtifacts}
            >
              <FolderOpen size={16} />
              <Trans>Files</Trans>
            </Button>
            <NavigationButton
              selected={activeDetail === "connections"}
              aria-current={false}
              aria-pressed={activeDetail === "connections"}
              className="h-9 w-full justify-start gap-3 px-3"
              onClick={onIntegrations}
            >
              <Puzzle size={16} />
              <Trans>Connections</Trans>
            </NavigationButton>
            <div className="mt-3 flex items-center gap-1 border-t border-sidebar-border pt-3">
              <NavigationButton
                selected={activeDetail === "settings"}
                aria-current={false}
                aria-pressed={activeDetail === "settings"}
                className="h-9 flex-1 justify-start gap-3 px-3"
                onClick={onSettings}
              >
                <Settings size={16} />
                <Trans>Settings</Trans>
              </NavigationButton>
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
        </SelectionGroup>
      </div>
    </SelectionGroup>
  );
}
