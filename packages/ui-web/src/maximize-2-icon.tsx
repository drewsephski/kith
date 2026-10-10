"use client";

import type { Transition } from "framer-motion";
import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "./lib/utils.js";
import { useIconAnimation } from "./use-icon-animation.js";

export interface Maximize2IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface Maximize2IconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 250,
  damping: 25,
};

const Maximize2Icon = forwardRef<Maximize2IconHandle, Maximize2IconProps>(
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
            d="M3 16.2V21m0 0h4.8M3 21l6-6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: "0%", translateY: "0%" },
              animate: { translateX: "-2px", translateY: "2px" },
            }}
          />
          <motion.path
            initial="normal"
            animate={controls}
            d="M21 7.8V3m0 0h-4.8M21 3l-6 6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: "0%", translateY: "0%" },
              animate: { translateX: "2px", translateY: "-2px" },
            }}
          />
        </svg>
      </div>
    );
  },
);

Maximize2Icon.displayName = "Maximize2Icon";

export { Maximize2Icon };
