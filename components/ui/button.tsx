"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-55 cursor-pointer select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover shadow-[var(--shadow-sm)]",
        secondary:
          "bg-secondary text-secondary-fg hover:bg-secondary-hover border border-border-subtle",
        ghost: "bg-transparent text-text hover:bg-surface-muted",
        destructive: "bg-danger text-danger-fg hover:bg-danger-hover shadow-[var(--shadow-sm)]",
      },
      size: {
        sm: "min-h-11 px-3 text-sm",
        md: "min-h-11 px-4 py-2 text-sm",
        lg: "min-h-12 px-5 py-2.5 text-base",
        icon: "min-h-11 min-w-11 p-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || loading);

    if (asChild) {
      return (
        <Slot.Root
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Slot.Root>
      );
    }

    const content = loading ? (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 rounded-full bg-current opacity-70 animate-pulse" />
        </span>
        <span>{loadingText ?? children}</span>
      </span>
    ) : (
      children
    );

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {content}
      </button>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
