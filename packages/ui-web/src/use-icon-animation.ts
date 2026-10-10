import { useAnimation, useReducedMotion } from "framer-motion";
import type { HTMLAttributes, MouseEvent, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle } from "react";

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export function useIconAnimation(
  ref: Ref<AnimatedIconHandle>,
  onMouseEnter?: HTMLAttributes<HTMLDivElement>["onMouseEnter"],
  onMouseLeave?: HTMLAttributes<HTMLDivElement>["onMouseLeave"],
) {
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();
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
  return {
    controls,
    hoverProps: {
      onMouseEnter: (event: MouseEvent<HTMLDivElement>) => {
        if (!ref) startAnimation();
        onMouseEnter?.(event);
      },
      onMouseLeave: (event: MouseEvent<HTMLDivElement>) => {
        if (!ref) stopAnimation();
        onMouseLeave?.(event);
      },
    },
  };
}
