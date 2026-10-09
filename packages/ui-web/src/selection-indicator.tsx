import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "./lib/utils.js";

/** Each navigation or tab group owns its indicator, including concurrent dialogs. */
export function SelectionGroup({ children }: { children: ReactNode }) {
  const id = useId();
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

export function SelectionIndicator({
  className,
  layoutId = "selection",
}: {
  className?: string;
  /** An explicit scope for existing navigation trees without a SelectionGroup. */
  layoutId?: string;
}) {
  const reducedMotion = useReducedMotion();
  const classes = cn("pointer-events-none absolute inset-0 -z-10 rounded-[inherit]", className);
  if (reducedMotion) {
    return <span aria-hidden="true" data-slot="selection-indicator" className={classes} />;
  }
  return (
    <motion.span
      aria-hidden="true"
      data-slot="selection-indicator"
      layoutId={layoutId}
      initial={false}
      transition={{ layout: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
      className={classes}
    />
  );
}
