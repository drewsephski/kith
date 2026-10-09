import { CalendarIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { de, enUS, es, fr, hi, ko, ptBR, ru, tr, zhCN } from "react-day-picker/locale";
import { Button } from "./components/ui/button.js";
import { Calendar } from "./components/ui/calendar.js";
import { Input } from "./components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";
import { cn } from "./lib/utils.js";

const locales = { en: enUS, de, es, fr, hi, ko, "pt-BR": ptBR, ru, tr, "zh-CN": zhCN };

type DatePickerProps = Omit<ComponentProps<typeof Button>, "value" | "onChange" | "children"> & {
  /** Local calendar date (YYYY-MM-DD), or local date/time when withTime is enabled. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  locale?: string;
} & ({ withTime?: false; timeLabel?: never } | { withTime: true; timeLabel: string });

/** A shared shadcn Calendar + Popover field; dates never pass through UTC. */
export function DatePicker({
  value,
  onValueChange,
  placeholder,
  clearLabel,
  locale = "en",
  withTime = false,
  timeLabel,
  className,
  disabled,
  ...triggerProps
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [dateValue = "", time = "09:00"] = value.split("T");
  const selected = dateValue ? new Date(`${dateValue}T00:00:00`) : undefined;
  const calendarLocale = locales[locale as keyof typeof locales] ?? enUS;
  const label = selected
    ? selected.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
    : placeholder;

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            data-value={value}
            data-empty={!dateValue}
            className={cn(
              "w-full min-w-0 justify-start font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
            {...triggerProps}
          />
        }
      >
        <CalendarIcon aria-hidden />
        <span className="truncate">{withTime && dateValue ? `${label} · ${time}` : label}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={triggerProps["aria-label"] ?? placeholder}
        className="w-auto max-w-[calc(100vw-1rem)] gap-0 p-0"
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          locale={calendarLocale}
          autoFocus
          onSelect={(date) => {
            const next = date
              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
              : "";
            onValueChange(next && withTime ? `${next}T${time}` : next);
            if (!withTime) setOpen(false);
          }}
        />
        <div className="flex items-center gap-2 border-t border-border p-2">
          {withTime ? (
            <Input
              type="time"
              aria-label={timeLabel}
              value={dateValue ? time : ""}
              disabled={!dateValue}
              onChange={(event) => onValueChange(`${dateValue}T${event.target.value}`)}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!value}
            onClick={() => {
              onValueChange("");
              setOpen(false);
            }}
          >
            {clearLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
