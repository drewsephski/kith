import type { ConversationSuggestion } from "@rakazo/contracts";
import { useEffect, useState } from "react";

export type SuggestionsRequest = { botId: string; messageId: string; locale: string };

/** Drop old suggestions immediately when a turn, account, space, or thread changes. */
export function useConversationSuggestions({
  scopeKey,
  request,
  load,
  fallback = [],
}: {
  scopeKey: string;
  request?: SuggestionsRequest;
  load: (request: SuggestionsRequest, signal: AbortSignal) => Promise<ConversationSuggestion[]>;
  fallback?: ConversationSuggestion[];
}): ConversationSuggestion[] {
  const key = request ? JSON.stringify([scopeKey, request]) : "";
  const [state, setState] = useState<{ key: string; suggestions: ConversationSuggestion[] }>({
    key: "",
    suggestions: [],
  });
  const botId = request?.botId;
  const messageId = request?.messageId;
  const locale = request?.locale;
  useEffect(() => {
    if (!key || !botId || !messageId || !locale) return;
    const controller = new AbortController();
    // Let final message/run events settle before asking for the next turn.
    const timer = setTimeout(() => {
      void load({ botId, messageId, locale }, controller.signal).then(
        (suggestions) => {
          if (!controller.signal.aborted) setState({ key, suggestions });
        },
        () => {
          if (!controller.signal.aborted) setState({ key, suggestions: [] });
        },
      );
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
      // A busy -> idle transition with the same anchor must request fresh suggestions.
      setState((previous) => (previous.key === key ? { key: "", suggestions: [] } : previous));
    };
  }, [key, botId, messageId, locale, load]);
  if (!key) return [];
  return state.key === key && state.suggestions.length ? state.suggestions : fallback;
}
