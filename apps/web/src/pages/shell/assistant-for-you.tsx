import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useAssistantSuggestions } from "./assistant-suggestions";

export function AssistantForYou({
  botId,
  onSuggest,
}: {
  botId?: string;
  onSuggest: (text: string) => void;
}) {
  const { t } = useLingui();
  const suggestions = useAssistantSuggestions(botId).slice(0, 3);
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
        <div className="grid min-w-0 grid-flow-col auto-cols-fr gap-1 p-1 sm:flex sm:flex-1 sm:gap-2">
          {suggestions.map(({ title, prompt }) => (
            <Button
              key={title}
              variant="ghost"
              title={title}
              onClick={() => onSuggest(prompt)}
              className="h-11 min-w-0 bg-muted/50 px-2 font-normal sm:h-9 sm:flex-1 sm:px-3"
            >
              <span className="line-clamp-2 min-w-0 whitespace-normal text-center text-[11px] leading-3.5 wrap-anywhere sm:line-clamp-none sm:truncate sm:text-xs sm:leading-5">
                {title}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
