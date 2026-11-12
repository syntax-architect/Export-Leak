"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
  HelpCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { TrustFooterBar } from "@/components/trust/trust-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Stat } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import type { MembershipRole } from "@/lib/database.types";
import type { DashboardShipmentRow, DashboardSummary } from "@/lib/onboarding/repository";

export interface DashboardSummaryViewProps {
  summary: DashboardSummary;
  orgName: string;
  role: MembershipRole;
  embeddedInWizard?: boolean;
  onDemoDeleted?: () => void;
  onReplayTour?: () => void;
}

const STATUS_BADGE_MAP: Record<
  DashboardShipmentRow["status"],
  { label: string; variant: "neutral" | "accent" | "success" | "warning" | "danger" }
> = {
  queued: { label: "Queued", variant: "neutral" },
  needs_review: { label: "Needs review", variant: "warning" },
  parsed: { label: "Parsed", variant: "neutral" },
  pending: { label: "Pending payment", variant: "warning" },
  partially_matched: { label: "Partial match", variant: "warning" },
  matched: { label: "Matched", variant: "accent" },
  ebrc_ready: { label: "eBRC ready", variant: "success" },
  closed: { label: "Closed", variant: "success" },
};

const CHECKLIST_ITEMS = [
  { key: "addIec" as const, label: "Add IEC", href: "/app/iecs" },
  { key: "uploadShippingBills" as const, label: "Upload shipping bills", href: "/app/documents" },
  { key: "uploadIrm" as const, label: "Upload IRM export", href: "/app/documents" },
  { key: "reviewMatches" as const, label: "Review matches", href: "/app" },
  { key: "downloadEbrc" as const, label: "Download first eBRC file", href: "/app" },
];

export function DashboardSummaryView({
  summary,
  orgName,
  role,
  embeddedInWizard = false,
  onDemoDeleted,
  onReplayTour,
}: DashboardSummaryViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [deletingDemo, setDeletingDemo] = React.useState(false);

  const canWrite = role !== "viewer";

  async function handleDeleteDemo() {
    if (!canWrite) return;
    setDeletingDemo(true);
    try {
      const res = await fetch(`/api/orgs/${summary.orgId}/demo`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast({ title: "Could not remove sample data", variant: "danger" });
        return;
      }
      toast({ title: "Sample demo workspace deleted", variant: "success" });
      if (onDemoDeleted) {
        onDemoDeleted();
      } else {
        router.refresh();
      }
    } catch {
      toast({ title: "Network error while removing sample data", variant: "danger" });
    } finally {
      setDeletingDemo(false);
    }
  }

  const columns: DataTableColumn<DashboardShipmentRow>[] = [
    {
      id: "sbNumber",
      header: "Shipping Bill",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-text tabular-nums-money">{row.sbNumber}</span>
          {row.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
        </div>
      ),
    },
    {
      id: "buyer",
      header: "Buyer",
      cell: (row) => <span className="text-text">{row.buyerName}</span>,
    },
    {
      id: "fob",
      header: "FOB Value",
      align: "right",
      cell: (row) => <MoneyText minorUnits={row.fobMinor} currency={row.currency} />,
    },
    {
      id: "incentive",
      header: "Expected / Credited",
      align: "right",
      cell: (row) => (
        <div className="flex flex-col items-end">
          <MoneyText minorUnits={row.expectedIncentivePaise} currency="INR" />
          <span className="text-xs text-text-muted">
            Credited:{" "}
            <MoneyText
              minorUnits={row.creditedIncentivePaise}
              currency="INR"
              className="text-text-muted"
            />
          </span>
        </div>
      ),
    },
    {
      id: "dueDate",
      header: "Realisation Due",
      cell: (row) =>
        row.realisationDueDate ? <DateText date={row.realisationDueDate} /> : <span>—</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const meta = STATUS_BADGE_MAP[row.status] ?? {
          label: row.status,
          variant: "neutral" as const,
        };
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
    },
  ];

  const checklistPercent = Math.round(
    (summary.checklist.completedCount / summary.checklist.totalCount) * 100
  );

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard-summary-root">
      {summary.planKey === "trial_pro" ? (
        <div
          data-testid="trial-pro-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft p-3.5 text-sm text-accent-soft-fg"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>7-day Pro trial active</strong>
              {summary.trialEndsAt ? (
                <>
                  {" "}
                  — full access until <DateText date={summary.trialEndsAt} /> (no card required).
                </>
              ) : (
                " — full access unlocked after your first upload."
              )}
            </span>
          </div>
          <Badge variant="accent">Pro Trial</Badge>
        </div>
      ) : null}

      {summary.hasDemoData ? (
        <div
          data-testid="demo-workspace-banner"
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft p-4 text-sm text-warning-soft-fg sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Sample Data (Demo) — {orgName} (IEC DEMO000101)</p>
              <p className="text-xs opacity-90">
                All numbers, shipping bills, IRMs, and scrips marked DEMO are synthetic examples so
                you can explore safely. Delete anytime in one click.
              </p>
            </div>
          </div>
          {canWrite ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={deletingDemo}
              loadingText="Deleting..."
              onClick={handleDeleteDemo}
              data-testid="delete-demo-data-btn"
              className="shrink-0"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Delete sample data</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text">Leakage &amp; Deadlines</h2>
          <p className="text-xs text-text-muted">
            Money found, approaching FEMA deadlines, and eBRC readiness in INR.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!embeddedInWizard && onReplayTour ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReplayTour}
              data-testid="replay-tour-btn"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span>Take quick tour</span>
            </Button>
          ) : null}
          <Button
            asChild
            variant="primary"
            size="sm"
            data-tour-id="tour-export"
            data-testid="bulk-ebrc-action"
          >
            <Link href="/app/documents">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              <span>Prepare eBRC / Upload</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI totals */}
      <section
        aria-label="Key financial metrics"
        data-tour-id="tour-totals"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Stat
          label="Unclaimed incentive"
          minorUnits={summary.unclaimedIncentivePaise}
          currency="INR"
          trend={
            summary.unclaimedIncentivePaise > 0
              ? { label: "Action needed", direction: "up", tone: "warning" }
              : { label: "Up to date", direction: "neutral", tone: "success" }
          }
        />
        <Stat
          label="At risk (< 60 days)"
          count={summary.atRiskCount}
          trend={{
            label: summary.atRiskCount > 0 ? "Deadline soon" : "On track",
            direction: "neutral",
            tone: summary.atRiskCount > 0 ? "warning" : "success",
          }}
        />
        <Stat
          label="Matched & closed"
          count={summary.matchedAndClosedCount}
          trend={{ label: "eBRC eligible", direction: "up", tone: "success" }}
        />
        <Stat
          label="Scrips expiring in 90d"
          minorUnits={summary.expiringScripsPaise}
          currency="INR"
          trend={{
            label: `${summary.expiringScripsCount} active`,
            direction: "neutral",
            tone: summary.expiringScripsCount > 0 ? "warning" : "neutral",
          }}
        />
      </section>

      {/* Persistent Onboarding Checklist */}
      {!embeddedInWizard && !summary.checklist.allComplete && !summary.checklistDismissedAt ? (
        <Card data-testid="onboarding-checklist">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Getting started checklist</CardTitle>
                <CardDescription>
                  Complete these 5 steps to generate your first bulk eBRC upload file.
                </CardDescription>
              </div>
              <Badge variant="accent">
                {summary.checklist.completedCount} of {summary.checklist.totalCount} complete
              </Badge>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${checklistPercent}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {CHECKLIST_ITEMS.map((item) => {
              const done = summary.checklist[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  )}
                  <span className={done ? "line-through text-text-muted" : "text-text"}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Shipments & Incentives */}
      <section data-tour-id="tour-shipments" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-text">Shipments &amp; incentives</h3>
          {!embeddedInWizard ? (
            <Link
              href="/app/documents"
              className="text-xs font-medium text-accent underline underline-offset-4"
            >
              Manage documents
            </Link>
          ) : null}
        </div>
        <DataTable
          data={summary.shipments}
          columns={columns}
          keyExtractor={(row) => row.id}
          mobileTitle={(row) => (
            <div className="flex items-center gap-2">
              <span>{row.sbNumber}</span>
              {row.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
            </div>
          )}
          mobileSubtitle={(row) => row.buyerName}
          caption="Shipping Bills and incentive status"
          emptyState={
            <EmptyState
              icon={<FileSpreadsheet className="h-6 w-6" aria-hidden="true" />}
              title="No shipments yet"
              description="Upload your first Shipping Bill PDF or try our sample demo workspace from onboarding."
              action={
                !embeddedInWizard && canWrite ? (
                  <Button asChild variant="primary" size="sm">
                    <Link href="/app/documents">Upload first document</Link>
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </section>

      {/* Open Alerts */}
      <Card data-tour-id="tour-alerts">
        <CardHeader>
          <CardTitle className="text-base">Open deadlines &amp; alerts</CardTitle>
          <CardDescription>
            {summary.openAlertsCount === 0
              ? "No open alerts for this workspace."
              : `${summary.openAlertsCount} open alert${summary.openAlertsCount === 1 ? "" : "s"} needing attention.`}
          </CardDescription>
        </CardHeader>
        {summary.openAlerts.length > 0 ? (
          <CardContent className="flex flex-col gap-2">
            {summary.openAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={alert.severity === "critical" ? "danger" : "warning"}>
                    {alert.severity}
                  </Badge>
                  {alert.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
                  <span className="font-medium text-text">
                    {alert.kind === "realisation_deadline"
                      ? "FEMA payment realisation deadline approaching"
                      : "Unclaimed RoDTEP / Drawback incentive"}
                  </span>
                  {alert.sbNumber ? (
                    <span className="text-xs text-text-muted">SB {alert.sbNumber}</span>
                  ) : null}
                </div>
                {alert.dueOn ? (
                  <span className="text-xs text-text-muted">
                    Due <DateText date={alert.dueOn} />
                  </span>
                ) : null}
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>

      {!embeddedInWizard ? <TrustFooterBar /> : null}
    </div>
  );
}
