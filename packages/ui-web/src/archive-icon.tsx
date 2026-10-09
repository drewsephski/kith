"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation, useReducedMotion } from "framer-motion";
import type { HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle } from "react";
import { cn } from "./lib/utils.js";

export interface ArchiveIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ArchiveIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const RECT_VARIANTS: Variants = {
  normal: {
    translateY: 0,
    transition: { duration: 0.2, type: "spring", stiffness: 200, damping: 25 },
  },
  animate: {
    translateY: -1.5,
    transition: { duration: 0.2, type: "spring", stiffness: 200, damping: 25 },
  },
};

const PATH_VARIANTS: Variants = {
  normal: { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" },
  animate: { d: "M4 11v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V11" },
};

const SECONDARY_PATH_VARIANTS: Variants = {
  normal: { d: "M10 12h4" },
  animate: { d: "M10 15h4" },
};

const ArchiveIcon = forwardRef<ArchiveIconHandle, ArchiveIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const reducedMotion = useReducedMotion();
    const isControlled = ref !== null;
    const startAnimation = useCallback(() => {
      if (!reducedMotion) void controls.start("animate");
    }, [controls, reducedMotion]);
    const stopAnimation = useCallback(() => {
      void controls.start("normal");
    }, [controls]);

    useImperativeHandle(ref, () => ({ startAnimation, stopAnimation }), [
      startAnimation,
      stopAnimation,
    ]);

    useEffect(() => {
      if (reducedMotion) controls.set("normal");
    }, [controls, reducedMotion]);

    const handleMouseEnter = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled) startAnimation();
        onMouseEnter?.(event);
      },
      [isControlled, startAnimation, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isControlled) stopAnimation();
        onMouseLeave?.(event);
      },
      [isControlled, stopAnimation, onMouseLeave],
    );

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: Hover animates decoration; the enclosing control owns keyboard interaction.
      <div
        className={cn("inline-flex shrink-0", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
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
          <motion.rect
            animate={controls}
            height="5"
            initial="normal"
            rx="1"
            variants={RECT_VARIANTS}
            width="20"
            x="2"
            y="3"
          />
          <motion.path animate={controls} initial="normal" variants={PATH_VARIANTS} />
          <motion.path animate={controls} initial="normal" variants={SECONDARY_PATH_VARIANTS} />
        </svg>
      </div>
    );
  },
);

ArchiveIcon.displayName = "ArchiveIcon";

export { ArchiveIcon };
