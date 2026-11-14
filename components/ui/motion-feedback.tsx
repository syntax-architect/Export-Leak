"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuccessCheckmarkProps {
  size?: number;
  className?: string;
}

export function SuccessCheckmark({ size = 48, className }: SuccessCheckmarkProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-success text-success-fg",
          className
        )}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Check className="h-2/3 w-2/3 stroke-[3]" />
      </div>
    );
  }

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft background pulse */}
        <motion.circle
          cx="26"
          cy="26"
          r="24"
          fill="var(--success-soft)"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
        {/* Border circle stroke */}
        <motion.circle
          cx="26"
          cy="26"
          r="23"
          stroke="var(--success)"
          strokeWidth="3"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
        {/* Checkmark path */}
        <motion.path
          d="M 16 27 L 23 34 L 37 19"
          fill="none"
          stroke="var(--success)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.2, delay: 0.1, ease: "easeOut" }}
        />
      </motion.svg>
    </div>
  );
}

interface SuccessMomentProps {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SuccessMoment({ title, description, className, children }: SuccessMomentProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-success/30 bg-success-soft/30 p-6 text-center space-y-3",
        className
      )}
    >
      <SuccessCheckmark size={52} />
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {description ? <p className="text-xs text-text-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
