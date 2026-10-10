"use client";

import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "./lib/utils.js";
import { useIconAnimation } from "./use-icon-animation.js";

export interface PanelLeftCloseIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PanelLeftCloseIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PanelLeftCloseIcon = forwardRef<PanelLeftCloseIconHandle, PanelLeftCloseIconProps>(
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
          <rect height="18" rx="2" width="18" x="3" y="3" />
          <path d="M9 3v18" />
          <motion.path
            initial="normal"
            animate={controls}
            d="m16 15-3-3 3-3"
            transition={{ times: [0, 0.4, 1], duration: 0.5 }}
            variants={{ normal: { x: 0 }, animate: { x: [0, -1.5, 0] } }}
          />
        </svg>
      </div>
    );
  },
);

PanelLeftCloseIcon.displayName = "PanelLeftCloseIcon";

export { PanelLeftCloseIcon };
