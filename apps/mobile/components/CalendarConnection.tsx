import type { Connection, ConnectionCatalogItem, IntegrationSetupState } from "@rakazo/contracts";
import { resolveFeaturedCatalogItem, waitForAppConnection } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import { captureApiRequestContext, rpc } from "../lib/api";
import { integrationsCacheScope, isIntegrationsScopeCurrent } from "../lib/integrations-cache";
import { loadLastBotId } from "../lib/last-bot";
import { errorText } from "../lib/user-error";
import { ConnectorIcon } from "./connector-icon";
import { NativeActionButton } from "./native-action-button";

type State = {
  configured: boolean;
  connectionId: string | null;
  managedConnectorId?: string | null;
  managedConnectionId?: string | null;
  managedConnections?: Array<{ id: string; displayName: string }>;
  status: "connected" | "pending" | "disconnected" | "error";
};
export function CalendarConnection({ botId: requestedBotId }: { botId?: string } = {}) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => attempt.current?.abort(), []);
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
    const listener = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    const timer = state?.status === "pending" ? setInterval(() => void load(), 2000) : undefined;
    return () => {
      cancelled = true;
      listener.remove();
      if (timer) clearInterval(timer);
    };
  }, [state?.status]);

  async function connect(connectionId?: string) {
    const controller = new AbortController();
    attempt.current?.abort();
    attempt.current = controller;
    setBusy(true);
    try {
      const scope = await integrationsCacheScope();
      const requestContext = await captureApiRequestContext();
      const options = { requestContext, signal: controller.signal };
      const assertCurrent = () => {
        controller.signal.throwIfAborted();
        if (!isIntegrationsScopeCurrent(scope)) throw new Error("Account changed; connect again");
      };
      assertCurrent();
      const current = await rpc<State>("calendar/status", {}, options);
      assertCurrent();
      if (!current.configured) {
        const setup = await rpc<IntegrationSetupState>("integrationSetup/get", {}, options);
        assertCurrent();
        Alert.alert("Google Calendar", "Set up app connections first.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open web app",
            onPress: () => {
              void Linking.openURL(setup.webUrl);
            },
          },
        ]);
        return;
      }
      const botId = requestedBotId ?? (await loadLastBotId());
      assertCurrent();
      if (!botId) {
        Alert.alert("Open your assistant first");
        return;
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (current.managedConnectorId) {
        let id = connectionId ?? current.managedConnections?.[0]?.id;
        if (!id) {
          const catalog = await rpc<ConnectionCatalogItem[]>(
            "connections/catalog",
            { connectorId: current.managedConnectorId },
            options,
          );
          const item = resolveFeaturedCatalogItem("google-calendar", catalog);
          if (!item) throw new Error("Calendar is unavailable. Try again.");
          assertCurrent();
          const started = await rpc<{ connectionId: string; authorizationUrl: string | null }>(
            "connections/begin",
            {
              connectorId: item.connectorId,
              provider: item.slug,
              displayName: item.name,
            },
            options,
          );
          assertCurrent();
          if (started.authorizationUrl) await Linking.openURL(started.authorizationUrl);
          const row = await waitForAppConnection(
            () => {
              assertCurrent();
              return rpc<Connection>(
                "connections/complete",
                { connectionId: started.connectionId },
                options,
              );
            },
            { signal: controller.signal },
          );
          assertCurrent();
          if (row.status !== "connected")
            throw new Error("Finish connecting Calendar in the browser, then try again.");
          id = row.id;
        }
        assertCurrent();
        await rpc(
          "calendar/connectAccount",
          { connectionId: id, botId, timezone },
          { ...options, timeoutMs: 120_000 },
        );
        assertCurrent();
        setState(await rpc<State>("calendar/status", {}, options));
      } else {
        const result = await rpc<{ authorizationUrl: string }>(
          "calendar/begin",
          { botId, timezone },
          options,
        );
        assertCurrent();
        await Linking.openURL(result.authorizationUrl);
        setState({ ...current, status: "pending" });
      }
    } catch (error) {
      if (!controller.signal.aborted) Alert.alert("Could not connect Calendar", errorText(error));
    } finally {
      if (attempt.current === controller) {
        attempt.current = null;
        setBusy(false);
      }
    }
  }
  function chooseAccount() {
    const accounts = state?.managedConnections ?? [];
    if (accounts.length <= 1) {
      void connect();
      return;
    }
    Alert.alert("Choose Calendar account", undefined, [
      ...accounts.map((account) => ({
        text: account.displayName,
        onPress: () => void connect(account.id),
      })),
      { text: "Cancel", style: "cancel" },
    ]);
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <ConnectorIcon name="Google Calendar" size={28} />
      <NativeActionButton
        label={
          busy
            ? "Connecting Calendar…"
            : state?.status === "connected"
              ? "Google Calendar"
              : state?.status === "pending"
                ? "Connecting Calendar…"
                : "Connect Google Calendar"
        }
        fill={false}
        prominence="secondary"
        onPress={() => {
          if (busy) {
            Alert.alert("Connecting Calendar", undefined, [
              { text: "Keep waiting", style: "cancel" },
              { text: "Stop waiting", onPress: () => attempt.current?.abort() },
            ]);
            return;
          }
          if (!state?.connectionId) {
            chooseAccount();
            return;
          }
          Alert.alert("Google Calendar", undefined, [
            { text: "Cancel", style: "cancel" },
            ...(state.status !== "connected" ? [{ text: "Connect", onPress: chooseAccount }] : []),
            {
              text: state.managedConnectionId ? "Disconnect briefing" : "Disconnect",
              style: "destructive",
              onPress: () => {
                void rpc("calendar/disconnect")
                  .then(() => rpc<State>("calendar/status"))
                  .then(setState)
                  .catch(() => Alert.alert("Could not disconnect Calendar", "Try again."));
              },
            },
          ]);
        }}
      />
    </View>
  );
}
