"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPlanConfig, type PlanLimitKey } from "@/config/plans";
import type { PlanLimitDetails } from "@/lib/auth/errors";

export interface UpgradePlanDialogProps {
  details: PlanLimitDetails | null;
  onClose: () => void;
  testId?: string;
}

const LIMIT_COPY: Record<
  PlanLimitKey,
  {
    title: string;
    buildDescription: (d: PlanLimitDetails, currentName: string) => string;
  }
> = {
  shippingBillsPerMonth: {
    title: "Monthly shipping bill limit reached",
    buildDescription: (d, currentName) =>
      `You have used ${d.currentUsage} of ${d.limit} shipping bills this month on your ${currentName} plan.`,
  },
  maxIecs: {
    title: "IEC profile limit reached",
    buildDescription: (d, currentName) =>
      `Your ${currentName} plan supports up to ${d.limit} IEC profile${d.limit === 1 ? "" : "s"} (${d.currentUsage} active).`,
  },
  teamSeats: {
    title: "Team seat limit reached",
    buildDescription: (d, currentName) =>
      `Your ${currentName} plan includes ${d.limit} team seat${d.limit === 1 ? "" : "s"} (${d.currentUsage} active or invited).`,
  },
  canGenerateEbrc: {
    title: "Bulk eBRC export requires a paid plan or Pro Trial",
    buildDescription: (_d, currentName) =>
      `Your ${currentName} plan allows validating rows, but downloading DGFT Bulk eBRC Excel files requires a 7-day Pro Trial, Exporter, or Consultant plan.`,
  },
  canExportReports: {
    title: "Leakage report export requires a paid plan or Pro Trial",
    buildDescription: (_d, currentName) =>
      `Your ${currentName} plan includes live dashboard viewing, while formatted PDF and multi-sheet Excel exports require an Exporter or Consultant plan.`,
  },
};

function formatPlanPriceInr(pricePaise: number, period: string): string {
  if (pricePaise <= 0) return "₹0";
  const inr = Math.round(pricePaise / 100).toLocaleString("en-IN");
  const suffix = period === "annual" ? "/yr" : period === "monthly" ? "/mo" : "";
  return `₹${inr}${suffix}`;
}

export function UpgradePlanDialog({
  details,
  onClose,
  testId = "plan-upgrade-dialog",
}: UpgradePlanDialogProps) {
  const currentPlan = getPlanConfig(details?.currentPlanKey);
  const recommendedPlan = getPlanConfig(details?.recommendedPlanKey);
  const copy = details ? LIMIT_COPY[details.limitKey] : null;

  return (
    <Dialog
      open={Boolean(details)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-warning" aria-hidden="true" />
            <span>{copy?.title ?? "Upgrade your ExportLeak plan"}</span>
          </DialogTitle>
          <DialogDescription>
            {details && copy ? copy.buildDescription(details, currentPlan.displayName) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-text">
          <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft/40 p-3">
            <p className="font-semibold text-text">
              Recommended: {recommendedPlan.displayName} (
              {formatPlanPriceInr(recommendedPlan.pricePaise, recommendedPlan.billingPeriod)})
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Includes up to {recommendedPlan.entitlements.maxIecs} IEC
              {recommendedPlan.entitlements.maxIecs === 1 ? "" : "s"},{" "}
              {recommendedPlan.entitlements.shippingBillsPerMonth} SBs/month,{" "}
              {recommendedPlan.entitlements.teamSeats} team seats, Bulk eBRC Excel, and PDF/Excel
              reports.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                Existing uploaded files and shipment records remain readable and downloadable
                forever.
              </span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button asChild variant="primary">
            <Link href={`/app/billing?highlight=${encodeURIComponent(recommendedPlan.key)}`}>
              Choose a plan
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
