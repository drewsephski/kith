import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { rpc } from "../lib/api";
import { loadLastBotId } from "../lib/last-bot";
import { NativeActionButton } from "./native-action-button";

type State = {
  configured: boolean;
  connectionId: string | null;
  status: "connected" | "pending" | "disconnected" | "error";
};
export function CalendarConnection() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      rpc<State>("calendar/status")
        .then((next) => {
          if (!cancelled) setState(next);
        })
        .catch(() => {
          if (!cancelled) setState(null);
        });
    void load();
    const timer = state?.status === "pending" ? setInterval(() => void load(), 2000) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [state?.status]);
  async function connect() {
    setBusy(true);
    try {
      const current = await rpc<State>("calendar/status");
      if (!current.configured) {
        Alert.alert(
          "Google Calendar",
          "Set up the OAuth client in the desktop app's Calendar connection settings first.",
        );
        return;
      }
      const botId = await loadLastBotId();
      if (!botId) {
        Alert.alert("Open your assistant first");
        return;
      }
      const result = await rpc<{ authorizationUrl: string }>("calendar/begin", {
        botId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await Linking.openURL(result.authorizationUrl);
      setState({ ...current, status: "pending" });
    } catch {
      Alert.alert("Could not connect Calendar", "Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <NativeActionButton
      label={
        state?.status === "connected"
          ? "Google Calendar"
          : state?.status === "pending"
            ? "Connecting Calendar…"
            : "Connect Google Calendar"
      }
      disabled={busy}
      fill={false}
      prominence="secondary"
      onPress={() => {
        if (!state?.connectionId) {
          void connect();
          return;
        }
        Alert.alert("Google Calendar", undefined, [
          { text: "Cancel", style: "cancel" },
          ...(state.status !== "connected"
            ? [{ text: "Connect", onPress: () => void connect() }]
            : []),
          {
            text: "Disconnect",
            style: "destructive",
            onPress: () => {
              void rpc("calendar/disconnect")
                .then(() =>
                  setState({ configured: true, connectionId: null, status: "disconnected" }),
                )
                .catch(() => Alert.alert("Could not disconnect Calendar", "Try again."));
            },
          },
        ]);
      }}
    />
  );
}
