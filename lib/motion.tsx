"use client";

import { MotionConfig, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

export const MOTION_TIMING = {
  pageTransitionSeconds: 0.18,
  listStaggerSeconds: 0.04,
  countUpMs: 600,
  buttonPressScale: 0.98,
  loadingIndicatorPolicy: "skeleton",
} as const;

export const PAGE_TRANSITION: Transition = {
  duration: MOTION_TIMING.pageTransitionSeconds,
  ease: [0.22, 1, 0.36, 1],
};

export const PAGE_VARIANTS: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: PAGE_TRANSITION },
  exit: { opacity: 0, y: -4, transition: PAGE_TRANSITION },
};

export const LIST_CONTAINER_VARIANTS: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: MOTION_TIMING.listStaggerSeconds,
    },
  },
};

export const LIST_ITEM_VARIANTS: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: PAGE_TRANSITION,
  },
};

export function useMotionEnabled(): boolean {
  const prefersReduced = useReducedMotion();
  return !prefersReduced;
}

/**
 * Animates an integer value over 600ms without using floating-point values in the final output.
 * Immediately returns the target value when prefers-reduced-motion is enabled.
 */
export function useCountUp(targetInteger: number, enabled = true): number {
  const motionEnabled = useMotionEnabled();
  const safeTarget = Number.isFinite(targetInteger) ? Math.trunc(targetInteger) : 0;
  const shouldAnimate = enabled && motionEnabled;
  const [displayValue, setDisplayValue] = useState<number>(shouldAnimate ? 0 : safeTarget);

  useEffect(() => {
    if (!shouldAnimate) {
      return;
    }

    let frameId = 0;
    const startTime = performance.now();
    const duration = MOTION_TIMING.countUpMs;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(safeTarget * eased);
      setDisplayValue(Object.is(nextValue, -0) ? 0 : nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setDisplayValue(safeTarget);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [safeTarget, shouldAnimate]);

  return shouldAnimate ? displayValue : safeTarget;
}

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
