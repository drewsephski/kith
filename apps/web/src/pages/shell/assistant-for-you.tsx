import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useAssistantSuggestions } from "./assistant-suggestions";

export function AssistantForYou({
  botId,
  onSuggest,
  apps,
}: {
  botId?: string;
  apps?: string[];
  onSuggest: (text: string) => void;
}) {
  const { t } = useLingui();
  const suggestions = useAssistantSuggestions(botId, apps).slice(0, 3);
  if (!suggestions.length) return null;
  return (
    <section
      className="kith-for-you mx-auto w-full min-w-0 shrink-0 py-1"
      aria-label={t`For you`}
      data-testid="assistant-for-you"
    >
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <h2 className="shrink-0 px-1 text-xs font-medium text-muted-foreground sm:px-0">
          <Trans>For you</Trans>
        </h2>
        <div className="rk-scroll flex min-w-0 gap-2 overflow-x-auto p-1 sm:flex-1">
          {suggestions.map(({ title, prompt }) => (
            <Button
              key={title}
              variant="ghost"
              title={title}
              onClick={() => onSuggest(prompt)}
              className="h-11 min-w-0 shrink-0 bg-muted/50 px-3 font-normal sm:h-9 sm:flex-1"
            >
              <span className="min-w-0 whitespace-nowrap text-sm leading-5 sm:truncate sm:text-xs">
                {title}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
