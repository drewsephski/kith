import type { Connection, MessageBlock } from "@rakazo/contracts";
import { waitForAppConnection } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import type { ViewProps } from "react-native";
import { Linking, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { appConnectPresentation } from "../lib/app-connect";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { ConnectorIcon } from "./connector-icon";
import { NativeActionButton } from "./native-action-button";

export function AppConnectCard({
  botId,
  threadId,
  block,
  accessibilityActions,
  onAccessibilityAction,
}: {
  botId: string;
  threadId?: string;
  block: Extract<MessageBlock, { kind: "app_connect" }>;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const readOnly = useThreadReadOnly();
  const tokens = useMobileTokens();
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState<"pending" | "connected">(block.status);
  const [error, setError] = useState<string | null>(null);
  const [authorization, setAuthorization] = useState<{
    connectionId: string;
    authorizationUrl: string | null;
  } | null>(null);
  const connectionAttempt = useRef<AbortController | null>(null);
  const status = block.status === "connected" ? "connected" : localStatus;
  const view = appConnectPresentation({ ...block, status }, busy);

  useEffect(() => () => connectionAttempt.current?.abort(), []);

  async function connect() {
    if (readOnly || busy || status === "connected") return;
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    setBusy(true);
    setError(null);
    try {
      const started =
        authorization ??
        (await rpc<{ connectionId: string; authorizationUrl: string | null }>(
          "connections/begin",
          {
            connectorId: block.connectorId ?? "composio",
            provider: block.provider,
            displayName: block.name,
          },
          { signal: controller.signal },
        ));
      controller.signal.throwIfAborted();
      if (started.authorizationUrl) {
        const url = new URL(started.authorizationUrl);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error("Account authorization requires a secure URL");
      }
      setAuthorization(started);
      if (started.authorizationUrl && !authorization)
        await Linking.openURL(started.authorizationUrl);
      const row = await waitForAppConnection(
        () =>
          rpc<Connection>(
            "connections/complete",
            { connectionId: started.connectionId },
            { signal: controller.signal },
          ),
        { signal: controller.signal },
      );
      controller.signal.throwIfAborted();
      if (row.status !== "connected") {
        if (row.status !== "pending") setAuthorization(null);
        setError(t("Connection is still pending. Finish connecting and check again."));
        return;
      }
      await rpc(
        "onboarding/appConnected",
        {
          botId,
          threadId,
          provider: block.provider,
          connectorId: block.connectorId ?? "composio",
        },
        { signal: controller.signal },
      );
      controller.signal.throwIfAborted();
      setLocalStatus("connected");
      setAuthorization(null);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(errorText(reason, t("Could not connect this app")));
      }
    } finally {
      if (connectionAttempt.current === controller) {
        connectionAttempt.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <View
      accessibilityLabel={t("{name} connection", { name: block.name })}
      style={{
        width: "100%",
        maxWidth: 380,
        borderRadius: 16,
        backgroundColor: tokens.card,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ConnectorIcon name={block.name} brand={block.provider} logo={block.logo} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            style={{ color: tokens.foreground, fontSize: 15, fontWeight: "600" }}
          >
            {view.title}
          </Text>
          {view.description ? (
            <Text style={{ color: tokens.mutedForeground, fontSize: 13.5 }} numberOfLines={2}>
              {view.description}
            </Text>
          ) : null}
        </View>
        {view.showAuthorize && !readOnly ? (
          <NativeActionButton
            label={authorization && !busy ? t("Check connection") : view.actionLabel}
            accessibilityLabel={
              authorization
                ? t("Check {name} connection", { name: block.name })
                : t("Connect {name}", { name: block.name })
            }
            fill={false}
            busy={busy}
            style={{ alignSelf: "center" }}
            onPress={() => void connect()}
          />
        ) : !view.showAuthorize ? (
          <Text style={{ color: tokens.success, fontSize: 13.5, fontWeight: "600" }}>
            {view.actionLabel}
          </Text>
        ) : null}
      </View>
      {authorization?.authorizationUrl && status !== "connected" && !readOnly ? (
        <NativeActionButton
          label={t("Continue connecting")}
          fill={false}
          onPress={() => {
            if (authorization.authorizationUrl)
              void Linking.openURL(authorization.authorizationUrl).catch((cause) =>
                setError(errorText(cause, t("Could not open authorization"))),
              );
          }}
        />
      ) : null}
      {error ? <Text style={{ color: tokens.destructive, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}
