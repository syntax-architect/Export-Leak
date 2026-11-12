"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  FileEdit,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { MoneyText } from "@/components/ui/money-text";
import { ProgressRing } from "@/components/ui/progress-ring";
import type { ShipmentDetailViewData } from "@/lib/dashboard/repository";
import type { MembershipRole } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export interface ShippingBillDetailProps {
  detail: ShipmentDetailViewData;
  role: MembershipRole;
}

const URGENCY_STYLES: Record<
  ShipmentDetailViewData["whatToDoNext"]["urgency"],
  { border: string; bg: string; badge: "danger" | "warning" | "accent" | "success"; label: string }
> = {
  overdue: {
    border: "border-red-900",
    bg: "bg-red-950/10",
    badge: "danger",
    label: "Overdue — Act now",
  },
  urgent: {
    border: "border-danger/50",
    bg: "bg-danger-soft/40",
    badge: "danger",
    label: "Deadline under 30 days",
  },
  action: {
    border: "border-warning/50",
    bg: "bg-warning-soft/40",
    badge: "warning",
    label: "Action needed",
  },
  complete: {
    border: "border-success/40",
    bg: "bg-success-soft/40",
    badge: "success",
    label: "Reconciled",
  },
};

export function ShippingBillDetail({ detail, role }: ShippingBillDetailProps) {
  const {
    shipment,
    timeline,
    whatToDoNext,
    incentivesByScheme,
    remittanceMatches,
    items,
    openAlerts,
  } = detail;
  const urgencyStyle = URGENCY_STYLES[whatToDoNext.urgency];
  const canWrite = role !== "viewer";

  const ringValue =
    shipment.daysToDeadline === null
      ? 0
      : shipment.daysToDeadline <= 0
        ? 0
        : Math.min(shipment.periodTotalDays, shipment.daysToDeadline);
  const ringTone = shipment.deadlineTone === "neutral" ? "accent" : shipment.deadlineTone;

  return (
    <div className="flex flex-col gap-5" data-testid="shipping-bill-detail-root">
      {/* Breadcrumb & Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/app"
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Leakage &amp; Deadlines</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-text">
              Shipping Bill #{shipment.sbNumber}
            </h1>
            {shipment.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
            <Badge variant="neutral">{shipment.portCode}</Badge>
            <Badge variant={shipment.ebrcReady ? "success" : "accent"}>
              {shipment.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-xs text-text-muted">
            IEC {shipment.iecCode} ({shipment.iecLegalName}) • Buyer: {shipment.buyerName} • Filed{" "}
            <DateText date={shipment.sbDate} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <Button asChild variant="secondary" size="sm" className="min-h-11">
              <Link href={`/app/shipping-bills/${shipment.id}/review`}>
                <FileEdit className="h-4 w-4" aria-hidden="true" />
                <span>Review extracted fields</span>
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="primary" size="sm" className="min-h-11">
            <Link href="/app/matches">Open matching workbench</Link>
          </Button>
        </div>
      </div>

      {/* What to do next plain-language box */}
      <Card
        data-testid="what-to-do-next-box"
        className={cn("border-2", urgencyStyle.border, urgencyStyle.bg)}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-text" aria-hidden="true" />
              <CardTitle className="text-base">What to do next</CardTitle>
            </div>
            <Badge variant={urgencyStyle.badge}>{urgencyStyle.label}</Badge>
          </div>
          <CardDescription className="text-text">{whatToDoNext.headline}</CardDescription>
        </CardHeader>
        {whatToDoNext.steps.length > 0 ? (
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {whatToDoNext.steps.map((step) => (
              <div
                key={step.title}
                className="flex flex-col justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3.5"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text">{step.title}</p>
                  <p className="text-xs text-text-muted">{step.detail}</p>
                </div>
                <Button asChild variant="secondary" size="sm" className="min-h-11 self-start">
                  <Link href={step.href}>{step.ctaLabel}</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>

      {/* Top Financial & Deadline Summary */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-1.5 p-4">
            <p className="text-xs font-medium text-text-muted">FOB &amp; Realisation Matched</p>
            <p className="text-xl font-bold text-text">
              <MoneyText minorUnits={shipment.fobMinor} currency={shipment.currency} />
            </p>
            <p className="text-xs text-text-muted">
              Matched:{" "}
              <MoneyText
                minorUnits={shipment.matchedMinor}
                currency={shipment.currency}
                className="text-text"
              />{" "}
              ({shipment.paymentStatus})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1.5 p-4">
            <p className="text-xs font-medium text-text-muted">Incentives Expected / Credited</p>
            <p className="text-xl font-bold text-text">
              <MoneyText minorUnits={shipment.expectedIncentivePaise} currency="INR" />
            </p>
            <p className="text-xs text-text-muted">
              Credited:{" "}
              <MoneyText
                minorUnits={shipment.creditedIncentivePaise}
                currency="INR"
                className="text-text"
              />{" "}
              • Gap:{" "}
              <MoneyText
                minorUnits={shipment.unclaimedIncentivePaise}
                currency="INR"
                className={shipment.unclaimedIncentivePaise > 0 ? "font-semibold text-danger" : ""}
              />
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-muted">FEMA Realisation Deadline</p>
              <p className="text-base font-bold text-text">
                {shipment.realisationDueDate ? (
                  <DateText date={shipment.realisationDueDate} />
                ) : (
                  "Rule missing"
                )}
              </p>
              <p className="text-[11px] text-text-muted">
                {shipment.monthsApplied
                  ? `Rule: ${shipment.ruleKey} (${shipment.monthsApplied}m)`
                  : (shipment.ruleNote ?? "Configure in compliance_rules")}
              </p>
            </div>
            {shipment.daysToDeadline !== null ? (
              <ProgressRing
                value={ringValue}
                max={Math.max(1, shipment.periodTotalDays)}
                size={52}
                strokeWidth={5}
                tone={ringTone}
                centerText={shipment.daysToDeadline <= 0 ? "0d" : `${shipment.daysToDeadline}d`}
                label={`${shipment.daysToDeadline} days left`}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* 5-Stage Lifecycle Timeline */}
      <Card data-testid="shipment-lifecycle-timeline">
        <CardHeader>
          <CardTitle className="text-base">Shipment Lifecycle Timeline</CardTitle>
          <CardDescription>
            Filed &rarr; Cleared &rarr; Incentive credited &rarr; Payment received &rarr; eBRC ready
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {timeline.map((stage, index) => (
              <li
                key={stage.key}
                data-testid={`timeline-stage-${stage.key}`}
                className={cn(
                  "flex flex-col justify-between gap-2 rounded-[var(--radius-sm)] border p-3.5",
                  stage.status === "done"
                    ? "border-success/40 bg-success-soft/30"
                    : stage.status === "attention"
                      ? "border-warning/50 bg-warning-soft/30"
                      : "border-border-subtle bg-surface"
                )}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-text-muted">Step {index + 1}</span>
                    {stage.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : stage.status === "attention" ? (
                      <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-text">{stage.label}</p>
                  <p className="text-xs text-text-muted">{stage.detail}</p>
                  {stage.missingItems.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-[11px] font-medium text-danger">
                      {stage.missingItems.map((m) => (
                        <li key={m}>• {m}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {stage.completedOn ? (
                  <p className="text-[11px] font-medium text-text-muted">
                    <DateText date={stage.completedOn} />
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Incentives & Matched IRMs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incentive Breakdown by Scheme</CardTitle>
          </CardHeader>
          <CardContent>
            {incentivesByScheme.length === 0 ? (
              <p className="text-sm text-text-muted">
                No scheme expectations calculated yet. Run computation from Incentives &amp; Scrips.
              </p>
            ) : (
              <div className="space-y-2">
                {incentivesByScheme.map((row) => (
                  <div
                    key={row.scheme}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold uppercase text-text">{row.scheme}</span>
                        <Badge variant={row.claimed ? "accent" : "warning"}>
                          {row.claimed ? "Claimed" : "Not claimed"}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted">
                        Credited:{" "}
                        <MoneyText
                          minorUnits={row.creditedMinor}
                          currency="INR"
                          className="text-text-muted"
                        />
                        {row.creditedOn ? (
                          <>
                            {" "}
                            on <DateText date={row.creditedOn} />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-text">
                        Expected <MoneyText minorUnits={row.expectedMinor} currency="INR" />
                      </p>
                      {row.gapMinor > 0 ? (
                        <p className="text-xs font-semibold text-danger">
                          Gap <MoneyText minorUnits={row.gapMinor} currency="INR" />
                        </p>
                      ) : (
                        <p className="text-xs text-success">Fully credited</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Matched Remittances (IRMs)</CardTitle>
          </CardHeader>
          <CardContent>
            {remittanceMatches.length === 0 ? (
              <p className="text-sm text-text-muted">
                No IRM matches linked to this Shipping Bill yet.
              </p>
            ) : (
              <div className="space-y-2">
                {remittanceMatches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-text">{m.irmNumber}</p>
                      <p className="text-xs text-text-muted">
                        {m.bankName} • <DateText date={m.remittanceDate} /> ({m.method})
                      </p>
                    </div>
                    <span className="font-semibold text-text">
                      <MoneyText minorUnits={m.matchedMinor} currency={m.currency} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Line Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">No HS line items recorded on this bill yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
                >
                  <div>
                    <p className="font-mono text-xs font-semibold text-accent">HS {item.hsCode}</p>
                    <p className="font-medium text-text">{item.description || "Export item"}</p>
                    <p className="text-xs text-text-muted">
                      Qty {item.quantity} {item.uqc}
                    </p>
                  </div>
                  <MoneyText
                    minorUnits={item.fobMinor}
                    currency={shipment.currency}
                    className="font-semibold text-text"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Alerts on this SB */}
      {openAlerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open Alerts for this Shipping Bill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.severity === "critical" ? "danger" : "warning"}>
                      {alert.severity}
                    </Badge>
                    <span className="font-semibold text-text">{alert.title}</span>
                  </div>
                  <p className="text-xs text-text-muted">{alert.message}</p>
                </div>
                {alert.dueOn ? (
                  <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Due <DateText date={alert.dueOn} />
                  </span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
