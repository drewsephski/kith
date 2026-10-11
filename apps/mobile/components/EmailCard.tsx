import type { EmailCard as EmailBlock, EmailContent, EmailDraftEdits } from "@rakazo/contracts";
import { useRef, useState } from "react";
import type { TextStyle } from "react-native";
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import type { MobileMessage } from "../lib/api";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { stacksAtTextScale } from "../lib/text-scale";
import { useThreadReadOnly } from "../lib/thread-read-only";
import { errorText } from "../lib/user-error";
import { NativeActionButton } from "./native-action-button";

type EmailTextStyle = TextStyle & { fontSize: number; lineHeight: number };

/** Text owns the layout so a multiline input cannot clip its own content. */
function EmailTextField({
  value,
  label,
  onChange,
  maxLength,
  style,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  maxLength: number;
  style: EmailTextStyle;
}) {
  const { fontScale } = useWindowDimensions();
  // Text and TextInput otherwise recalculate native Dynamic Type at different
  // times. Scale both together so their line wrapping and height always agree.
  const scaledStyle = {
    ...style,
    fontSize: style.fontSize * fontScale,
    lineHeight: style.lineHeight * fontScale,
  };
  return (
    <View style={{ minHeight: scaledStyle.lineHeight }}>
      <Text
        allowFontScaling={false}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[scaledStyle, { opacity: 0 }]}
      >
        {`${value}\u200b`}
      </Text>
      <TextInput
        allowFontScaling={false}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        style={[StyleSheet.absoluteFill, scaledStyle, { padding: 0 }]}
      />
    </View>
  );
}

export function EmailPreview({
  email,
  onChange,
}: {
  email: EmailContent;
  onChange?: (edits: EmailDraftEdits) => void;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const { fontScale } = useWindowDimensions();
  const stacked = stacksAtTextScale(fontScale);
  const subjectStyle: EmailTextStyle = {
    color: tokens.foreground,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  };
  const bodyStyle: EmailTextStyle = { color: tokens.foreground, fontSize: 15, lineHeight: 22 };
  const headers = [
    [t("Account"), email.account],
    [t("From"), email.from === email.account ? undefined : email.from],
    [t("To"), email.to.join(", ")],
    [t("Cc"), email.cc.join(", ")],
    [t("Bcc"), email.bcc.join(", ")],
    [t("Attachments"), email.attachments?.join(", ")],
  ];
  return (
    <View style={{ gap: 8, width: "100%" }}>
      {onChange ? (
        <EmailTextField
          label={t("Email subject")}
          value={email.subject}
          onChange={(subject) => onChange({ subject, body: email.body })}
          maxLength={1000}
          style={subjectStyle}
        />
      ) : (
        <Text selectable style={subjectStyle}>
          {email.subject || t("No subject")}
        </Text>
      )}
      {headers
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <View
            key={label}
            style={{ flexDirection: stacked ? "column" : "row", gap: stacked ? 2 : 8 }}
          >
            <Text
              style={{
                color: tokens.mutedForeground,
                fontSize: 13,
                lineHeight: 20,
                ...(stacked ? {} : { width: 80 }),
              }}
            >
              {label}
            </Text>
            <Text
              selectable
              style={{
                color: tokens.foreground,
                fontSize: 14,
                lineHeight: 20,
                ...(stacked ? {} : { flex: 1 }),
                flexShrink: 1,
              }}
            >
              {value}
            </Text>
          </View>
        ))}
      <View style={{ borderTopWidth: 1, borderColor: tokens.border, paddingTop: 8 }}>
        {onChange ? (
          <EmailTextField
            label={t("Email body")}
            value={email.body}
            onChange={(body) => onChange({ subject: email.subject, body })}
            maxLength={50000}
            style={bodyStyle}
          />
        ) : (
          <Text selectable style={bodyStyle}>
            {email.body}
          </Text>
        )}
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
  const action = message.emailActions?.find((state) => state.blockIndex === blockIndex);
  const accepted = requested || Boolean(action);
  const statusLabel = action
    ? {
        completed: t("Completed"),
        queued: t("Request queued"),
        waiting_input: t("Needs attention"),
        awaiting_approval: t("Awaiting final approval"),
        sending: t("Sending…"),
        sent: t("Sent and verified"),
        failed: t("Failed"),
        uncertain: t("Verify before retrying"),
        cancelled: t("Cancelled"),
      }[action.status]
    : undefined;
  const changed = subject !== block.email.subject || body !== block.email.body;
  async function act() {
    if (readOnly || locked.current || accepted || !message.botId) return;
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
        email={action?.email ?? { ...block.email, subject, body }}
        onChange={
          block.mode === "draft" && !readOnly && !busy && !accepted && message.botId
            ? (edits) => {
                setSubject(edits.subject);
                setBody(edits.body);
              }
            : undefined
        }
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <NativeActionButton
          label={
            statusLabel ??
            (requested ? t("Requested") : block.mode === "draft" ? t("Send") : t("Reply"))
          }
          busy={busy}
          disabled={readOnly || accepted || !message.botId}
          fill={false}
          onPress={() => void act()}
        />
      </View>
      {block.provenance !== "provider" ? (
        <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>
          {t("Unverified email preview")}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.destructive, fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
