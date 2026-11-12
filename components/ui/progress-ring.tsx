"use client";

import * as React from "react";
import { useMotionEnabled } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ProgressRingTone = "accent" | "success" | "warning" | "danger";

export interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressRingTone;
  label?: string;
  centerText?: string;
  className?: string;
}

const toneColorClasses: Record<ProgressRingTone, string> = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function ProgressRing({
  value,
  max = 100,
  size = 56,
  strokeWidth = 6,
  tone = "accent",
  label,
  centerText,
  className,
}: ProgressRingProps) {
  const motionEnabled = useMotionEnabled();
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(safeMax, value));
  const percent = Math.round((clamped / safeMax) * 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(clamped)}
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-surface-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(
              toneColorClasses[tone],
              motionEnabled ? "transition-[stroke-dashoffset] duration-500 ease-out" : ""
            )}
          />
        </svg>
        <span className="absolute text-xs font-semibold text-text tabular-nums-money">
          {centerText ?? `${percent}%`}
        </span>
      </div>
      {label ? <span className="text-sm font-medium text-text">{label}</span> : null}
    </div>
  );
}
