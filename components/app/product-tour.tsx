"use client";

import * as React from "react";
import { Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ProductTourStep {
  targetId: string;
  title: string;
  description: string;
}

export const PRODUCT_TOUR_STEPS: readonly ProductTourStep[] = [
  {
    targetId: "tour-totals",
    title: "Dashboard totals",
    description:
      "See unclaimed RoDTEP & Drawback incentives, shipments near FEMA deadlines, matched bills, and expiring scrips in 5 seconds.",
  },
  {
    targetId: "tour-shipments",
    title: "Shipments table",
    description:
      "Track each Shipping Bill's buyer, FOB value, expected vs credited incentive, and realisation due date.",
  },
  {
    targetId: "tour-alerts",
    title: "Deadlines & alerts",
    description:
      "Spot approaching FEMA payment deadlines and uncredited incentive claims before money or scrips expire.",
  },
  {
    targetId: "tour-export",
    title: "Upload & Bulk eBRC export",
    description:
      "Upload Shipping Bills, bank IRM sheets, and customs scrolls or prepare your DGFT Bulk eBRC upload file here.",
  },
  {
    targetId: "tour-help",
    title: "Help & data safety",
    description:
      "Replay this 5-step tour anytime from the Help menu, resume onboarding, or review our zero-DSC privacy guarantees.",
  },
];

export interface ProductTourProps {
  open: boolean;
  onClose: (completed: boolean) => void;
}

export function ProductTour({ open, onClose }: ProductTourProps) {
  const [stepIndex, setStepIndex] = React.useState(0);

  const handleClose = React.useCallback(
    (completed: boolean) => {
      setStepIndex(0);
      onClose(completed);
    },
    [onClose]
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const current = PRODUCT_TOUR_STEPS[stepIndex];
    if (!current) return;

    const el = document.querySelector(`[data-tour-id="${current.targetId}"]`) as HTMLElement | null;
    if (!el) return;

    el.setAttribute("data-tour-active", "true");
    el.classList.add("ring-2", "ring-accent", "ring-offset-2", "ring-offset-bg");
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    return () => {
      el.removeAttribute("data-tour-active");
      el.classList.remove("ring-2", "ring-accent", "ring-offset-2", "ring-offset-bg");
    };
  }, [open, stepIndex]);

  if (!open) return null;

  const step = PRODUCT_TOUR_STEPS[stepIndex] ?? PRODUCT_TOUR_STEPS[0]!;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === PRODUCT_TOUR_STEPS.length - 1;

  return (
    <aside
      aria-label="Product tour coachmark"
      data-testid="product-tour-popover"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md md:inset-x-auto md:bottom-6 md:right-6 md:w-96"
    >
      <Card className="border-accent shadow-[var(--shadow-lg)]">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
              <Compass className="h-4 w-4" aria-hidden="true" />
              <span>
                Tour {stepIndex + 1} of {PRODUCT_TOUR_STEPS.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleClose(false)}
              aria-label="Dismiss product tour"
              data-testid="tour-dismiss-btn"
              className="inline-flex min-h-11 min-w-11 -mr-2 -mt-2 items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <CardTitle className="text-base">{step.title}</CardTitle>
          <CardDescription>{step.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => (isFirst ? handleClose(false) : setStepIndex((i) => Math.max(0, i - 1)))}
            data-testid="tour-prev-btn"
          >
            {isFirst ? "Dismiss" : "Back"}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => (isLast ? handleClose(true) : setStepIndex((i) => i + 1))}
              data-testid="tour-next-btn"
            >
              {isLast ? "Finish tour" : "Next"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
