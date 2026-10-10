import { useState } from "react";
import type { ViewProps } from "react-native";
import { Alert, Pressable, Text, View } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native } from "../lib/native";
import { errorText } from "../lib/user-error";
import { NativeActionButton } from "./native-action-button";

type AskAction = { id: string; label: string };

const KNOWN_ASK_ACTION_LABELS: Record<string, string> = {
  allow: "Allow once",
  always: "Always allow",
  deny: "Deny",
};

export function AskActions({
  actions,
  disabled,
  emailReview = false,
  emailPreviewAvailable = true,
  onAnswer,
  accessibilityActions,
  onAccessibilityAction,
}: {
  actions: AskAction[];
  disabled?: boolean;
  emailReview?: boolean;
  emailPreviewAvailable?: boolean;
  onAnswer: (answer: string) => Promise<void>;
  accessibilityActions?: ViewProps["accessibilityActions"];
  onAccessibilityAction?: ViewProps["onAccessibilityAction"];
}) {
  const { t } = useI18n();
  const tokens = mobileTokens();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const submitting = pendingAction !== null;

  async function submit(answer: string) {
    if (disabled || submitting) return;
    if (emailReview && !emailPreviewAvailable && answer === "allow") return;
    setPendingAction(answer);
    try {
      await onAnswer(answer);
    } catch (error) {
      Alert.alert(t("Could not submit answer"), errorText(error, t("Please try again.")));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <View
      style={{
        marginTop: emailReview ? 10 : 12,
        gap: emailReview ? 8 : 6,
        flexDirection: emailReview ? "row" : "column",
        flexWrap: emailReview ? "wrap" : undefined,
      }}
    >
      {actions.map((action) => {
        if (emailReview)
          return (
            <NativeActionButton
              key={action.id}
              label={action.id === "allow" ? t("Send") : t("Cancel")}
              prominence={action.id === "allow" ? "primary" : "secondary"}
              busy={pendingAction === action.id}
              disabled={disabled || submitting || (action.id === "allow" && !emailPreviewAvailable)}
              size="compact"
              fill={false}
              onPress={() => void submit(action.id)}
            />
          );
        const emphasized = action.id === "allow" || action.id === "always";
        return (
          <Pressable
            key={action.id}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            disabled={disabled || submitting}
            onPress={() => void submit(action.id)}
            style={{
              alignSelf: "stretch",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              backgroundColor: emphasized ? native.fillPressed : native.fill,
              opacity: disabled || submitting ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: tokens.foreground,
                fontSize: 15,
                fontWeight: emphasized ? "600" : "400",
              }}
            >
              {pendingAction === action.id
                ? t("Sending…")
                : emailReview && action.id === "allow"
                  ? t("Send")
                  : emailReview && action.id === "deny"
                    ? t("Cancel")
                    : Object.hasOwn(KNOWN_ASK_ACTION_LABELS, action.id)
                      ? t(KNOWN_ASK_ACTION_LABELS[action.id]!)
                      : action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
