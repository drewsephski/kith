import type { EmailCard as EmailBlock, EmailContent, EmailDraftEdits } from "@rakazo/contracts";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { MobileMessage } from "../lib/api";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { NativeActionButton } from "./native-action-button";

export function EmailPreview({
  email,
  onChange,
}: {
  email: EmailContent;
  onChange?: (edits: EmailDraftEdits) => void;
}) {
  const [bodyHeight, setBodyHeight] = useState(20);
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const headers = [
    [t("Account"), email.account],
    [t("From"), email.from === email.account ? undefined : email.from],
    [t("To"), email.to.join(", ")],
    [t("Cc"), email.cc.join(", ")],
    [t("Bcc"), email.bcc.join(", ")],
    [t("Attachments"), email.attachments?.join(", ")],
  ];
  return (
    <View style={{ gap: 6, width: "100%" }}>
      {onChange ? (
        <TextInput
          accessibilityLabel={t("Email subject")}
          value={email.subject}
          onChangeText={(subject) => onChange({ subject, body: email.body })}
          maxLength={1000}
          style={{
            color: tokens.foreground,
            fontSize: 13,
            lineHeight: 20,
            fontWeight: "500",
            padding: 0,
          }}
        />
      ) : (
        <Text
          selectable
          style={{ color: tokens.foreground, fontSize: 13, lineHeight: 20, fontWeight: "500" }}
        >
          {email.subject || t("No subject")}
        </Text>
      )}
      {headers
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <View key={label} style={{ flexDirection: "row", gap: 8 }}>
            <Text
              style={{
                color: tokens.mutedForeground,
                opacity: 0.8,
                fontSize: 10,
                lineHeight: 15,
                width: 60,
              }}
            >
              {label}
            </Text>
            <Text
              selectable
              style={{
                color: tokens.foreground,
                opacity: 0.75,
                fontSize: 11,
                lineHeight: 15,
                flex: 1,
                flexShrink: 1,
              }}
            >
              {value}
            </Text>
          </View>
        ))}
      <View style={{ borderTopWidth: 1, borderColor: tokens.border, paddingTop: 8 }}>
        <TextInput
          accessibilityLabel={t("Email body")}
          value={email.body}
          onChangeText={(body) => onChange?.({ subject: email.subject, body })}
          editable={Boolean(onChange)}
          maxLength={50000}
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          onContentSizeChange={(event) =>
            setBodyHeight(Math.max(20, Math.ceil(event.nativeEvent.contentSize.height)))
          }
          style={{
            color: tokens.foreground,
            opacity: 0.9,
            fontSize: 12,
            lineHeight: 20,
            height: bodyHeight,
            padding: 0,
          }}
        />
      </View>
    </View>
  );
}

export function EmailCard({
  block,
  message,
  blockIndex,
  groupId,
}: {
  block: EmailBlock;
  message: MobileMessage;
  blockIndex: number;
  groupId?: string;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const readOnly = useThreadReadOnly();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(block.email.subject);
  const [body, setBody] = useState(block.email.body);
  const changed = subject !== block.email.subject || body !== block.email.body;
  async function act() {
    if (readOnly || locked.current || requested || !message.botId) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await rpc("threads/send", {
        ...(groupId
          ? { groupId, mentions: [{ kind: "bot", id: message.botId }] }
          : { botId: message.botId }),
        emailAction: {
          messageId: message.id,
          blockIndex,
          ...(changed ? { edits: { subject, body } } : {}),
        },
        replyToMessageId: message.id,
      });
      setRequested(true);
    } catch (cause) {
      setError(errorText(cause, t("Could not request email action")));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        width: "100%",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: tokens.border,
        backgroundColor: tokens.card,
        padding: 12,
        gap: 10,
      }}
    >
      <EmailPreview
        email={{ ...block.email, subject, body }}
        onChange={
          block.mode === "draft" && !readOnly && !busy && !requested && message.botId
            ? (edits) => {
                setSubject(edits.subject);
                setBody(edits.body);
              }
            : undefined
        }
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <NativeActionButton
          label={requested ? t("Requested") : block.mode === "draft" ? t("Send") : t("Reply")}
          busy={busy}
          disabled={readOnly || requested || !message.botId}
          fill={false}
          size="compact"
          onPress={() => void act()}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.destructive, fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
