"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateText } from "@/components/ui/date-text";
import { getTrialCountdown } from "@/lib/billing/trial-countdown";

export interface TrialCountdownBannerProps {
  planKey: string;
  trialEndsAt: string | null | undefined;
}

export function TrialCountdownBanner({ planKey, trialEndsAt }: TrialCountdownBannerProps) {
  if (planKey !== "trial_pro") {
    return null;
  }

  const countdown = getTrialCountdown(trialEndsAt);
  if (!countdown.isActive) {
    return null;
  }

  return (
    <div
      data-testid="trial-pro-banner"
      className="mb-5 flex flex-col gap-3 rounded-[var(--radius-card)] border border-accent/35 bg-accent-soft p-3.5 text-sm text-accent-soft-fg sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-text" data-testid="trial-countdown-text">
            {countdown.label}
          </p>
          <p className="text-xs text-accent-soft-fg/90">
            Full Exporter experience active without a card until{" "}
            {countdown.trialEndsAt ? <DateText date={countdown.trialEndsAt} /> : "trial end"}.
          </p>
        </div>
      </div>

      <Button
        asChild
        variant="primary"
        size="sm"
        className="min-h-11 shrink-0"
        data-testid="trial-choose-plan-btn"
      >
        <Link href="/app/billing">Choose a plan</Link>
      </Button>
    </div>
  );
}
