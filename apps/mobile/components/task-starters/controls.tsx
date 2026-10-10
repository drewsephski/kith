import { MenuView } from "@expo/ui/community/menu";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../../lib/i18n";
import { useMobileTokens } from "../../lib/native";
import { ScrollView } from "../minimal-scroll";
import { NativeActionButton } from "../native-action-button";
import { NativeSwitch } from "../native-switch";

export function TaskSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const tokens = useMobileTokens();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: tokens.background,
          paddingTop: Platform.OS === "ios" ? 12 : insets.top + 12,
        }}
      >
        <View accessibilityViewIsModal style={{ flex: 1 }}>
          <View
            style={{
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ flex: 1, color: tokens.foreground, fontSize: 20, fontWeight: "600" }}
            >
              {title}
            </Text>
            <NativeActionButton
              label={t("Close")}
              prominence="plain"
              fill={false}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function TaskText({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const tokens = useMobileTokens();
  return (
    <Text
      selectable
      style={{
        color: error ? tokens.destructive : tokens.foreground,
        fontSize: 15,
        lineHeight: 22,
      }}
    >
      {children}
    </Text>
  );
}

export function TaskField({
  label,
  value,
  onChange,
  numeric = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  disabled?: boolean;
}) {
  const tokens = useMobileTokens();
  return (
    <View style={{ gap: 6 }}>
      <TaskText>{label}</TaskText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        editable={!disabled}
        onChangeText={onChange}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: tokens.border,
          borderRadius: 10,
          padding: 12,
          fontSize: 16,
          color: tokens.foreground,
        }}
      />
    </View>
  );
}

export function TaskToggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <TaskText>{label}</TaskText>
      </View>
      <NativeSwitch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
    </View>
  );
}

export function TaskPicker({
  label,
  value,
  choices,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  choices: ReadonlyArray<{ id: string; label: string }>;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <MenuView
      title={label}
      actions={choices.map((choice) => ({
        id: choice.id,
        title: choice.label,
        state: choice.id === value ? "on" : "off",
      }))}
      onPressAction={({ nativeEvent }) => {
        if (!disabled) onChange(nativeEvent.event);
      }}
    >
      <View pointerEvents={disabled ? "none" : "auto"}>
        <NativeActionButton
          label={`${label}: ${choices.find((choice) => choice.id === value)?.label ?? t("Choose")}`}
          accessibilityLabel={label}
          disabled={disabled || !choices.length}
          fill={false}
          prominence="secondary"
          onPress={() => undefined}
        />
      </View>
    </MenuView>
  );
}
