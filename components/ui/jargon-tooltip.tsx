"use client";

import * as React from "react";
import Link from "next/link";
import { Popover as PopoverPrimitive } from "radix-ui";
import { HelpCircle, ExternalLink } from "lucide-react";
import { getGlossaryTerm } from "@/lib/seo/glossary";
import { cn } from "@/lib/utils";

export interface JargonTooltipProps {
  slug: string;
  children?: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

export function JargonTooltip({ slug, children, className, showIcon = false }: JargonTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const termData = React.useMemo(() => getGlossaryTerm(slug), [slug]);

  if (!termData) {
    return <span className={className}>{children}</span>;
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 underline decoration-dotted decoration-border underline-offset-4 hover:decoration-accent hover:text-accent transition-colors cursor-help text-inherit font-inherit",
            className
          )}
        >
          <span>{children || termData.term}</span>
          {showIcon ? <HelpCircle className="h-3 w-3 text-text-muted" aria-hidden="true" /> : null}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="center"
          sideOffset={6}
          className="z-50 w-72 max-w-[90vw] rounded-[var(--radius-card)] border border-border-subtle bg-surface p-3.5 text-text shadow-[var(--shadow-lg)] space-y-2 animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-1.5">
            <span className="text-xs font-bold text-text">{termData.term}</span>
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
              {termData.category}
            </span>
          </div>

          <p className="text-xs font-medium text-text leading-tight">{termData.fullTitle}</p>
          <p className="text-xs text-text-muted leading-relaxed line-clamp-3">
            {termData.shortDescription}
          </p>

          <div className="pt-1 border-t border-border-subtle flex justify-end">
            <Link
              href={`/learn/${termData.slug}`}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <span>Read guide</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <PopoverPrimitive.Arrow className="fill-surface stroke-border-subtle" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
