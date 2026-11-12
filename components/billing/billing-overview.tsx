"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Mail, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { UsageMeterCard } from "@/components/billing/usage-meter-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { APP_CONFIG } from "@/config/app";
import { PLANS, type PlanConfig, type PlanKey } from "@/config/plans";
import type { OrgUsageSnapshot } from "@/lib/billing/entitlements";
import { getTrialCountdown } from "@/lib/billing/trial-countdown";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BillingOverviewProps {
  orgName: string;
  usage: OrgUsageSnapshot;
  highlightedPlanKey?: string | null;
}

const PAID_PLAN_KEYS: readonly Exclude<PlanKey, "free" | "trial_pro">[] = [
  "exporter_monthly",
  "exporter_annual",
  "consultant_monthly",
  "consultant_annual",
];

function PlanFeatureList({ plan }: { plan: PlanConfig }) {
  const { entitlements } = plan;
  return (
    <ul className="space-y-2 text-xs text-text-muted">
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>
          Up to {entitlements.maxIecs} IEC profile{entitlements.maxIecs === 1 ? "" : "s"}
        </span>
      </li>
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>{entitlements.shippingBillsPerMonth} Shipping Bills per month</span>
      </li>
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>Bulk eBRC Excel export &amp; leakage PDF/Excel reports</span>
      </li>
      <li className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>{entitlements.teamSeats} team seats &amp; email alerts</span>
      </li>
    </ul>
  );
}

export function BillingOverview({ orgName, usage, highlightedPlanKey }: BillingOverviewProps) {
  const trial = getTrialCountdown(usage.trialEndsAt);
  const currentPlan = PLANS[usage.planKey];

  return (
    <div className="flex flex-col gap-6" data-testid="billing-overview-root">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Plans &amp; Usage</h1>
          <p className="mt-1 text-sm text-text-muted">
            Current plan, monthly entitlements, and transparent INR pricing for {orgName}.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="min-h-11">
          <Link href="/app">Back to workspace</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>Current plan: {currentPlan.displayName}</span>
              <Badge
                variant={
                  usage.billingState === "active_trial"
                    ? "accent"
                    : usage.billingState === "grace_period"
                      ? "warning"
                      : "neutral"
                }
              >
                {usage.billingState === "active_trial"
                  ? trial.label || "Trial active"
                  : usage.billingState === "grace_period"
                    ? "Grace period"
                    : usage.billingState === "active_subscription"
                      ? "Active"
                      : "Free tier"}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {usage.billingState === "active_trial" && usage.trialEndsAt ? (
                <>
                  Your card-free 7-day Pro trial ends on <DateText date={usage.trialEndsAt} /> and
                  will move gently to Free with all uploaded data kept readable.
                </>
              ) : (
                "Existing uploaded PDFs, parsed Shipping Bills, and matched records remain readable regardless of plan tier."
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <UsageMeterCard
            caption="Monthly Shipping Bills"
            used={usage.shippingBillsUsed}
            limit={usage.shippingBillsLimit}
            unitLabel="SBs this month"
            planDisplayName={usage.planDisplayName}
            secondaryText="Resets on the 1st of every month (Asia/Kolkata)."
            testId="billing-usage-sb"
          />
          <UsageMeterCard
            caption="IEC Profiles"
            used={usage.iecsUsed}
            limit={usage.maxIecs}
            unitLabel="IECs used"
            planDisplayName={usage.planDisplayName}
            secondaryText="All existing IEC data remains readable even after downgrade."
            testId="billing-usage-iec"
          />
          <UsageMeterCard
            caption="Team Seats"
            used={usage.seatsUsed}
            limit={usage.teamSeatsLimit}
            unitLabel="seats used"
            planDisplayName={usage.planDisplayName}
            secondaryText="Includes active members and pending email invitations."
            testId="billing-usage-seats"
          />
        </CardContent>
      </Card>

      <section aria-labelledby="paid-plans-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="paid-plans-heading" className="text-lg font-semibold text-text">
              Choose a plan
            </h2>
            <p className="text-xs text-text-muted">
              Transparent pricing defined from our single config. No DSC or government portal
              passwords ever required.
            </p>
          </div>
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-subtle bg-surface-muted px-3 py-1 text-xs font-medium text-text">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>No DSC or portal passwords ever required</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PAID_PLAN_KEYS.map((key) => {
            const plan = PLANS[key];
            const isHighlighted = highlightedPlanKey === key;
            const isCurrent = usage.planKey === key;
            const formattedPrice = formatMoney(plan.pricePaise, "INR", {
              showCode: false,
              showDecimals: "never",
            });
            const periodLabel = plan.billingPeriod === "annual" ? "/ year" : "/ month";

            return (
              <Card
                key={plan.key}
                data-testid={`plan-card-${plan.key}`}
                className={cn(
                  "flex flex-col justify-between transition-shadow",
                  isHighlighted && "border-accent ring-2 ring-accent/30 shadow-[var(--shadow-md)]"
                )}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{plan.displayName}</CardTitle>
                    {isHighlighted ? (
                      <Badge variant="accent">
                        <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                        Recommended
                      </Badge>
                    ) : isCurrent ? (
                      <Badge variant="success">Current</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums text-text">
                      {formattedPrice}
                    </span>
                    <span className="text-xs text-text-muted">{periodLabel}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <PlanFeatureList plan={plan} />
                  <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                    <Button asChild variant={isHighlighted ? "primary" : "secondary"} size="sm">
                      <a
                        href={`mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent(
                          `Upgrade inquiry: ${plan.displayName} (${orgName})`
                        )}`}
                      >
                        <Mail className="h-4 w-4" aria-hidden="true" />
                        <span>Request activation</span>
                      </a>
                    </Button>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{APP_CONFIG.whatsappNumber}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
