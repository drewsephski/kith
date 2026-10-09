import { t } from "../../lib/i18n";
import { TaskField } from "./controls";

/** The Expo web fallback; native platforms use their installed system pickers. */
export function TaskDateField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <TaskField
      label={t("Due date (YYYY-MM-DD)")}
      disabled={disabled}
      value={value ?? ""}
      onChange={(date) => onChange(date || null)}
    />
  );
}
