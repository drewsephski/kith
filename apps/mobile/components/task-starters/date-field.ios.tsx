import { DatePicker, Host } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  datePickerStyle,
  disabled as disable,
} from "@expo/ui/swift-ui/modifiers";
import { View } from "react-native";
import { t } from "../../lib/i18n";
import { useResolvedAppearance } from "../../lib/native";
import { NativeActionButton } from "../native-action-button";

function civilDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function TaskDateField({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const appearance = useResolvedAppearance();
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
  const selection = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return value ? (
    <View style={{ gap: 8 }}>
      <Host colorScheme={appearance} ignoreSafeArea="container" matchContents>
        <DatePicker
          title={t("Due date")}
          displayedComponents={["date"]}
          selection={selection}
          onDateChange={(date) => onChange(civilDate(date))}
          modifiers={[
            datePickerStyle("compact"),
            accessibilityLabel(t("Due date")),
            disable(disabled),
          ]}
        />
      </Host>
      <NativeActionButton
        label={t("Remove due date")}
        prominence="plain"
        fill={false}
        disabled={disabled}
        onPress={() => onChange(null)}
      />
    </View>
  ) : (
    <NativeActionButton
      label={t("Add due date")}
      prominence="plain"
      fill={false}
      disabled={disabled}
      onPress={() => onChange(civilDate(new Date()))}
    />
  );
}
