import { Trans, useLingui } from "@lingui/react/macro";
import type { SuggestionsRequest } from "@rakazo/chat-ui/suggestions";
import { useConversationSuggestions } from "@rakazo/chat-ui/suggestions";
import type { ConversationSuggestion } from "@rakazo/contracts";
import type { CornerDownLeftIconHandle } from "@rakazo/ui-web";
import { Button, CornerDownLeftIcon } from "@rakazo/ui-web";
import { CornerDownRight } from "lucide-react";
import { useRef } from "react";
import { rpc, selectedSpaceId } from "../../lib/rpc";
import { useAssistantSuggestions } from "./assistant-suggestions";

const load = (request: SuggestionsRequest, signal: AbortSignal) =>
  rpc.threads.suggestions(request, { signal, context: { spaceId: selectedSpaceId() } });

export function AssistantForYou({
  botId,
  onSuggest,
  apps,
  conversation,
}: {
  botId?: string;
  apps?: string[];
  conversation?: { scopeKey: string; messageId?: string; busy: boolean };
  onSuggest: (text: string) => void;
}) {
  const { t, i18n } = useLingui();
  const starters = useAssistantSuggestions(botId, apps);
  const followUps = useConversationSuggestions({
    scopeKey: conversation?.scopeKey ?? "",
    request:
      conversation && !conversation.busy && conversation.messageId && botId
        ? { botId, messageId: conversation.messageId, locale: i18n.locale || "en" }
        : undefined,
    load,
    fallback: starters.slice(0, 3),
  });
  const suggestions = conversation ? followUps : starters.slice(0, 3);
  if (!suggestions.length) return null;
  return (
    <section
      className="kith-for-you mx-auto w-full min-w-0 shrink-0 py-1"
      aria-label={t`For you`}
      data-testid="assistant-for-you"
    >
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <h2 className="flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground sm:px-0">
          <CornerDownRight aria-hidden="true" className="size-3.5 text-foreground/70" />
          <Trans>For you</Trans>
        </h2>
        <div className="rk-scroll flex min-w-0 gap-2 overflow-x-auto p-1 sm:flex-1">
          {suggestions.map((suggestion) => (
            <SuggestionButton
              key={suggestion.title}
              suggestion={suggestion}
              onSuggest={onSuggest}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function SuggestionButton({
  suggestion: { title, prompt },
  onSuggest,
}: {
  suggestion: ConversationSuggestion;
  onSuggest: (text: string) => void;
}) {
  const icon = useRef<CornerDownLeftIconHandle>(null);
  return (
    <Button
      variant="outline"
      title={prompt}
      onClick={() => onSuggest(prompt)}
      onMouseEnter={() => icon.current?.startAnimation()}
      onMouseLeave={() => icon.current?.stopAnimation()}
      onFocus={() => icon.current?.startAnimation()}
      onBlur={() => icon.current?.stopAnimation()}
      className="group h-11 min-w-0 shrink-0 justify-between gap-3 rounded-xl border-foreground/15 bg-card px-3.5 shadow-sm transition-colors hover:border-foreground/30 hover:bg-accent motion-reduce:transition-none sm:h-10 sm:flex-1 dark:border-foreground/15 dark:bg-card dark:hover:bg-accent"
    >
      <span className="min-w-0 whitespace-nowrap text-sm font-medium leading-5 sm:truncate">
        {title}
      </span>
      <CornerDownLeftIcon
        ref={icon}
        size={16}
        aria-hidden="true"
        className="size-4 text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground"
      />
    </Button>
  );
}
