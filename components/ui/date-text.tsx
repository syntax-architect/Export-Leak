import * as React from "react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DateTextProps {
  date: Date | string | number;
  className?: string;
}

export function DateText({ date, className }: DateTextProps) {
  const parsed = date instanceof Date ? date : new Date(date);
  const isoString = Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();

  return (
    <time dateTime={isoString} className={cn("whitespace-nowrap", className)}>
      {formatDate(date)}
    </time>
  );
}
