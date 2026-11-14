import * as React from "react";
import { CheckCircle2, Info, Lightbulb, SearchX, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateVariant =
  "default" | "no-results" | "filter" | "success" | "warning" | "compact";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  tips?: readonly (string | React.ReactNode)[];
  tipsTitle?: string;
  badge?: React.ReactNode;
  variant?: EmptyStateVariant;
  footerNotice?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  primaryAction,
  secondaryAction,
  tips,
  tipsTitle = "Quick tips",
  badge,
  variant = "default",
  footerNotice,
  className,
  "data-testid": testId = "empty-state",
}: EmptyStateProps) {
  const isCompact = variant === "compact";
  const isSuccess = variant === "success";
  const isNoResults = variant === "no-results" || variant === "filter";

  const defaultIcon = React.useMemo(() => {
    if (icon) return icon;
    if (isSuccess) return <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />;
    if (isNoResults) return <SearchX className="h-6 w-6 text-text-muted" aria-hidden="true" />;
    return <Sparkles className="h-6 w-6 text-accent" aria-hidden="true" />;
  }, [icon, isSuccess, isNoResults]);

  const resolvedPrimaryAction = primaryAction ?? action;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] text-center transition-all",
        isCompact
          ? "border border-dashed border-border-subtle bg-surface/50 p-4 sm:p-6"
          : "border border-dashed border-border/80 bg-surface/90 px-4 py-10 shadow-[var(--shadow-sm)] sm:px-8 sm:py-12",
        isSuccess && "border-success/30 bg-success-soft/20",
        className
      )}
    >
      {badge ? <div className="mb-3">{badge}</div> : null}

      <div
        className={cn(
          "mb-3.5 flex items-center justify-center rounded-2xl transition-transform",
          isCompact ? "h-10 w-10" : "h-14 w-14",
          isSuccess
            ? "bg-success-soft text-success shadow-[var(--shadow-sm)]"
            : "bg-surface-muted text-text-muted ring-1 ring-border-subtle"
        )}
      >
        {defaultIcon}
      </div>

      <h3
        className={cn(
          "font-semibold tracking-tight text-text",
          isCompact ? "text-sm sm:text-base" : "text-base sm:text-lg"
        )}
      >
        {title}
      </h3>

      <div
        className={cn(
          "mt-1.5 text-text-muted leading-relaxed",
          isCompact ? "max-w-sm text-xs" : "max-w-md text-sm"
        )}
      >
        {description}
      </div>

      {tips && tips.length > 0 ? (
        <div className="mt-5 w-full max-w-md rounded-[var(--radius-sm)] border border-border-subtle/80 bg-surface-muted/40 p-3.5 text-left text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-text mb-2">
            <Lightbulb className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden="true" />
            <span>{tipsTitle}</span>
          </div>
          <ul className="space-y-1.5 text-text-muted">
            {tips.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-accent shrink-0 mt-0.5">•</span>
                <span className="flex-1">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {resolvedPrimaryAction || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {resolvedPrimaryAction}
          {secondaryAction}
        </div>
      ) : null}

      {footerNotice ? (
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{footerNotice}</span>
        </div>
      ) : null}
    </div>
  );
}
