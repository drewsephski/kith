import type { RunActivityRow } from "@rakazo/contracts";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlatList } from "../../components/minimal-scroll";
import { NativeActionButton } from "../../components/native-action-button";
import { useStackedSettings } from "../../components/settings-group";
import {
  activityDestination,
  activityStatusLabel,
  fetchSpaceActivity,
  formatActivityRelativeTime,
} from "../../lib/activity";
import { mobileScreenScopeKey } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { native, useThemedStyles } from "../../lib/native";

type Activity = Awaited<ReturnType<typeof fetchSpaceActivity>>;
export default function ActivityScreen() {
  useStackedSettings();
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  const router = useRouter();
  const scope = mobileScreenScopeKey();
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    data: Activity;
  } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const current = () => !cancelled && scope === mobileScreenScopeKey();
      setLoading(true);
      const refresh = async () => {
        try {
          if (AppState.currentState === "active") {
            const data = await fetchSpaceActivity();
            if (current()) {
              setSnapshot({ scope, data });
              setError(false);
            }
          }
        } catch {
          if (current()) setError(true);
        } finally {
          if (current()) {
            setLoading(false);
            timer = setTimeout(() => void refresh(), 15_000);
          }
        }
      };
      void refresh();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, [scope, revision]),
  );
  const data = snapshot?.scope === scope ? snapshot.data : null;
  const recentIds = new Set(data?.recent.map((run) => run.runId));
  const rows: { run: RunActivityRow; heading?: string }[] = [
    ...(data?.active
      .filter((run) => !recentIds.has(run.runId))
      .map((run, index) => ({
        run,
        heading: index === 0 ? t("Now") : undefined,
      })) ?? []),
    ...(data?.recent.map((run, index) => ({
      run,
      heading: index === 0 ? t("Recent") : undefined,
    })) ?? []),
  ];
  return (
    <>
      <Stack.Screen options={{ title: t("Activity") }} />
      <FlatList
        data={rows}
        keyExtractor={({ run }) => run.runId}
        style={{ backgroundColor: native.page }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingVertical: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => setRevision((value) => value + 1)}
          />
        }
        ListHeaderComponent={
          error ? (
            <View style={{ paddingHorizontal: 20 }}>
              <Text accessibilityRole="alert" style={{ color: native.secondaryLabel }}>
                {t("Could not load activity")}
              </Text>
              <NativeActionButton
                label={t("Retry")}
                prominence="plain"
                onPress={() => setRevision((value) => value + 1)}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator />
          ) : !error ? (
            <Text style={{ padding: 20, color: native.secondaryLabel }}>
              {t("No activity yet")}
            </Text>
          ) : null
        }
        renderItem={({ item: { run, heading } }) => (
          <>
            {heading ? <Text style={styles.heading}>{heading}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(activityDestination(run))}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.55 }]}
            >
              <View style={styles.top}>
                <Text style={styles.name}>{run.groupName ?? run.botName}</Text>
                <Text style={styles.time}>{formatActivityRelativeTime(run.updatedAt)}</Text>
              </View>
              <Text style={styles.status}>{activityStatusLabel(run.status)}</Text>
              {run.promptSnippet ? <Text style={styles.prompt}>{run.promptSnippet}</Text> : null}
            </Pressable>
          </>
        )}
      />
    </>
  );
}
function createStyles() {
  return StyleSheet.create({
    heading: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      fontSize: 14,
      fontWeight: "600",
      color: native.secondaryLabel,
    },
    row: { paddingHorizontal: 20, paddingVertical: 12, gap: 6 },
    top: { flexDirection: "row", alignItems: "center", gap: 12 },
    name: { flex: 1, fontSize: 17, fontWeight: "600", color: native.label },
    time: { fontSize: 13, color: native.secondaryLabel },
    status: { fontSize: 15, color: native.label },
    prompt: { fontSize: 15, lineHeight: 21, color: native.secondaryLabel },
  });
}
