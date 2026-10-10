import type { ForYouConversationAttempt, ForYouSuggestion } from "@rakazo/core";
import { FOR_YOU_SUGGESTIONS, startForYouConversation } from "@rakazo/core";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MenuPicker } from "../components/menu-picker";
import { NativeSymbol } from "../components/native-symbol";
import { rpc, selectedSpaceId } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useThemedStyles } from "../lib/native";
import { errorText } from "../lib/user-error";

export default function ForYou() {
  const { t } = useI18n();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const tokens = useMobileTokens();
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const attempts = useRef(new Map<string, ForYouConversationAttempt>());
  const choices = [
    { key: "all", label: t("All") },
    { key: "tasks", label: t("Tasks") },
    { key: "routines", label: t("Routines") },
    { key: "learn", label: t("Level up Kith") },
    { key: "builders", label: t("For builders") },
  ];
  const suggestions = FOR_YOU_SUGGESTIONS.filter(
    (suggestion) => category === "all" || suggestion.category === category,
  );
  const groups = [...new Set(suggestions.map((suggestion) => suggestion.group))];

  async function select(suggestion: ForYouSuggestion) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const spaceId = selectedSpaceId();
      const assistant = await rpc<{ botId: string }>("assistant/get");
      if (!assistant.botId) throw new Error(t("Your assistant is not available. Try again."));
      if (spaceId !== selectedSpaceId()) return;
      const key = `${spaceId}:${assistant.botId}:${suggestion.id}`;
      let attempt = attempts.current.get(key);
      if (!attempt) {
        attempt = {
          clientNonce:
            globalThis.crypto?.randomUUID?.() ??
            `for-you-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        attempts.current.set(key, attempt);
      }
      const botId = await startForYouConversation(suggestion, assistant.botId, attempt, {
        create: (input) => rpc<{ id: string }>("bots/create", input),
        send: (input) => {
          if (spaceId !== selectedSpaceId())
            throw new Error(t("The selected space changed. Try again."));
          return rpc("threads/send", input);
        },
      });
      attempts.current.delete(key);
      if (spaceId === selectedSpaceId())
        router.push({ pathname: "/thread", params: { botId, name: suggestion.title } });
    } catch (cause) {
      setError(
        errorText(cause, t("Could not start the conversation. Select the suggestion to retry.")),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t("For you") }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.page}
        contentContainerStyle={styles.content}
      >
        <MenuPicker label={t("Show")} choices={choices} value={category} onChange={setCategory} />
        {busy ? (
          <ActivityIndicator
            accessibilityLabel={t("Opening conversation")}
            color={native.label}
            style={styles.progress}
          />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: tokens.destructive }]}>
            {error}
          </Text>
        ) : null}
        {groups.map((group) => (
          <View key={group} style={styles.group}>
            <Text accessibilityRole="header" style={styles.heading}>
              {t(group)}
            </Text>
            {suggestions
              .filter((suggestion) => suggestion.group === group)
              .map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(suggestion.title)}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void select(suggestion)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  <NativeSymbol
                    ios={suggestion.category === "routines" ? "repeat" : "pencil.line"}
                    android={suggestion.category === "routines" ? "repeat" : "pencil-outline"}
                    color={native.secondaryLabel}
                    size={16}
                  />
                  <View style={styles.copy}>
                    <Text style={styles.title}>{t(suggestion.title)}</Text>
                    <Text style={styles.description}>{t(suggestion.description)}</Text>
                  </View>
                </Pressable>
              ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: native.page },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    group: { marginTop: 28 },
    heading: {
      color: native.label,
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderRadius: 10,
    },
    pressed: { backgroundColor: native.fillPressed },
    disabled: { opacity: 0.5 },
    copy: { flex: 1, gap: 4 },
    title: { color: native.label, fontSize: 16, lineHeight: 22 },
    description: { color: native.secondaryLabel, fontSize: 14, lineHeight: 20 },
    error: { color: native.label, padding: 8 },
    progress: { marginTop: 12 },
  });
}
