import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import companion from "../../../packages/ui-tokens/assets/kith-companion.png";
import { ScrollView } from "../components/minimal-scroll";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import { loadSessionToken } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { loadIntroProgress, saveIntroProgress } from "../lib/intro";
import { useMobileTokens } from "../lib/native";
import { useScreenInteractive } from "../lib/observe";

const scenes = [
  {
    title: "Meet Kith.",
    body: "An assistant that remembers what matters and helps you get things done.",
  },
  {
    title: "Hand off the work.",
    body: "Plan your day, research an idea, or draft your next reply.",
  },
  {
    title: "Pick up where you left off.",
    body: "Follow real progress. Approve important actions. Return to your results.",
  },
] as const;

export default function Intro() {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  const [scene, setScene] = useState(0);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  useScreenInteractive(ready);
  useEffect(() => {
    let active = true;
    void Promise.all([loadSessionToken(), loadIntroProgress()])
      .then(([token, progress]) => {
        if (!active) return;
        setSignedIn(Boolean(token));
        setScene(progress.scene);
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    fade.stopAnimation();
    if (reducedMotion || AppState.currentState !== "active") {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true });
    animation.start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        animation.stop();
        fade.setValue(1);
      }
    });
    return () => {
      animation.stop();
      subscription.remove();
    };
  }, [scene, reducedMotion, fade]);

  async function advance(mode?: "in" | "up") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const complete = Boolean(mode) || scene === 2;
      await saveIntroProgress({ scene: complete ? scene : scene + 1, complete });
      if (complete) router.replace({ pathname: "/sign-in", params: { mode: mode ?? "up" } });
      else setScene((current) => current + 1);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (signedIn) return <Redirect href="/" />;
  const size = Math.min(width - 80, height < 700 ? 210 : 300);
  const current = scenes[scene]!;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.top}>
        <Text style={{ color: tokens.foreground, fontSize: 18, fontWeight: "600" }}>Kith</Text>
        <NativeActionButton
          label={t("Skip")}
          prominence="quiet"
          disabled={busy}
          onPress={() => void advance("in")}
        />
      </View>
      {!ready ? (
        <ActivityIndicator />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Animated.View style={[styles.scene, { opacity: fade }]}>
            <Image
              source={companion}
              resizeMode="contain"
              accessible
              accessibilityLabel={t("Kith, your blue companion")}
              style={{
                width: size,
                height: size,
                alignSelf: scene === 0 ? "center" : scene === 1 ? "flex-end" : "flex-start",
                transform: [{ rotate: scene === 1 ? "-6deg" : scene === 2 ? "4deg" : "0deg" }],
              }}
            />
            {scene > 0 ? (
              <View
                style={[
                  styles.examples,
                  { backgroundColor: tokens.card, borderColor: tokens.border },
                ]}
              >
                <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{t("Examples")}</Text>
                {(scene === 1
                  ? ["Plan my day", "Research an idea", "Draft a reply"]
                  : ["Follow progress", "Review and approve", "Return to results"]
                ).map((label, index) => (
                  <View key={label} style={styles.example}>
                    <NativeSymbol
                      ios={
                        (scene === 1
                          ? ["calendar", "magnifyingglass", "text.bubble"]
                          : ["ellipsis", "hand.raised", "checkmark"])[index]!
                      }
                      android={
                        (scene === 1
                          ? (["calendar-outline", "search", "chatbubble-outline"] as const)
                          : (["ellipsis-horizontal", "hand-left-outline", "checkmark"] as const))[
                          index
                        ]!
                      }
                      size={18}
                      color={tokens.mutedForeground}
                    />
                    <Text style={{ flex: 1, color: tokens.foreground, fontSize: 16 }}>
                      {t(label)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text accessibilityRole="header" style={[styles.title, { color: tokens.foreground }]}>
              {t(current.title)}
            </Text>
            <Text style={[styles.body, { color: tokens.mutedForeground }]}>{t(current.body)}</Text>
          </Animated.View>
          <View
            accessibilityLabel={t("Introduction, step {step} of 3", { step: scene + 1 })}
            style={styles.dots}
          >
            {scenes.map((item, index) => (
              <View
                key={item.title}
                style={{
                  width: index === scene ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index === scene ? tokens.foreground : tokens.border,
                }}
              />
            ))}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
              {t("Could not save your introduction. Try again.")}
            </Text>
          ) : null}
          <NativeActionButton
            label={t(scene === 2 ? "Get started" : "Continue")}
            busy={busy}
            onPress={() => void advance()}
          />
          <NativeActionButton
            label={t("Sign in")}
            prominence="plain"
            disabled={busy}
            onPress={() => void advance("in")}
            style={{ alignSelf: "center" }}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingBottom: 24,
    gap: 16,
  },
  scene: { flexGrow: 1, justifyContent: "center", gap: 18, paddingVertical: 20 },
  title: { fontSize: 36, fontWeight: "600", letterSpacing: -1, lineHeight: 42 },
  body: { fontSize: 18, lineHeight: 27 },
  examples: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 18, gap: 14 },
  example: { flexDirection: "row", alignItems: "center", gap: 12 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 8 },
});
