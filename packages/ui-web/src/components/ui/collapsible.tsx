import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@rakazo/ui-web/lib/utils";
import { ChevronDownIcon } from "lucide-react";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, children, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "group/collapsible-trigger flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon
        aria-hidden
        className="size-4 shrink-0 transition-transform duration-200 ease-out group-aria-expanded/collapsible-trigger:rotate-180 motion-reduce:transition-none"
      />
    </CollapsiblePrimitive.Trigger>
  );
}

function CollapsibleContent({
  className,
  keepMounted = true,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      keepMounted={keepMounted}
      className={cn("ui-collapsible-panel", className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
