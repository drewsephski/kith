import type { CalendarSnapshot } from "@rakazo/contracts";
import { calendarAgendaEvents, calendarEventUrl } from "@rakazo/core";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "../../components/minimal-scroll";
import { NativeActionButton } from "../../components/native-action-button";
import { useStackedSettings } from "../../components/settings-group";
import { captureApiRequestContext, captureMobileScreenScope, rpc } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useMobileTokens } from "../../lib/native";

type Agenda = { snapshots: CalendarSnapshot[]; unavailable: boolean };
export default function Calendar() {
  const { t, locale } = useI18n();
  const tokens = useMobileTokens();
  useStackedSettings();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      const currentScope = captureMobileScreenScope();
      const current = () => !controller.signal.aborted && currentScope();
      setAgenda(null);
      setLoading(true);
      void (async () => {
        const requestContext = await captureApiRequestContext();
        if (!current()) return;
        const next = await rpc<Agenda>(
          "calendar/agenda",
          { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          { requestContext, signal: controller.signal, timeoutMs: 25_000 },
        );
        if (current()) setAgenda(next);
      })()
        .catch(() => {
          if (current()) setAgenda({ snapshots: [], unavailable: true });
        })
        .finally(() => {
          if (current()) setLoading(false);
        });
      return () => controller.abort();
    }, [revision]),
  );
  const events = calendarAgendaEvents(agenda?.snapshots ?? []);
  return (
    <>
      <Stack.Screen options={{ title: t("Calendar") }} />
      <ScrollView contentContainerStyle={styles.page}>
        <NativeActionButton
          label={t("Refresh")}
          prominence="plain"
          disabled={loading}
          onPress={() => setRevision((value) => value + 1)}
        />
        {loading ? (
          <ActivityIndicator
            accessibilityLabel={t("Loading schedule…")}
            color={tokens.foreground}
          />
        ) : (
          <>
            {agenda?.unavailable ? (
              <Text accessibilityRole="alert" style={{ color: tokens.mutedForeground }}>
                {t("Could not load every calendar. Try refreshing.")}
              </Text>
            ) : !events.length ? (
              <Text style={{ color: tokens.mutedForeground }}>
                {t("No events in the next seven days.")}
              </Text>
            ) : null}
            {events.map((event) => {
              const url = calendarEventUrl(event.url);
              const date = event.allDay
                ? new Date(`${event.start.slice(0, 10)}T12:00:00`)
                : new Date(event.start);
              return (
                <View key={`${event.calendarId}:${event.id}`} style={styles.event}>
                  <Text style={[styles.title, { color: tokens.foreground }]}>
                    {event.title || t("Untitled event")}
                  </Text>
                  <Text style={{ color: tokens.mutedForeground }}>
                    {date.toLocaleString(
                      locale,
                      event.allDay
                        ? { weekday: "short", month: "short", day: "numeric" }
                        : {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          },
                    )}
                    {event.allDay ? ` · ${t("All day")}` : ""}
                  </Text>
                  {event.location ? (
                    <Text style={{ color: tokens.mutedForeground }}>{event.location}</Text>
                  ) : null}
                  {url ? (
                    <NativeActionButton
                      label={t("Open event")}
                      prominence="plain"
                      onPress={() => void Linking.openURL(url)}
                    />
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </>
  );
}
const styles = StyleSheet.create({
  page: { padding: 20, gap: 20 },
  event: { gap: 6 },
  title: { fontSize: 17, fontWeight: "500" },
});
