import { botCreationIntentRemoved } from "@rakazo/core";
import { Stack, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { NativeActionButton } from "../components/native-action-button";
import { cancelHeaderOptions } from "../components/sheet-header";
import { captureMobileScreenScope } from "../lib/api";
import { createConversationalBot } from "../lib/bot-creation";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";

/** Transient creation route: identity is configured inside the durable conversation. */
export default function NewBot() {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const navigation = useNavigation();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const settled = useRef(false);
  const operationScope = useRef<(() => boolean) | null>(null);
  usePreventRemove(pending, ({ data }) => {
    // Permit only the settled create's replacement or an authentication/Space boundary change.
    if (settled.current || (operationScope.current && !operationScope.current())) {
      navigation.dispatch(data.action);
    }
  });

  async function create() {
    if (submitting.current) return;
    submitting.current = true;
    settled.current = false;
    const scopeCurrent = captureMobileScreenScope();
    operationScope.current = scopeCurrent;
    setPending(true);
    setError(null);
    try {
      const bot = await createConversationalBot();
      if (bot && mounted.current && scopeCurrent()) {
        settled.current = true;
        router.replace({ pathname: "/thread", params: { botId: bot.id, name: bot.name } });
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          botCreationIntentRemoved(reason)
            ? t("This bot is no longer available.")
            : errorText(reason, t("Could not create bot")),
        );
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void create();
    return () => {
      mounted.current = false;
    };
  }, []);

  function close() {
    if (pending || submitting.current) return;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...cancelHeaderOptions(t("Cancel"), close, pending),
          title: t("New bot"),
          gestureEnabled: !pending,
        }}
      />
      <View
        style={{
          flex: 1,
          backgroundColor: tokens.background,
          padding: 24,
          gap: 16,
          justifyContent: "center",
        }}
      >
        {pending ? (
          <ActivityIndicator accessibilityLabel={t("Creating…")} color={tokens.foreground} />
        ) : null}
        {error ? (
          <Text selectable accessibilityRole="alert" style={{ color: tokens.destructive }}>
            {error}
          </Text>
        ) : null}
        {error ? (
          <NativeActionButton
            label={t("Try again")}
            disabled={pending}
            onPress={() => void create()}
          />
        ) : null}
      </View>
    </>
  );
}
