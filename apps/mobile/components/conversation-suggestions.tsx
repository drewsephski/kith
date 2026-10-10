import type { SuggestionsRequest } from "@rakazo/chat-ui/suggestions";
import { useConversationSuggestions } from "@rakazo/chat-ui/suggestions";
import type { ConversationSuggestion } from "@rakazo/contracts";
import { ScrollView } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { NativeActionButton } from "./native-action-button";

const load = (request: SuggestionsRequest, signal: AbortSignal) =>
  rpc<ConversationSuggestion[]>("threads/suggestions", request, { signal, timeoutMs: 25_000 });

export function ConversationSuggestions({
  scopeKey,
  botId,
  messageId,
  busy,
  onSelect,
}: {
  scopeKey: string;
  botId?: string;
  messageId?: string;
  busy: boolean;
  onSelect: (prompt: string) => void;
}) {
  const { locale } = useI18n();
  const suggestions = useConversationSuggestions({
    scopeKey,
    request: !busy && botId && messageId ? { botId, messageId, locale } : undefined,
    load,
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
