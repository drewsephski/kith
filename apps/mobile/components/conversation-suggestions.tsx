import type { SuggestionsRequest } from "@rakazo/chat-ui/suggestions";
import { useConversationSuggestions } from "@rakazo/chat-ui/suggestions";
import type { ConversationSuggestion } from "@rakazo/contracts";
import { connectedForYouSuggestions, FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { ScrollView } from "./minimal-scroll";
import { NativeActionButton } from "./native-action-button";

const load = (request: SuggestionsRequest, signal: AbortSignal) =>
  rpc<ConversationSuggestion[]>("threads/suggestions", request, { signal, timeoutMs: 25_000 });

export function ConversationSuggestions({
  scopeKey,
  botId,
  messageId,
  busy,
  connectedServices = [],
  onSelect,
}: {
  scopeKey: string;
  botId?: string;
  messageId?: string;
  busy: boolean;
  connectedServices?: string[];
  onSelect: (prompt: string) => void;
}) {
  const { locale, t } = useI18n();
  const starterIds = connectedForYouSuggestions(connectedServices);
  const suggestions = useConversationSuggestions({
    scopeKey,
    request: !busy && botId && messageId ? { botId, messageId, locale } : undefined,
    load,
    fallback: FOR_YOU_SUGGESTIONS.filter((suggestion) => starterIds.includes(suggestion.id))
      .slice(0, 3)
      .map(({ title, prompt }) => ({ title: t(title), prompt: t(prompt) })),
  });
  if (!suggestions.length) return null;
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
    >
      {suggestions.map(({ title, prompt }) => (
        <NativeActionButton
          key={title}
          label={title}
          prominence="secondary"
          icon={{ ios: "arrow.turn.down.left", android: "return-down-back-outline" }}
          onPress={() => onSelect(prompt)}
        />
      ))}
    </ScrollView>
  );
}
