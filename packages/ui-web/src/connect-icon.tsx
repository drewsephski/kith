"use client";

import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "./lib/utils.js";
import { useIconAnimation } from "./use-icon-animation.js";

export interface ConnectIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ConnectIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PLUG_VARIANTS: Variants = {
  normal: {
    x: 0,
    y: 0,
  },
  animate: {
    x: -3,
    y: 3,
  },
};

const SOCKET_VARIANTS: Variants = {
  normal: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 3,
    y: -3,
  },
};

const PATH_VARIANTS = {
  normal: (custom: { x: number; y: number }) => ({
    d: `M${custom.x} ${custom.y} l2.5 -2.5`,
  }),
  animate: (custom: { x: number; y: number }) => ({
    d: `M${custom.x + 2.93} ${custom.y - 2.93} l0.10 -0.10`,
  }),
};

const ConnectIcon = forwardRef<ConnectIconHandle, ConnectIconProps>(
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
            d="M19 5l3 -3"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            variants={{
              normal: {
                d: "M19 5l3 -3",
              },
              animate: {
                d: "M17 7l5 -5",
              },
            }}
          />
          <motion.path
            initial="normal"
            animate={controls}
            d="m2 22 3-3"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            variants={{
              normal: {
                d: "m2 22 3-3",
              },
              animate: {
                d: "m2 22 6-6",
              },
            }}
          />
          <motion.path
            initial="normal"
            animate={controls}
            d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            variants={SOCKET_VARIANTS}
          />
          <motion.path
            initial="normal"
            animate={controls}
            custom={{ x: 7.5, y: 13.5 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            variants={PATH_VARIANTS}
          />
          <motion.path
            initial="normal"
            animate={controls}
            custom={{ x: 10.5, y: 16.5 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            variants={PATH_VARIANTS}
          />
          <motion.path
            initial="normal"
            animate={controls}
            d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            variants={PLUG_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

ConnectIcon.displayName = "ConnectIcon";

export { ConnectIcon };
