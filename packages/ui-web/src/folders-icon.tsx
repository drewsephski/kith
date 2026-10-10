"use client";

import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "./lib/utils.js";
import { useIconAnimation } from "./use-icon-animation.js";

export interface FoldersIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface FoldersIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const FoldersIcon = forwardRef<FoldersIconHandle, FoldersIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const { controls, hoverProps } = useIconAnimation(ref, onMouseEnter, onMouseLeave);

    return (
      <div className={cn("inline-flex shrink-0", className)} {...hoverProps} {...props}>
        <svg
          aria-hidden="true"
          focusable="false"
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            initial="normal"
            animate={controls}
            d="M20 17a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.9a2 2 0 0 1-1.69-.9l-.81-1.2a2 2 0 0 0-1.67-.9H8a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z"
            transition={{ type: "spring", stiffness: 250, damping: 25 }}
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: -2, translateY: 2 },
            }}
          />
          <motion.path
            initial="normal"
            animate={controls}
            d="M2 8v11a2 2 0 0 0 2 2h14"
            transition={{ type: "spring", stiffness: 250, damping: 25 }}
            variants={{
              normal: { translateX: 0, translateY: 0, opacity: 1, scale: 1 },
              animate: { translateX: 2, translateY: -2, opacity: 0, scale: 0.9 },
            }}
          />
        </svg>
      </div>
    );
  },
);

FoldersIcon.displayName = "FoldersIcon";

export { FoldersIcon };
