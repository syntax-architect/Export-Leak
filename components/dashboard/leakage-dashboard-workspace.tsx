"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  BellOff,
  Bookmark,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { DASHBOARD_DEFAULT_PAGE_SIZE } from "@/config/deadlines";
import { UpgradePlanDialog } from "@/components/billing/upgrade-plan-dialog";
import { TrustFooterBar } from "@/components/trust/trust-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import type { PlanLimitDetails } from "@/lib/auth/errors";
import type {
  DashboardLeakageShipmentRow,
  DashboardSavedViewRow,
  LeakageDashboardData,
} from "@/lib/dashboard/repository";
import type { MembershipRole } from "@/lib/database.types";
import type { DashboardSummary } from "@/lib/onboarding/repository";
import { cn } from "@/lib/utils";

export type DashboardPreset =
  "all" | "unclaimed" | "at_risk" | "matched_closed" | "expiring_scrips" | "overdue";

export interface LeakageDashboardWorkspaceProps {
  summary: DashboardSummary;
  initialData: LeakageDashboardData;
  activeIecId: string | null;
  role: MembershipRole;
  onReplayTour?: () => void;
}

const CHECKLIST_ITEMS = [
  { key: "addIec" as const, label: "Add IEC", href: "/app/iecs" },
  { key: "uploadShippingBills" as const, label: "Upload shipping bills", href: "/app/documents" },
  { key: "uploadIrm" as const, label: "Upload IRM export", href: "/app/documents" },
  { key: "reviewMatches" as const, label: "Review matches", href: "/app/matches" },
  { key: "downloadEbrc" as const, label: "Download first eBRC file", href: "/app/ebrc" },
];

const SB_STATUS_BADGES: Record<
  DashboardLeakageShipmentRow["status"],
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

const INCENTIVE_BADGES: Record<
  DashboardLeakageShipmentRow["incentiveStatus"],
  { label: string; variant: "neutral" | "accent" | "success" | "warning" | "danger" }
> = {
  matched: { label: "Incentive credited", variant: "success" },
  short: { label: "Short credit", variant: "warning" },
  missing: { label: "Missing credit", variant: "danger" },
  not_claimed: { label: "Not claimed", variant: "danger" },
  none: { label: "No calculation", variant: "neutral" },
};

const PAYMENT_BADGES: Record<
  DashboardLeakageShipmentRow["paymentStatus"],
  { label: string; variant: "neutral" | "accent" | "success" | "warning" | "danger" }
> = {
  full: { label: "Paid", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  unpaid: { label: "Unpaid", variant: "danger" },
};

function DeadlineIndicator({ row }: { row: DashboardLeakageShipmentRow }) {
  if (row.daysToDeadline === null || !row.realisationDueDate) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Badge variant="neutral">Rule needed</Badge>
      </div>
    );
  }

  const days = row.daysToDeadline;
  const ringValue = days <= 0 ? 0 : Math.min(row.periodTotalDays, days);
  const centerLabel = days <= 0 ? "0d" : `${days}d`;
  const tone = row.deadlineTone === "neutral" ? "accent" : row.deadlineTone;

  return (
    <div className="flex items-center gap-2.5">
      <ProgressRing
        value={ringValue}
        max={Math.max(1, row.periodTotalDays)}
        size={40}
        strokeWidth={4}
        tone={tone}
        centerText={centerLabel}
        label={`Realisation deadline ${days} days left`}
      />
      <div className="min-w-0">
        {row.isOverdue ? (
          <span
            data-testid="deadline-overdue-badge"
            className="inline-flex items-center rounded-[var(--radius-pill)] bg-red-900 px-2 py-0.5 text-[11px] font-semibold text-white"
          >
            Overdue {Math.abs(days)}d
          </span>
        ) : (
          <p className="text-xs font-medium text-text tabular-nums-money">{days} days left</p>
        )}
        <p className="text-[11px] text-text-muted">
          <DateText date={row.realisationDueDate} />
        </p>
      </div>
    </div>
  );
}

export function LeakageDashboardWorkspace({
  summary,
  initialData,
  activeIecId,
  role,
  onReplayTour,
}: LeakageDashboardWorkspaceProps) {
  const router = useRouter();
  const { toast } = useToast();
  const shipmentsSectionRef = React.useRef<HTMLElement | null>(null);

  const canWrite = role !== "viewer";
  const data = initialData;
  const [deletingDemo, setDeletingDemo] = React.useState(false);
  const [downloadingFormat, setDownloadingFormat] = React.useState<"pdf" | "xlsx" | null>(null);
  const [upgradePrompt, setUpgradePrompt] = React.useState<PlanLimitDetails | null>(null);

  async function handleDownloadReport(format: "pdf" | "xlsx") {
    setDownloadingFormat(format);
    try {
      const res = await fetch(`/api/orgs/${data.summary.orgId}/reports/leakage?format=${format}`);
      if (res.status === 402) {
        const body = (await res.json()) as { error?: { details?: PlanLimitDetails } };
        if (body.error?.details) {
          setUpgradePrompt(body.error.details);
          return;
        }
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast({
          title: body?.error?.message ?? "Could not generate leakage report.",
          variant: "danger",
        });
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? `exportleak-leakage-report.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Network error while downloading report.", variant: "danger" });
    } finally {
      setDownloadingFormat(null);
    }
  }

  // Filters, search, sort & pagination
  const [preset, setPreset] = React.useState<DashboardPreset>("all");
  const [search, setSearch] = React.useState("");
  const [deadlineBucket, setDeadlineBucket] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<DashboardSavedViewRow["sortBy"]>("days_left");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);

  // Saved Views (server data + optimistic deltas, zero effects)
  const [addedViews, setAddedViews] = React.useState<DashboardSavedViewRow[]>([]);
  const [deletedViewIds, setDeletedViewIds] = React.useState<Record<string, boolean>>({});
  const [newViewName, setNewViewName] = React.useState("");
  const [savingView, setSavingView] = React.useState(false);
  const [showSaveViewBox, setShowSaveViewBox] = React.useState(false);

  // Alerts (server data + optimistic resolve/snooze deltas)
  const [alertPatch, setAlertPatch] = React.useState<
    Record<string, { resolved?: boolean; snoozedUntil?: string | null; isSnoozed?: boolean }>
  >({});
  const [showSnoozedAlerts, setShowSnoozedAlerts] = React.useState(false);
  const [busyAlertId, setBusyAlertId] = React.useState<string | null>(null);

  // Consultant Home client sorting & switching
  const [clientSortBy, setClientSortBy] = React.useState<
    "unclaimed" | "next_deadline" | "at_risk" | "legal_name"
  >("unclaimed");
  const [clientSortDir, setClientSortDir] = React.useState<"asc" | "desc">("desc");
  const [switchingIecId, setSwitchingIecId] = React.useState<string | null>(null);

  const savedViews = React.useMemo(() => {
    const byId = new Map<string, DashboardSavedViewRow>();
    for (const v of [...addedViews, ...data.savedViews]) {
      if (!deletedViewIds[v.id] && !byId.has(v.id)) {
        byId.set(v.id, v);
      }
    }
    return Array.from(byId.values());
  }, [addedViews, data.savedViews, deletedViewIds]);

  const alerts = React.useMemo(
    () =>
      data.alerts
        .filter((a) => !alertPatch[a.id]?.resolved)
        .map((a) => {
          const patch = alertPatch[a.id];
          if (!patch) return a;
          return {
            ...a,
            snoozedUntil: patch.snoozedUntil !== undefined ? patch.snoozedUntil : a.snoozedUntil,
            isSnoozed: patch.isSnoozed !== undefined ? patch.isSnoozed : a.isSnoozed,
          };
        }),
    [data.alerts, alertPatch]
  );

  const checklistPercent = Math.round(
    (summary.checklist.completedCount / Math.max(1, summary.checklist.totalCount)) * 100
  );

  function selectPreset(nextPreset: DashboardPreset) {
    setPage(1);
    setPreset((curr) => (curr === nextPreset ? "all" : nextPreset));
    if (shipmentsSectionRef.current) {
      shipmentsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function handleDeleteDemo() {
    if (!canWrite) return;
    setDeletingDemo(true);
    try {
      const res = await fetch(`/api/orgs/${data.summary.orgId}/demo`, { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Could not remove sample data", variant: "danger" });
        return;
      }
      toast({ title: "Sample demo workspace deleted", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Network error while removing sample data", variant: "danger" });
    } finally {
      setDeletingDemo(false);
    }
  }

  async function handleAlertAction(alertId: string, action: "resolve" | "snooze" | "reopen") {
    if (!canWrite) return;
    setBusyAlertId(alertId);
    try {
      const res = await fetch(`/api/orgs/${data.summary.orgId}/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "snooze" ? { action, snoozeDays: 7 } : { action }),
      });
      if (!res.ok) {
        toast({ title: "Could not update alert", variant: "danger" });
        return;
      }
      const json = (await res.json()) as {
        alert: { resolvedAt: string | null; snoozedUntil: string | null };
      };
      if (action === "resolve") {
        setAlertPatch((prev) => ({ ...prev, [alertId]: { resolved: true } }));
        toast({ title: "Alert resolved", variant: "success" });
      } else {
        setAlertPatch((prev) => ({
          ...prev,
          [alertId]: {
            snoozedUntil: json.alert.snoozedUntil,
            isSnoozed: action === "snooze",
          },
        }));
        toast({
          title: action === "snooze" ? "Alert snoozed for 7 days" : "Alert reopened",
          variant: "success",
        });
      }
      router.refresh();
    } catch {
      toast({ title: "Network error updating alert", variant: "danger" });
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleSaveView(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite || !newViewName.trim()) return;
    setSavingView(true);
    try {
      const res = await fetch(`/api/orgs/${data.summary.orgId}/dashboard/saved-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newViewName.trim(),
          filters: {
            preset,
            search: search.trim() || undefined,
            deadlineBucket: deadlineBucket !== "all" ? deadlineBucket : undefined,
          },
          sortBy,
          sortDir,
        }),
      });
      if (!res.ok) {
        toast({ title: "Could not save view", variant: "danger" });
        return;
      }
      const json = (await res.json()) as { savedView: DashboardSavedViewRow };
      setAddedViews((prev) => [json.savedView, ...prev.filter((v) => v.id !== json.savedView.id)]);
      setDeletedViewIds((prev) => ({ ...prev, [json.savedView.id]: false }));
      setNewViewName("");
      setShowSaveViewBox(false);
      toast({ title: `Saved view "${json.savedView.name}"`, variant: "success" });
    } catch {
      toast({ title: "Network error saving view", variant: "danger" });
    } finally {
      setSavingView(false);
    }
  }

  async function handleDeleteSavedView(viewId: string) {
    if (!canWrite) return;
    try {
      const res = await fetch(
        `/api/orgs/${data.summary.orgId}/dashboard/saved-views?viewId=${encodeURIComponent(viewId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        toast({ title: "Could not delete saved view", variant: "danger" });
        return;
      }
      setDeletedViewIds((prev) => ({ ...prev, [viewId]: true }));
      toast({ title: "Saved view removed", variant: "success" });
    } catch {
      toast({ title: "Network error removing view", variant: "danger" });
    }
  }

  function applySavedView(view: DashboardSavedViewRow) {
    setPage(1);
    setPreset((view.filters.preset as DashboardPreset) || "all");
    setSearch(view.filters.search ?? "");
    setDeadlineBucket(view.filters.deadlineBucket ?? "all");
    setSortBy(view.sortBy);
    setSortDir(view.sortDir);
  }

  async function switchClientIec(iecId: string | null) {
    setSwitchingIecId(iecId ?? "all");
    try {
      const res = await fetch("/api/orgs/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: data.summary.orgId, iecId: iecId ?? undefined }),
      });
      if (!res.ok) {
        toast({ title: "Could not switch client IEC", variant: "danger" });
        return;
      }
      router.refresh();
    } catch {
      toast({ title: "Network error switching client IEC", variant: "danger" });
    } finally {
      setSwitchingIecId(null);
    }
  }

  const filteredShipments = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = data.shipments.filter((row) => {
      if (preset === "unclaimed" && row.unclaimedIncentivePaise <= 0) return false;
      if (preset === "at_risk" && !row.isAtRisk) return false;
      if (preset === "matched_closed" && !row.isMatchedAndClosed) return false;
      if (preset === "overdue" && !(row.isOverdue && !row.isMatchedAndClosed)) return false;

      if (deadlineBucket !== "all" && row.deadlineBucket !== deadlineBucket) {
        return false;
      }

      if (query) {
        const hay =
          `${row.sbNumber} ${row.buyerName} ${row.portCode} ${row.invoiceNo ?? ""} ${row.iecCode}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "days_left": {
          const av = a.daysToDeadline ?? Number.MAX_SAFE_INTEGER;
          const bv = b.daysToDeadline ?? Number.MAX_SAFE_INTEGER;
          cmp = av - bv;
          break;
        }
        case "sb_date":
          cmp = a.sbDate.localeCompare(b.sbDate);
          break;
        case "fob_minor":
          cmp = a.fobMinor - b.fobMinor;
          break;
        case "expected_incentive":
          cmp = a.expectedIncentivePaise - b.expectedIncentivePaise;
          break;
        case "unclaimed_incentive":
          cmp = a.unclaimedIncentivePaise - b.unclaimedIncentivePaise;
          break;
        case "sb_number":
          cmp = a.sbNumber.localeCompare(b.sbNumber);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [data.shipments, preset, deadlineBucket, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredShipments.length / DASHBOARD_DEFAULT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedShipments = React.useMemo(() => {
    const start = (safePage - 1) * DASHBOARD_DEFAULT_PAGE_SIZE;
    return filteredShipments.slice(start, start + DASHBOARD_DEFAULT_PAGE_SIZE);
  }, [filteredShipments, safePage]);

  const sortedClients = React.useMemo(() => {
    const copy = [...data.consultantClients];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (clientSortBy) {
        case "unclaimed":
          cmp = a.unclaimedIncentivePaise - b.unclaimedIncentivePaise;
          break;
        case "at_risk":
          cmp = a.atRiskCount - b.atRiskCount;
          break;
        case "next_deadline": {
          const av = a.nextDeadlineDaysLeft ?? Number.MAX_SAFE_INTEGER;
          const bv = b.nextDeadlineDaysLeft ?? Number.MAX_SAFE_INTEGER;
          cmp = av - bv;
          break;
        }
        case "legal_name":
          cmp = a.legalName.localeCompare(b.legalName);
          break;
      }
      return clientSortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data.consultantClients, clientSortBy, clientSortDir]);

  const visibleAlerts = React.useMemo(
    () => (showSnoozedAlerts ? alerts : alerts.filter((a) => !a.isSnoozed)),
    [alerts, showSnoozedAlerts]
  );
  const snoozedCount = React.useMemo(() => alerts.filter((a) => a.isSnoozed).length, [alerts]);
  const showConsultantHome =
    data.summary.orgType === "consultant" || data.consultantClients.length > 1;

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard-summary-root">
      {data.summary.hasDemoData ? (
        <div
          data-testid="demo-workspace-banner"
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft p-4 text-sm text-warning-soft-fg sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                Sample Data (Demo) — {data.summary.orgName} (IEC DEMO000101)
              </p>
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
              className="min-h-11 shrink-0"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Delete sample data</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Header + Export Report actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text">Leakage &amp; Deadlines</h2>
          <p className="text-xs text-text-muted">
            Unclaimed export incentives, FEMA realisation deadlines, and client risk tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onReplayTour ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReplayTour}
              data-testid="replay-tour-btn"
              className="min-h-11"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span>Take quick tour</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            loading={downloadingFormat === "pdf"}
            onClick={() => void handleDownloadReport("pdf")}
            data-testid="download-report-pdf"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Download leakage report (PDF)</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            loading={downloadingFormat === "xlsx"}
            onClick={() => void handleDownloadReport("xlsx")}
            data-testid="download-report-xlsx"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <span>Excel report</span>
          </Button>
          <Button
            asChild
            variant="primary"
            size="sm"
            data-tour-id="tour-export"
            data-testid="bulk-ebrc-action"
            className="min-h-11"
          >
            <Link href="/app/documents">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              <span>Prepare eBRC / Upload</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Top Row Tappable Stat Cards */}
      <section
        aria-label="Key financial metrics"
        data-tour-id="tour-totals"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Stat
          label="Unclaimed incentive"
          minorUnits={data.summary.unclaimedIncentivePaise}
          currency="INR"
          onClick={() => selectPreset("unclaimed")}
          className={cn(preset === "unclaimed" && "ring-2 ring-accent")}
          trend={
            data.summary.unclaimedIncentivePaise > 0
              ? { label: "Filter unclaimed", direction: "up", tone: "warning" }
              : { label: "All claimed", direction: "neutral", tone: "success" }
          }
        />
        <Stat
          label="At risk (deadline in under 60 days)"
          count={data.summary.atRiskCount}
          onClick={() => selectPreset("at_risk")}
          className={cn(preset === "at_risk" && "ring-2 ring-accent")}
          trend={{
            label: data.summary.atRiskCount > 0 ? "Filter at risk" : "On track",
            direction: "neutral",
            tone: data.summary.atRiskCount > 0 ? "danger" : "success",
          }}
        />
        <Stat
          label="Matched and closed"
          count={data.summary.matchedAndClosedCount}
          onClick={() => selectPreset("matched_closed")}
          className={cn(preset === "matched_closed" && "ring-2 ring-accent")}
          trend={{ label: "eBRC eligible", direction: "up", tone: "success" }}
        />
        <Stat
          label="Scrips expiring in 90 days"
          minorUnits={data.summary.scripsExpiring90Paise}
          currency="INR"
          onClick={() => selectPreset("expiring_scrips")}
          className={cn(preset === "expiring_scrips" && "ring-2 ring-accent")}
          trend={{
            label: `${data.summary.scripsExpiring90Count} scrips`,
            direction: "neutral",
            tone: data.summary.scripsExpiring90Count > 0 ? "warning" : "neutral",
          }}
        />
      </section>

      {/* Onboarding Checklist */}
      {!summary.checklist.allComplete && !summary.checklistDismissedAt ? (
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

      {/* Expiring Scrips Drawer/Card when Scrips Stat Card is active */}
      {preset === "expiring_scrips" ? (
        <Card data-testid="expiring-scrips-panel">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Scrips expiring within 90 days</CardTitle>
                <CardDescription>
                  Utilise or transfer active duty credit scrips before expiry.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="secondary" size="sm" className="min-h-11">
                  <Link href="/app/incentives">Open Incentives &amp; Scrips</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreset("all")}
                  className="min-h-11"
                >
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.expiringScrips.length === 0 ? (
              <p className="text-sm text-text-muted">No active scrips expiring within 90 days.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.expiringScrips.map((scrip) => (
                  <div
                    key={scrip.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{scrip.scripNumber}</p>
                      <p className="text-xs text-text-muted">
                        {scrip.scheme.toUpperCase()} • Expires <DateText date={scrip.expiresOn} />
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-text">
                        <MoneyText minorUnits={scrip.faceMinor} currency="INR" />
                      </p>
                      <Badge variant={scrip.daysToExpiry < 30 ? "danger" : "warning"}>
                        {scrip.daysToExpiry <= 0 ? "Expired" : `${scrip.daysToExpiry}d left`}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Consultant Home / Client IEC Portfolio */}
      {showConsultantHome ? (
        <Card data-testid="consultant-home-card">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                <div>
                  <CardTitle className="text-base">Consultant Home — Client IECs</CardTitle>
                  <CardDescription>
                    Compare leakage and next FEMA deadlines across all client IECs. Tap to switch.
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeIecId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => switchClientIec(null)}
                    disabled={switchingIecId !== null}
                    className="min-h-11"
                  >
                    Show all IECs
                  </Button>
                ) : null}
                <select
                  aria-label="Sort client IECs"
                  value={`${clientSortBy}:${clientSortDir}`}
                  onChange={(e) => {
                    const [col, dir] = e.target.value.split(":");
                    setClientSortBy(col as typeof clientSortBy);
                    setClientSortDir((dir as "asc" | "desc") ?? "desc");
                  }}
                  className="min-h-11 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-xs text-text"
                >
                  <option value="unclaimed:desc">Highest leakage first</option>
                  <option value="next_deadline:asc">Soonest deadline first</option>
                  <option value="at_risk:desc">Most at-risk first</option>
                  <option value="legal_name:asc">Client name A-Z</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-text-muted">
                    <th className="py-2.5 pr-3">Client / IEC</th>
                    <th className="py-2.5 px-3 text-right">Shipments</th>
                    <th className="py-2.5 px-3 text-right">Unclaimed Leakage</th>
                    <th className="py-2.5 px-3 text-right">At Risk (&lt;60d)</th>
                    <th className="py-2.5 px-3">Next Deadline</th>
                    <th className="py-2.5 pl-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClients.map((client) => {
                    const isCurrent = activeIecId === client.iecId;
                    return (
                      <tr
                        key={client.iecId}
                        className="border-b border-border-subtle last:border-0"
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text">{client.legalName}</span>
                            {client.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
                            {isCurrent ? <Badge variant="accent">Active</Badge> : null}
                          </div>
                          <p className="font-mono text-xs text-text-muted">{client.iecCode}</p>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums-money">
                          {client.shipmentCount}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold">
                          <MoneyText minorUnits={client.unclaimedIncentivePaise} currency="INR" />
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Badge variant={client.atRiskCount > 0 ? "danger" : "neutral"}>
                            {client.atRiskCount}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          {client.nextDeadlineDate && client.nextDeadlineDaysLeft !== null ? (
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  client.nextDeadlineTone === "danger"
                                    ? "danger"
                                    : client.nextDeadlineTone === "warning"
                                      ? "warning"
                                      : "success"
                                }
                              >
                                {client.nextDeadlineDaysLeft <= 0
                                  ? `Overdue ${Math.abs(client.nextDeadlineDaysLeft)}d`
                                  : `${client.nextDeadlineDaysLeft}d left`}
                              </Badge>
                              <span className="text-xs text-text-muted">
                                <DateText date={client.nextDeadlineDate} />
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">No open deadlines</span>
                          )}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={isCurrent ? "secondary" : "primary"}
                            disabled={isCurrent || switchingIecId !== null}
                            onClick={() => switchClientIec(client.iecId)}
                            className="min-h-11"
                          >
                            {isCurrent ? "Selected" : "Switch client"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {sortedClients.map((client) => {
                const isCurrent = activeIecId === client.iecId;
                return (
                  <div
                    key={client.iecId}
                    className="rounded-[var(--radius-sm)] border border-border-subtle p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-text">{client.legalName}</p>
                        <p className="font-mono text-xs text-text-muted">{client.iecCode}</p>
                      </div>
                      <Badge variant={client.atRiskCount > 0 ? "danger" : "neutral"}>
                        {client.atRiskCount} at risk
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-text-muted">Leakage:</span>
                      <span className="font-semibold text-text">
                        <MoneyText minorUnits={client.unclaimedIncentivePaise} currency="INR" />
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-text-muted">Next deadline:</span>
                      <span>
                        {client.nextDeadlineDate ? (
                          <DateText date={client.nextDeadlineDate} />
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isCurrent ? "secondary" : "primary"}
                      disabled={isCurrent || switchingIecId !== null}
                      onClick={() => switchClientIec(client.iecId)}
                      className="mt-3 min-h-11 w-full"
                    >
                      {isCurrent ? "Active client" : "Open client"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Shipments List + Filter/Search/Sort/Saved Views */}
      <section
        ref={shipmentsSectionRef}
        data-tour-id="tour-shipments"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-text">
            Shipments &amp; incentives ({filteredShipments.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowSaveViewBox((v) => !v)}
                className="min-h-11"
                data-testid="toggle-save-view-btn"
              >
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                <span>Save current view</span>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Saved Views chips & creation bar */}
        {showSaveViewBox ? (
          <form
            onSubmit={handleSaveView}
            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-muted/40 p-3"
          >
            <Input
              aria-label="Saved view name"
              placeholder="e.g. Overdue US buyers"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="min-h-11 flex-1 min-w-[180px]"
              data-testid="save-view-name-input"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={savingView}
              disabled={!newViewName.trim()}
              className="min-h-11"
              data-testid="confirm-save-view-btn"
            >
              Save view
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSaveViewBox(false)}
              className="min-h-11"
            >
              Cancel
            </Button>
          </form>
        ) : null}

        {savedViews.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="saved-views-bar">
            <span className="text-xs font-medium text-text-muted">Saved views:</span>
            {savedViews.map((view) => (
              <div
                key={view.id}
                className="inline-flex items-center rounded-[var(--radius-pill)] border border-border bg-surface pl-3 pr-1 text-xs"
              >
                <button
                  type="button"
                  onClick={() => applySavedView(view)}
                  className="min-h-9 py-1 pr-2 font-medium text-text hover:text-accent cursor-pointer"
                >
                  {view.name}
                </button>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`Delete view ${view.name}`}
                    onClick={() => handleDeleteSavedView(view.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-danger cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* Filter & Sort Controls */}
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface p-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All"],
                ["unclaimed", "Unclaimed incentive"],
                ["at_risk", "At risk (<60d)"],
                ["overdue", "Overdue"],
                ["matched_closed", "Matched & closed"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPage(1);
                  setPreset(key);
                }}
                className={cn(
                  "min-h-11 rounded-[var(--radius-pill)] border px-3 text-xs font-medium transition-colors cursor-pointer",
                  preset === key
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-surface text-text-muted hover:bg-surface-muted hover:text-text"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search shipments"
                placeholder="Search SB #, buyer, port, invoice..."
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                className="min-h-11 pl-9"
                data-testid="shipments-search-input"
              />
            </div>

            <select
              aria-label="Filter by deadline urgency"
              value={deadlineBucket}
              onChange={(e) => {
                setPage(1);
                setDeadlineBucket(e.target.value);
              }}
              className="min-h-11 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              <option value="all">All deadline windows</option>
              <option value="overdue">Overdue (&lt;= 0 days)</option>
              <option value="critical">Critical (&lt; 30 days)</option>
              <option value="warning">Warning (30 - 90 days)</option>
              <option value="healthy">Healthy (&gt; 90 days)</option>
              <option value="unknown">Rule missing / unknown</option>
            </select>

            <div className="flex items-center gap-2">
              <select
                aria-label="Sort shipments"
                value={sortBy}
                onChange={(e) => {
                  setPage(1);
                  setSortBy(e.target.value as DashboardSavedViewRow["sortBy"]);
                }}
                className="min-h-11 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text"
              >
                <option value="days_left">Sort: Days to deadline</option>
                <option value="unclaimed_incentive">Sort: Unclaimed incentive</option>
                <option value="fob_minor">Sort: FOB value</option>
                <option value="sb_date">Sort: Shipping Bill date</option>
                <option value="sb_number">Sort: Shipping Bill #</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Toggle sort order"
                onClick={() => {
                  setPage(1);
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                }}
                className="min-h-11 px-3"
              >
                <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Empty or Data views */}
        {filteredShipments.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="h-6 w-6" aria-hidden="true" />}
            title={data.shipments.length === 0 ? "No shipments yet" : "No matching shipments"}
            description={
              data.shipments.length === 0
                ? "Upload your first Shipping Bill PDF to compute deadlines and incentive leakage."
                : "Try clearing one of your active filters or search terms."
            }
            action={
              data.shipments.length === 0 && canWrite ? (
                <Button asChild variant="primary" size="sm" className="min-h-11">
                  <Link href="/app/documents">Upload first document</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPreset("all");
                    setSearch("");
                    setDeadlineBucket("all");
                  }}
                  className="min-h-11"
                >
                  Reset filters
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Desktop Table */}
            <Card className="hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/40 text-xs font-medium text-text-muted">
                      <th className="py-3 pl-4 pr-3">Shipping Bill</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Buyer</th>
                      <th className="py-3 px-3 text-right">FOB</th>
                      <th className="py-3 px-3 text-right">Expected / Credited</th>
                      <th className="py-3 px-3 text-right">Payment Matched</th>
                      <th className="py-3 px-3">Days to Deadline</th>
                      <th className="py-3 pl-3 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedShipments.map((row) => {
                      const sbMeta = SB_STATUS_BADGES[row.status];
                      const incMeta = INCENTIVE_BADGES[row.incentiveStatus];
                      const payMeta = PAYMENT_BADGES[row.paymentStatus];
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-border-subtle last:border-0 hover:bg-surface-muted/20"
                        >
                          <td className="py-3 pl-4 pr-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/app/shipping-bills/${row.id}`}
                                className="font-semibold text-accent underline-offset-4 hover:underline"
                              >
                                {row.sbNumber}
                              </Link>
                              {row.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
                            </div>
                            <p className="text-xs text-text-muted">{row.portCode}</p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-xs text-text-muted">
                            <DateText date={row.sbDate} />
                          </td>
                          <td className="py-3 px-3 max-w-[180px] truncate text-text">
                            {row.buyerName}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap font-medium text-text">
                            <MoneyText minorUnits={row.fobMinor} currency={row.currency} />
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <p className="font-medium text-text">
                              <MoneyText minorUnits={row.expectedIncentivePaise} currency="INR" />
                            </p>
                            <p className="text-xs text-text-muted">
                              Cred:{" "}
                              <MoneyText
                                minorUnits={row.creditedIncentivePaise}
                                currency="INR"
                                className="text-text-muted"
                              />
                            </p>
                            {row.unclaimedIncentivePaise > 0 ? (
                              <p className="text-[11px] font-semibold text-danger">
                                Gap:{" "}
                                <MoneyText
                                  minorUnits={row.unclaimedIncentivePaise}
                                  currency="INR"
                                />
                              </p>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <p className="font-medium text-text">
                              <MoneyText minorUnits={row.matchedMinor} currency={row.currency} />
                            </p>
                            <Badge variant={payMeta.variant}>{payMeta.label}</Badge>
                          </td>
                          <td className="py-3 px-3">
                            <DeadlineIndicator row={row} />
                          </td>
                          <td className="py-3 pl-3 pr-4">
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant={sbMeta.variant}>{sbMeta.label}</Badge>
                              <Badge variant={incMeta.variant}>{incMeta.label}</Badge>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Cards (< 768px) — most important facts first */}
            <div className="grid grid-cols-1 gap-3 md:hidden" data-testid="shipments-mobile-cards">
              {paginatedShipments.map((row) => {
                const sbMeta = SB_STATUS_BADGES[row.status];
                const incMeta = INCENTIVE_BADGES[row.incentiveStatus];
                return (
                  <Card key={row.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/app/shipping-bills/${row.id}`}
                              className="text-base font-bold text-accent underline underline-offset-4"
                            >
                              {row.sbNumber}
                            </Link>
                            {row.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
                          </div>
                          <p className="truncate text-xs text-text-muted">
                            {row.buyerName} • <DateText date={row.sbDate} />
                          </p>
                        </div>
                        <DeadlineIndicator row={row} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-sm)] bg-surface-muted/40 p-2.5 text-xs">
                        <div>
                          <p className="text-text-muted">FOB Value</p>
                          <p className="font-semibold text-text">
                            <MoneyText minorUnits={row.fobMinor} currency={row.currency} />
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-text-muted">Unclaimed Incentive</p>
                          <p
                            className={cn(
                              "font-semibold",
                              row.unclaimedIncentivePaise > 0 ? "text-danger" : "text-text"
                            )}
                          >
                            <MoneyText minorUnits={row.unclaimedIncentivePaise} currency="INR" />
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={sbMeta.variant}>{sbMeta.label}</Badge>
                          <Badge variant={incMeta.variant}>{incMeta.label}</Badge>
                        </div>
                        <Button asChild variant="secondary" size="sm" className="min-h-11">
                          <Link href={`/app/shipping-bills/${row.id}`}>
                            <span>Timeline</span>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-4 py-2.5 text-xs">
                <span className="text-text-muted">
                  Page {safePage} of {totalPages} ({filteredShipments.length} shipments)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-11"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-11"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Alerts Centre */}
      <Card data-tour-id="tour-alerts" data-testid="alerts-centre-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Alerts Centre</CardTitle>
              <CardDescription>
                {visibleAlerts.length === 0
                  ? "No active open alerts in this workspace."
                  : `${visibleAlerts.length} open alert${visibleAlerts.length === 1 ? "" : "s"} needing action.`}
              </CardDescription>
            </div>
            {snoozedCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSnoozedAlerts((v) => !v)}
                className="min-h-11"
              >
                {showSnoozedAlerts ? "Hide snoozed" : `Show snoozed (${snoozedCount})`}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {visibleAlerts.length > 0 ? (
          <CardContent className="flex flex-col gap-2.5">
            {visibleAlerts.map((alert) => {
              const busy = busyAlertId === alert.id;
              return (
                <div
                  key={alert.id}
                  data-testid={`alert-row-${alert.id}`}
                  className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-border-subtle p-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          alert.severity === "critical"
                            ? "danger"
                            : alert.severity === "warning"
                              ? "warning"
                              : "accent"
                        }
                      >
                        {alert.severity}
                      </Badge>
                      {alert.isDemo ? <Badge variant="warning">DEMO</Badge> : null}
                      {alert.isSnoozed ? <Badge variant="neutral">Snoozed</Badge> : null}
                      <span className="font-semibold text-text">{alert.title}</span>
                    </div>
                    <p className="text-xs text-text-muted">{alert.message}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                      {alert.dueOn ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          Due <DateText date={alert.dueOn} />
                        </span>
                      ) : null}
                      {alert.shippingBillId && alert.sbNumber ? (
                        <Link
                          href={`/app/shipping-bills/${alert.shippingBillId}`}
                          className="font-medium text-accent underline underline-offset-4"
                        >
                          Open SB #{alert.sbNumber}
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  {canWrite ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {alert.isSnoozed ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleAlertAction(alert.id, "reopen")}
                          className="min-h-11"
                        >
                          Unsnooze
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleAlertAction(alert.id, "snooze")}
                          data-testid={`snooze-alert-${alert.id}`}
                          className="min-h-11"
                        >
                          <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Snooze 7d</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleAlertAction(alert.id, "resolve")}
                        data-testid={`resolve-alert-${alert.id}`}
                        className="min-h-11"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Resolve</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        ) : null}
      </Card>

      <TrustFooterBar />

      <UpgradePlanDialog details={upgradePrompt} onClose={() => setUpgradePrompt(null)} />
    </div>
  );
}
