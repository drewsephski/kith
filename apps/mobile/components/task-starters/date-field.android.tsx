import { DateTimePicker, Host } from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { View } from "react-native";
import { t } from "../../lib/i18n";
import { useResolvedAppearance } from "../../lib/native";
import { NativeActionButton } from "../native-action-button";

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
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <NativeActionButton
        label={value ? t("Due date: {date}", { date: value }) : t("Add due date")}
        prominence="plain"
        fill={false}
        disabled={disabled}
        onPress={() => setOpen((previous) => !previous)}
      />
      {open ? (
        <Host
          colorScheme={appearance}
          matchContents
          style={{ width: "100%" }}
          pointerEvents={disabled ? "none" : "auto"}
        >
          <DateTimePicker
            initialDate={value ? `${value}T00:00:00.000Z` : null}
            displayedComponents="date"
            onDateSelected={(date) => onChange(date.toISOString().slice(0, 10))}
          />
        </Host>
      ) : null}
      {value ? (
        <NativeActionButton
          label={t("Remove due date")}
          prominence="plain"
          fill={false}
          disabled={disabled}
          onPress={() => {
            setOpen(false);
            onChange(null);
          }}
        />
      ) : null}
    </View>
  );
}
