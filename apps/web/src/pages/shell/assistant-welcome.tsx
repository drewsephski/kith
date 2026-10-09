import { Trans, useLingui } from "@lingui/react/macro";
import { Button, KithAvatar } from "@rakazo/ui-web";
import { ArrowUpRight, CalendarDays, Heart, Sun } from "lucide-react";

export function AssistantWelcome({
  name,
  onSuggest,
}: {
  name?: string;
  onSuggest: (text: string) => void;
}) {
  const { t } = useLingui();
  const firstName = name?.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t`Good morning` : hour < 18 ? t`Good afternoon` : t`Good evening`;
  const suggestions = [
    { icon: CalendarDays, title: t`Plan tomorrow`, prompt: t`What's on my schedule tomorrow?` },
    { icon: Sun, title: t`Prepare for a meeting`, prompt: t`Prepare me for my next meeting.` },
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
        {suggestions.map(({ icon: Icon, title, prompt }) => (
          <Button
            key={title}
            variant="ghost"
            onClick={() => onSuggest(prompt)}
            className="h-11 w-full justify-start gap-3 px-3 font-normal text-muted-foreground"
          >
            <Icon size={17} strokeWidth={1.7} />
            <span className="flex-1 text-start">{title}</span>
            <ArrowUpRight size={15} />
          </Button>
        ))}
      </div>
    </div>
  );
}
