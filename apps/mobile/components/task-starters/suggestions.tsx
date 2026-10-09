import type { TaskStarterId } from "@rakazo/contracts";
import { TASK_STARTERS } from "@rakazo/core";
import { View } from "react-native";
import { t } from "../../lib/i18n";
import { NativeActionButton } from "../native-action-button";

export function TaskStarterSuggestions({
  onSelect,
}: {
  onSelect: (starter: { id: TaskStarterId; prompt: string }) => void;
}) {
  return (
    <View accessibilityLabel={t("Start a task")} style={{ gap: 12 }}>
      {TASK_STARTERS.map((starter) => (
        <NativeActionButton
          key={starter.id}
          label={t(starter.title)}
          prominence="secondary"
          fill
          onPress={() => onSelect(starter)}
        />
      ))}
    </View>
  );
}
