import type { ConversationSuggestion, ForYouDiscovery } from "@rakazo/contracts";
import { useEffect, useState } from "react";

export type SuggestionsRequest = { botId: string; messageId: string; locale: string };

/** Drop old suggestions immediately when a turn, account, space, or thread changes. */
export function useConversationSuggestions({
  scopeKey,
  request,
  load,
}: {
  scopeKey: string;
  request?: SuggestionsRequest;
  load: (request: SuggestionsRequest, signal: AbortSignal) => Promise<ConversationSuggestion[]>;
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
  return state.key === key ? state.suggestions : [];
}

export function useForYouRecommendations({
  scopeKey,
  assistantId,
  load,
  dismiss,
}: {
  scopeKey?: string;
  assistantId?: string | null;
  load: (assistantId: string, signal: AbortSignal) => Promise<ForYouDiscovery>;
  dismiss: (
    assistantId: string,
    recommendationId: string,
    action: "dismiss" | "snooze",
  ) => Promise<unknown>;
}) {
  const key = scopeKey && assistantId ? JSON.stringify([scopeKey, assistantId]) : "";
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: ForYouDiscovery; loading: boolean }>({
    key: "",
    data: { recommendations: [], unavailable: false },
    loading: false,
  });
  useEffect(() => {
    if (!key || !assistantId) return;
    const controller = new AbortController();
    setState({ key, data: { recommendations: [], unavailable: false }, loading: true });
    void load(assistantId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, data, loading: false });
      },
      () => {
        if (!controller.signal.aborted)
          setState({ key, data: { recommendations: [], unavailable: true }, loading: false });
      },
    );
    return () => controller.abort();
  }, [key, assistantId, revision, load]);
  return {
    ...(state.key === key ? state.data : { recommendations: [], unavailable: false }),
    loading: !!key && (state.key !== key || state.loading),
    refresh: () => setRevision((value) => value + 1),
    async dismiss(recommendationId: string, action: "dismiss" | "snooze") {
      if (!assistantId || !key) return;
      await dismiss(assistantId, recommendationId, action);
      setState((previous) =>
        previous.key === key
          ? {
              ...previous,
              data: {
                ...previous.data,
                recommendations: previous.data.recommendations.filter(
                  (r) => r.id !== recommendationId,
                ),
              },
            }
          : previous,
      );
    },
  };
}
