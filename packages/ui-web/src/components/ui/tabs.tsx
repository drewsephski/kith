import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@rakazo/ui-web/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { cloneElement } from "react";
import { SelectionGroup, SelectionIndicator } from "../../selection-indicator.js";

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <SelectionGroup>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </SelectionGroup>
  );
}

function TabsTrigger({ className, render, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative isolate inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
      render={(elementProps, state) => {
        const children = (
          <>
            {state.active ? (
              <SelectionIndicator className="bg-background shadow-sm group-data-[variant=line]/tabs-list:inset-auto group-data-[variant=line]/tabs-list:rounded-full group-data-[variant=line]/tabs-list:bg-primary group-data-[variant=line]/tabs-list:shadow-none group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:inset-x-0 group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:-bottom-1 group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:h-0.5 group-data-[variant=line]/tabs-list:group-data-vertical/tabs:inset-y-0 group-data-[variant=line]/tabs-list:group-data-vertical/tabs:-end-1 group-data-[variant=line]/tabs-list:group-data-vertical/tabs:w-0.5" />
            ) : null}
            {elementProps.children}
          </>
        );
        if (typeof render === "function") return render({ ...elementProps, children }, state);
        if (render) return cloneElement(render, elementProps, children);
        return <button {...elementProps}>{children}</button>;
      }}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
