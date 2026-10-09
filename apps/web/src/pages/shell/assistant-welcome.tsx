import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskStarterId } from "@rakazo/contracts";
import { Button, KithAvatar } from "@rakazo/ui-web";
import { ArrowUpRight, BarChart3, CalendarDays, Heart, ListTodo, Search } from "lucide-react";

export function AssistantWelcome({
  name,
  onSuggest,
}: {
  name?: string;
  onSuggest: (text: string, starter?: TaskStarterId) => void;
}) {
  const { t } = useLingui();
  const firstName = name?.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t`Good morning` : hour < 18 ? t`Good afternoon` : t`Good evening`;
  const suggestions = [
    { icon: CalendarDays, title: t`Plan tomorrow`, prompt: t`What's on my schedule tomorrow?` },
    {
      icon: Search,
      title: t`Search all my Gmail accounts`,
      prompt: t`Search all my connected Gmail accounts for…`,
      starter: "gmail_search" as const,
    },
    {
      icon: CalendarDays,
      title: t`Build a brief for my next meeting`,
      prompt: t`Prepare me for my next meeting using my calendar, relevant emails, and HubSpot.`,
      starter: "meeting_brief" as const,
    },
    {
      icon: ListTodo,
      title: t`Turn my inbox into a to-do list`,
      prompt: t`Turn emails from the past seven days into a prioritized to-do list, with links to each source.`,
      starter: "inbox_todos" as const,
    },
    {
      icon: BarChart3,
      title: t`Pull this week’s numbers into a Sheet`,
      prompt: t`Pull this week’s GA4 numbers into a Google Sheet.`,
      starter: "analytics_report" as const,
    },
    { icon: Heart, title: t`Remember something`, prompt: t`Remember that I prefer ` },
  ];
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center pb-12 pt-8"
      data-testid="assistant-welcome"
    >
      <KithAvatar size={92} className="mb-5 -ms-2" />
      <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
        {greeting}
        {firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        <Trans>What’s on your mind?</Trans>
      </p>
      <div className="mt-8 flex flex-col gap-1.5">
        {suggestions.map(({ icon: Icon, title, prompt, starter }) => (
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
        ))}
      </div>
    </div>
  );
}
