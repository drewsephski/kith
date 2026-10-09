import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rakazo/ui-web";
import { Brain, Clock, ListTodo, MoreHorizontal, Puzzle, Settings } from "lucide-react";
import type { Panel } from "../../lib/right-panel-state";

export function ConversationMenu({
  inGroup,
  showConnections,
  onSelect,
}: {
  inGroup: boolean;
  showConnections: boolean;
  onSelect: (panel: Panel) => void;
}) {
  const { t } = useLingui();
  const itemClass = "min-h-10 gap-3 px-3";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={t`Conversation details`} />}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48 rounded-xl p-1.5">
        {showConnections ? (
          <DropdownMenuItem
            className={`${itemClass} sm:hidden`}
            onClick={() => onSelect("connections")}
          >
            <Puzzle aria-hidden="true" />
            <Trans>Connections</Trans>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className={`${itemClass} sm:hidden`} onClick={() => onSelect("activity")}>
          <ListTodo aria-hidden="true" />
          <Trans>Tasks</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem className={itemClass} onClick={() => onSelect("memory")}>
          <Brain aria-hidden="true" />
          <Trans>Memory</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem className={itemClass} onClick={() => onSelect("routines")}>
          <Clock aria-hidden="true" />
          <Trans>Routines</Trans>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={itemClass}
          onClick={() => onSelect(inGroup ? "group-settings" : "settings")}
        >
          <Settings aria-hidden="true" />
          <Trans>Settings</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
