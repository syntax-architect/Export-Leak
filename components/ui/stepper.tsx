import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  currentStep: number;
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <nav aria-label="Progress steps" className={cn("w-full", className)}>
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-1 items-start gap-3 sm:flex-col sm:gap-2"
            >
              <div className="flex items-center gap-2 sm:w-full">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold border transition-colors",
                    isComplete && "border-success bg-success text-success-fg",
                    isCurrent && "border-primary bg-primary text-primary-fg",
                    !isComplete && !isCurrent && "border-border bg-surface text-text-muted"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "hidden h-0.5 flex-1 rounded-full sm:block",
                      isComplete ? "bg-success" : "bg-border-subtle"
                    )}
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium leading-tight",
                    isCurrent || isComplete ? "text-text" : "text-text-muted"
                  )}
                >
                  {step.label}
                </p>
                {step.description ? (
                  <p className="mt-0.5 text-xs text-text-muted">{step.description}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
