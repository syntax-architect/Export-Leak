"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export interface SheetContentProps extends React.ComponentPropsWithoutRef<
  typeof SheetPrimitive.Content
> {
  side?: "responsive" | "bottom" | "right" | "left";
}

export function SheetContent({
  className,
  children,
  side = "responsive",
  ...props
}: SheetContentProps) {
  const sideClasses: Record<NonNullable<SheetContentProps["side"]>, string> = {
    responsive:
      "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t pb-safe md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-full md:max-w-md md:rounded-none md:rounded-l-[var(--radius-card)] md:border-t-0 md:border-l",
    bottom: "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t pb-safe",
    right: "inset-y-0 right-0 w-full max-w-md rounded-l-[var(--radius-card)] border-l",
    left: "inset-y-0 left-0 w-full max-w-xs rounded-r-[var(--radius-card)] border-r",
  };

  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto border-border-subtle bg-surface p-5 text-text shadow-[var(--shadow-lg)] focus:outline-none sm:p-6",
          sideClasses[side],
          className
        )}
        {...props}
      >
        {side === "responsive" || side === "bottom" ? (
          <div
            aria-hidden="true"
            className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border md:hidden"
          />
        ) : null}
        {children}
        <SheetPrimitive.Close
          aria-label="Close panel"
          className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 pr-10", className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("text-lg font-semibold leading-snug text-text", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description className={cn("text-sm text-text-muted", className)} {...props} />
  );
}
