import type { Connection, ConnectionCatalogItem, RunActivityRow } from "@rakazo/contracts";
import type { ForYouSuggestion } from "@rakazo/core";
import {
  connectedAppServices,
  connectedForYouSuggestions,
  FOR_YOU_SUGGESTIONS,
  forYouLaunchAttempt,
  forYouLaunchStorageKey,
  forYouWork,
  startForYouConversation,
} from "@rakazo/core";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MenuPicker } from "../components/menu-picker";
import { NativeSymbol } from "../components/native-symbol";
import { activityStatusLabel, fetchSpaceActivity } from "../lib/activity";
import type { MobileMe } from "../lib/api";
import { currentApiBase, rpc, selectedSpaceId } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens, useThemedStyles } from "../lib/native";
import { currentSessionGeneration } from "../lib/session";
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
  const [context, setContext] = useState<{
    spaceId: string | null;
    session: number;
    runs: RunActivityRow[];
    suggestions: string[];
    failed: boolean;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const spaceId = selectedSpaceId();
      const session = currentSessionGeneration();
      setContext(null);
      void Promise.allSettled([
        fetchSpaceActivity(),
        rpc<Connection[]>("connections/list"),
        rpc<ConnectionCatalogItem[]>("connections/catalog", {}),
      ]).then(([work, accounts, catalog]) => {
        if (!active || selectedSpaceId() !== spaceId || currentSessionGeneration() !== session)
          return;
        const services = connectedAppServices(
          accounts.status === "fulfilled" ? accounts.value : [],
          catalog.status === "fulfilled" ? catalog.value : [],
        );
        setContext({
          spaceId,
          session,
          runs:
            work.status === "fulfilled"
              ? forYouWork([...work.value.active, ...work.value.recent])
              : [],
          suggestions: connectedForYouSuggestions(services.map((service) => service.slug)),
          failed: work.status === "rejected",
        });
      });
      return () => {
        active = false;
      };
    }, []),
  );
  const currentContext =
    context?.spaceId === selectedSpaceId() && context.session === currentSessionGeneration()
      ? context
      : null;
  const connected = FOR_YOU_SUGGESTIONS.filter((suggestion) =>
    currentContext?.suggestions.includes(suggestion.id),
  );
  const starters = connected.length
    ? connected
    : currentContext && !currentContext.runs.length
      ? FOR_YOU_SUGGESTIONS.filter((suggestion) => suggestion.id === "weekly-plan")
      : [];
  function openWork(run: RunActivityRow) {
    const params = {
      name: run.groupName ?? run.botName,
      ...(run.messageId ? { messageId: run.messageId } : {}),
    };
    if (run.groupId)
      router.push({ pathname: "/group-thread", params: { ...params, groupId: run.groupId } });
    else router.push({ pathname: "/thread", params: { ...params, botId: run.botId } });
  }
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
      const selection = selectedSpaceId();
      const session = currentSessionGeneration();
      const endpoint = currentApiBase();
      const [me, assistant] = await Promise.all([
        rpc<MobileMe>("me"),
        rpc<{ botId: string }>("assistant/get"),
      ]);
      if (!assistant.botId) throw new Error(t("Your assistant is not available. Try again."));
      const isCurrent = () =>
        selection === selectedSpaceId() &&
        session === currentSessionGeneration() &&
        endpoint === currentApiBase();
      if (!isCurrent()) return;
      const scope = { userId: me.userId, spaceId: me.spaceId, assistantId: assistant.botId };
      const rawKey = `${endpoint}:${forYouLaunchStorageKey(scope, suggestion.id)}`;
      const key = `kith.for-you.${Array.from(rawKey, (char) => char.codePointAt(0)!.toString(16)).join("-")}`;
      const attempt = forYouLaunchAttempt(
        await SecureStore.getItemAsync(key),
        () =>
          globalThis.crypto?.randomUUID?.() ??
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
            const value = Math.floor(Math.random() * 16);
            return (char === "x" ? value : (value & 3) | 8).toString(16);
          }),
      );
      await SecureStore.setItemAsync(key, attempt.operationId);
      if (!isCurrent()) return;
      const botId = await startForYouConversation(suggestion, scope, attempt, {
        launch: (input) => {
          if (!isCurrent()) throw new Error(t("The selected space changed. Try again."));
          return rpc<{ id: string }>("bots/launchForYou", input);
        },
      });
      await SecureStore.deleteItemAsync(key);
      if (isCurrent())
        router.push({ pathname: "/thread", params: { botId, name: t(suggestion.title) } });
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
        {currentContext?.runs.length ? (
          <View style={styles.group}>
            <Text accessibilityRole="header" style={styles.heading}>
              {t("Your work")}
            </Text>
            {currentContext.runs.map((run) => (
              <Pressable
                key={run.runId}
                accessibilityRole="button"
                onPress={() => openWork(run)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.copy}>
                  <Text style={styles.title}>{run.promptSnippet || run.botName}</Text>
                  <Text style={styles.description}>
                    {run.botName} · {activityStatusLabel(run.status)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {currentContext?.failed ? (
          <Text accessibilityRole="alert" style={styles.description}>
            {t("Could not load activity")}
          </Text>
        ) : null}
        {starters.length ? (
          <View style={styles.group}>
            {connected.length ? (
              <Text accessibilityRole="header" style={styles.heading}>
                {t("Connected apps")}
              </Text>
            ) : null}
            {starters.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                accessibilityRole="button"
                disabled={busy}
                accessibilityState={{ disabled: busy }}
                onPress={() => void select(suggestion)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.title}>{t(suggestion.title)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text accessibilityRole="header" style={[styles.heading, styles.group]}>
          {t("Explore")}
        </Text>
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
