import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, Linking, Text } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import type { PushPermission } from "../lib/push";
import { pushPermission, registerPushToken } from "../lib/push";
import { errorText } from "../lib/user-error";
import { NativeActionButton } from "./native-action-button";
import { SettingsGroup, SettingsRow } from "./settings-group";

export function IosNotificationsSettings() {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        void pushPermission()
          .then((value) => {
            if (active) {
              setPermission(value);
              setError(null);
            }
          })
          .catch((cause) => {
            if (active) setError(errorText(cause, t("Could not check notification settings")));
          });
      load();
      const foreground = AppState.addEventListener("change", (state) => {
        if (state === "active") load();
      });
      return () => {
        active = false;
        foreground.remove();
      };
    }, [attempt, t]),
  );
  async function enable() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await registerPushToken({ requestPermission: true });
      setPermission(await pushPermission());
    } catch (cause) {
      setError(errorText(cause, t("Could not enable notifications")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsGroup
      label={t("Notifications")}
      footer={t("Know when work finishes or needs your approval.")}
    >
      <SettingsRow
        accessible
        title={t("Notifications")}
        value={
          permission === "allowed"
            ? t("Allowed")
            : permission === "denied"
              ? t("Off")
              : permission === "undetermined"
                ? t("Not enabled")
                : t("Checking…")
        }
      />
      {permission === "undetermined" ? (
        <NativeActionButton
          label={t("Enable notifications")}
          busy={busy}
          prominence="plain"
          onPress={() => void enable()}
        />
      ) : null}
      {permission === "denied" || permission === "allowed" ? (
        <SettingsRow
          title={t("Open notification settings")}
          accessibilityRole="button"
          onPress={() =>
            void Linking.openSettings().catch((cause) =>
              setError(errorText(cause, t("Could not open Settings"))),
            )
          }
        />
      ) : null}
      {error ? (
        <>
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
            {error}
          </Text>
          <NativeActionButton
            label={t("Retry")}
            prominence="plain"
            onPress={() => setAttempt((value) => value + 1)}
          />
        </>
      ) : null}
    </SettingsGroup>
  );
}
