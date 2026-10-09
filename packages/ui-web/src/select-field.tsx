import type { ComponentProps, ReactNode } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.js";

type SelectFieldProps = ComponentProps<typeof SelectTrigger> & {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: ReactNode; disabled?: boolean }>;
};

/** A single-choice field using the shared shadcn Select, including empty/default values. */
export function SelectField({ value, onValueChange, items, disabled, ...triggerProps }: SelectFieldProps) {
  return (
    <Select value={value} items={items} disabled={disabled} onValueChange={(next) => { if (next !== null) onValueChange(next); }}>
      <SelectTrigger {...triggerProps}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
