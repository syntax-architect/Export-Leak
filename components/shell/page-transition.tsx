"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full animate-in fade-in-50 duration-150", className)}>
      {children}
    </div>
  );
}
