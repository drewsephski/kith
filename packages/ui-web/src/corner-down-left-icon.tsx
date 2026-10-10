"use client";

// Adapted from https://github.com/pqoqubbw/icons/blob/main/icons/corner-down-left.tsx
// MIT license: ../LUCIDE-ANIMATED-LICENSE.
import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "./lib/utils.js";
import type { AnimatedIconHandle } from "./use-icon-animation.js";
import { useIconAnimation } from "./use-icon-animation.js";

const STRETCH_VARIANTS: Variants = {
  normal: { scaleX: 1, x: 0, opacity: 1 },
  animate: {
    scaleX: [1, 1.15, 1],
    x: [0, -2, 0],
    transition: { duration: 0.45, ease: "easeInOut" },
  },
};

export type CornerDownLeftIconHandle = AnimatedIconHandle;
interface CornerDownLeftIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export const CornerDownLeftIcon = forwardRef<CornerDownLeftIconHandle, CornerDownLeftIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const { controls, hoverProps } = useIconAnimation(ref, onMouseEnter, onMouseLeave);
    return (
      <div className={cn("inline-flex shrink-0", className)} {...hoverProps} {...props}>
        <motion.svg
          aria-hidden="true"
          focusable="false"
          animate={controls}
          fill="none"
          height={size}
          initial="normal"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          variants={STRETCH_VARIANTS}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 15h12a4 4 0 0 0 4-4V4" />
          <path d="m9 20-5-5 5-5" />
        </motion.svg>
      </div>
    );
  },
);
CornerDownLeftIcon.displayName = "CornerDownLeftIcon";
