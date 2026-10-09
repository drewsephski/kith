import type { ComponentProps } from "react";
import { Button } from "./components/ui/button.js";
import { cn } from "./lib/utils.js";
import { SelectionIndicator } from "./selection-indicator.js";

/** Use within SelectionGroup to connect the active row across navigation changes. */
export function NavigationButton({
  selected,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & { selected: boolean }) {
  return (
    <Button
      variant="ghost"
      aria-current={selected ? "page" : undefined}
      data-selected={selected}
      className={cn(
        "relative isolate w-full justify-start text-start transition-colors duration-150 active:translate-y-0",
        selected
          ? "font-medium text-sidebar-accent-foreground hover:bg-transparent hover:text-sidebar-accent-foreground"
          : "font-normal text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    >
      {selected ? <SelectionIndicator className="bg-sidebar-accent" /> : null}
      {children}
    </Button>
  );
}
