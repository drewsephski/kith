import type { MessageBlock } from "@rakazo/contracts";
import { BOT_NAME_MAX_LENGTH, BOT_TITLE_MAX_LENGTH } from "@rakazo/contracts";
import { BOT_IDENTITY_PRESETS } from "@rakazo/core";
import { useRef, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { captureApiRequestContext, captureMobileScreenScope, rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { threadCardWidth } from "../lib/message-presentation";
import { native, useMobileTokens } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { BotAvatar } from "./bot-avatar";
import { NativeActionButton } from "./native-action-button";

type Identity =
  | { presetId: "miso" | "pippin" | "orbit" | "pixel" }
  | { name: string; role: string };

export function BotIdentityCard({
  botId,
  botColor = "ink",
  messageId,
  block,
}: {
  botId: string;
  botColor?: string;
  messageId: string;
  block: Extract<MessageBlock, { kind: "choice" }>;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const readOnly = useThreadReadOnly();
  const { width } = useWindowDimensions();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [localAnswer, setLocalAnswer] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const roleField = useRef<TextInput>(null);
  const current = useRef(captureMobileScreenScope()).current;
  const answerId = block.answerId ?? localAnswer;
  const labels: Record<string, string> = {
    miso: t("Inbox assistant"),
    pippin: t("Research assistant"),
    orbit: t("Planning assistant"),
    pixel: t("Coding partner"),
  };

  async function save(identity: Identity) {
    if (readOnly || submitting.current || answerId || !current()) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const requestContext = await captureApiRequestContext();
      if (!current()) return;
      await rpc("onboarding/identity", { botId, messageId, identity }, { requestContext });
      if (!current()) return;
      setLocalAnswer("presetId" in identity ? identity.presetId : "custom");
      Keyboard.dismiss();
    } catch (reason) {
      if (current()) setError(errorText(reason, t("Could not save this choice")));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const fieldStyle = {
    backgroundColor: native.page,
    borderRadius: 10,
    minHeight: 48,
    padding: 12,
    color: tokens.foreground,
    fontSize: 16,
  };
  return (
    <View
      testID="bot-identity-card"
      style={{
        width: threadCardWidth(width),
        backgroundColor: native.fill,
        padding: 16,
        borderRadius: 18,
        gap: 12,
      }}
    >
      {!answerId ? (
        <Text accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 15.5 }}>
          {t("What should my name be, and what's my role?")}
        </Text>
      ) : null}
      {!custom || answerId ? (
        <View style={{ gap: 8 }}>
          {block.options
            .filter((option) => !answerId || option.id === answerId)
            .map((option) => (
              <Pressable
                key={option.id}
                testID={`bot-identity-${option.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${option.label}, ${labels[option.id] ?? option.description ?? ""}`}
                accessibilityState={{
                  disabled: readOnly || busy || Boolean(answerId),
                  selected: answerId === option.id,
                }}
                disabled={readOnly || busy || Boolean(answerId)}
                onPress={() => {
                  const preset = BOT_IDENTITY_PRESETS.find((entry) => entry.id === option.id);
                  if (preset) void save({ presetId: preset.id });
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 12,
                  minHeight: 60,
                  padding: 12,
                  backgroundColor:
                    pressed || answerId === option.id ? native.fillPressed : native.page,
                  opacity: busy ? 0.6 : 1,
                })}
              >
                <BotAvatar color={botColor} identity={botId} variant="organic" size={32} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: tokens.foreground, fontSize: 15, fontWeight: "500" }}>
                    {option.label}
                  </Text>
                  <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>
                    {labels[option.id] ?? option.description}
                  </Text>
                </View>
              </Pressable>
            ))}
          {localAnswer === "custom" && !block.answerId ? (
            <Text style={{ color: tokens.foreground }}>
              {name} · {role}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!readOnly && !answerId ? (
        custom ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: tokens.mutedForeground }}>{t("Name")}</Text>
            <TextInput
              autoFocus
              accessibilityLabel={t("Name")}
              value={name}
              onChangeText={setName}
              maxLength={BOT_NAME_MAX_LENGTH}
              editable={!busy}
              autoComplete="off"
              returnKeyType="next"
              onSubmitEditing={() => roleField.current?.focus()}
              style={fieldStyle}
            />
            <Text style={{ color: tokens.mutedForeground }}>{t("Role")}</Text>
            <TextInput
              ref={roleField}
              accessibilityLabel={t("Role")}
              value={role}
              onChangeText={setRole}
              maxLength={BOT_TITLE_MAX_LENGTH}
              editable={!busy}
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (name.trim() && role.trim()) void save({ name: name.trim(), role: role.trim() });
              }}
              style={fieldStyle}
            />
            <NativeActionButton
              label={busy ? t("Saving…") : t("Save")}
              busy={busy}
              disabled={!name.trim() || !role.trim()}
              onPress={() => void save({ name: name.trim(), role: role.trim() })}
            />
            <NativeActionButton
              label={t("Cancel")}
              prominence="quiet"
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                setCustom(false);
              }}
            />
          </View>
        ) : (
          <NativeActionButton
            label={t("Custom")}
            prominence="quiet"
            disabled={busy}
            onPress={() => setCustom(true)}
          />
        )
      ) : null}
      {error && !answerId ? (
        <Text selectable accessibilityRole="alert" style={{ color: tokens.destructive }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
