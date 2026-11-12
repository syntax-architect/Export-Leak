"use client";

import * as React from "react";
import { formatMoney, type FormatMoneyOptions } from "@/lib/format";
import { useCountUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface MoneyTextProps extends FormatMoneyOptions {
  minorUnits: number;
  currency?: string;
  animated?: boolean;
  className?: string;
}

export function MoneyText({
  minorUnits,
  currency = "INR",
  animated = false,
  showCode = true,
  showDecimals = "auto",
  className,
}: MoneyTextProps) {
  const valueToDisplay = useCountUp(minorUnits, animated);
  const formatted = formatMoney(valueToDisplay, currency, { showCode, showDecimals });

  return <span className={cn("tabular-nums-money", className)}>{formatted}</span>;
}
