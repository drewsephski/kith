import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskStarterId } from "@rakazo/contracts";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  KithAvatar,
} from "@rakazo/ui-web";
import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumn,
  Heart,
  ListTodo,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../../lib/rpc";
import { AssistantFocusChoices } from "./assistant-focus";

export function AssistantWelcome({
  name,
  botId,
  assistantName = "Kith",
  firstRun = false,
  onChanged,
  onSuggest,
}: {
  name?: string;
  botId?: string;
  assistantName?: string;
  firstRun?: boolean;
  onChanged?: () => Promise<void>;
  onSuggest: (text: string, starter?: TaskStarterId) => void;
}) {
  const { t } = useLingui();
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void rpc.taskStarters
      .options()
      .then((options) => {
        if (active) setApps(options.connections.map((connection) => connection.app));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [botId]);
  const firstName = name?.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t`Good morning` : hour < 18 ? t`Good afternoon` : t`Good evening`;
  const suggestions = [
    {
      icon: CalendarDays,
      title: t`Plan my day`,
      prompt: t`Help me plan my day. Ask me what I need to get done.`,
    },
    {
      icon: Search,
      title: t`Search all my Gmail accounts`,
      prompt: t`Search all my connected Gmail accounts for…`,
      starter: "gmail_search" as const,
      available: apps.includes("gmail"),
    },
    {
      icon: CalendarDays,
      title: t`Build a brief for my next meeting`,
      prompt: t`Prepare me for my next meeting using my calendar, relevant emails, and HubSpot.`,
      starter: "meeting_brief" as const,
      available: apps.includes("calendar"),
    },
    {
      icon: ListTodo,
      title: t`Turn my inbox into a to-do list`,
      prompt: t`Turn emails from the past seven days into a prioritized to-do list, with links to each source.`,
      starter: "inbox_todos" as const,
      available: apps.includes("gmail"),
    },
    {
      icon: ChartNoAxesColumn,
      title: t`Pull this week’s numbers into a Sheet`,
      prompt: t`Pull this week’s numbers into a Google Sheet using my connected GA4 and Google Sheets accounts.`,
      starter: "analytics_report" as const,
      available: apps.includes("analytics") && apps.includes("sheets"),
    },
    { icon: Heart, title: t`Remember something`, prompt: t`Remember that I prefer ` },
  ];
  const available = suggestions.filter((suggestion) => suggestion.available !== false);
  const suggestionButton = ({
    icon: Icon,
    title,
    prompt,
    starter,
  }: (typeof suggestions)[number]) => (
    <Button
      key={title}
      variant="ghost"
      onClick={() => onSuggest(prompt, starter)}
      className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-3 py-2.5 font-normal text-muted-foreground hover:text-foreground"
    >
      <Icon size={17} strokeWidth={1.7} />
      <span className="min-w-0 flex-1 text-start leading-5">{title}</span>
      <ArrowUpRight size={15} />
    </Button>
  );
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center-safe pb-12 pt-8"
      data-testid="assistant-welcome"
    >
      <KithAvatar size={92} className="mb-5 -ms-2 shrink-0" />
      <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
        {greeting}
        {firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        <Trans>What’s on your mind?</Trans>
      </p>
      {firstRun && botId && onChanged ? (
        <AssistantFocusChoices botId={botId} assistantName={assistantName} onChanged={onChanged} />
      ) : (
        <div className="mt-8 flex flex-col gap-1.5">
          {available.slice(0, 3).map(suggestionButton)}
          {available.length > 3 ? (
            <Collapsible>
              <CollapsibleTrigger className="ms-3 cursor-pointer rounded-md py-2 text-sm text-muted-foreground hover:text-foreground">
                <Trans>More tasks</Trans>
              </CollapsibleTrigger>
              <CollapsibleContent>{available.slice(3).map(suggestionButton)}</CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      )}
    </div>
  );
}
