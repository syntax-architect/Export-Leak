"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface UsageMeterCardProps {
  planDisplayName: string;
  used: number;
  limit: number;
  unitLabel?: string;
  caption?: string;
  secondaryText?: string;
  testId?: string;
  className?: string;
}

export function getUsageMeterTone(used: number, limit: number): "normal" | "warning" | "danger" {
  const safeLimit = Math.max(1, limit);
  const pct = (used / safeLimit) * 100;
  if (pct >= 100) return "danger";
  if (pct >= 80) return "warning";
  return "normal";
}

export function UsageMeterCard({
  planDisplayName,
  used,
  limit,
  unitLabel = "shipping bills used this month",
  caption,
  secondaryText,
  testId = "usage-meter-card",
  className,
}: UsageMeterCardProps) {
  const safeLimit = Math.max(1, limit);
  const pct = Math.min(100, Math.round((used / safeLimit) * 100));
  const tone = getUsageMeterTone(used, safeLimit);

  return (
    <Card className={cn("w-full sm:w-auto sm:min-w-[280px]", className)} data-testid={testId}>
      <CardContent className="pt-4 sm:pt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-medium">
          <span className="text-text">{planDisplayName}</span>
          <span className="tabular-nums text-text-muted">
            {caption ?? `${used} of ${limit} ${unitLabel}`}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            data-testid={`${testId}-bar`}
            data-tone={tone}
            className={cn(
              "h-full rounded-full transition-all",
              tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-accent"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {secondaryText ? (
          <p className="mt-1.5 text-[11px] text-text-muted">{secondaryText}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
