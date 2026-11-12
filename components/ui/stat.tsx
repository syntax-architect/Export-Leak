"use client";

import * as React from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { MoneyText } from "@/components/ui/money-text";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumberIN } from "@/lib/format";
import { useCountUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type StatTrendDirection = "up" | "down" | "neutral";

export interface StatProps {
  label: string;
  minorUnits?: number;
  currency?: string;
  count?: number;
  valueText?: string;
  trend?: {
    label: string;
    direction?: StatTrendDirection;
    tone?: "success" | "warning" | "danger" | "neutral";
  };
  animated?: boolean;
  onClick?: () => void;
  className?: string;
}

const trendToneClasses: Record<"success" | "warning" | "danger" | "neutral", string> = {
  success: "bg-success-soft text-success-soft-fg",
  warning: "bg-warning-soft text-warning-soft-fg",
  danger: "bg-danger-soft text-danger-soft-fg",
  neutral: "bg-surface-muted text-text-muted",
};

export function Stat({
  label,
  minorUnits,
  currency = "INR",
  count,
  valueText,
  trend,
  animated = true,
  onClick,
  className,
}: StatProps) {
  const animatedCount = useCountUp(count ?? 0, animated && typeof count === "number");

  const TrendIcon =
    trend?.direction === "up"
      ? ArrowUpRight
      : trend?.direction === "down"
        ? ArrowDownRight
        : ArrowRight;

  const content = (
    <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium",
              trendToneClasses[trend.tone ?? "neutral"]
            )}
          >
            <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{trend.label}</span>
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-bold tracking-tight text-text tabular-nums-money sm:text-3xl">
        {typeof minorUnits === "number" ? (
          <MoneyText minorUnits={minorUnits} currency={currency} animated={animated} />
        ) : typeof count === "number" ? (
          formatNumberIN(animatedCount)
        ) : (
          (valueText ?? "—")
        )}
      </div>
    </CardContent>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full min-h-11 rounded-[var(--radius-card)] border border-border-subtle bg-surface text-left text-text shadow-[var(--shadow-sm)] transition-colors hover:border-border hover:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
          className
        )}
      >
        {content}
      </button>
    );
  }

  return <Card className={className}>{content}</Card>;
}
