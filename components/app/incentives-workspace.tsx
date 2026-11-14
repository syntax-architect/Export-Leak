"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Calculator,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { INCENTIVE_SCHEME_LABELS, INCENTIVE_SCHEMES } from "@/config/incentives";
import type { IecWithAlertCount } from "@/lib/auth/repository";
import type { IncentiveScheme, MembershipRole, ScripStatus } from "@/lib/database.types";
import type { IncentiveComparisonRow, IncentivesWorkspaceData } from "@/lib/incentives/repository";
import type {
  IncentiveComparisonStatus,
  RateCsvPreviewResult,
  ScrollCsvPreviewResult,
} from "@/lib/incentives/types";
import { cn } from "@/lib/utils";

interface IncentivesWorkspaceProps {
  orgId: string;
  userRole: MembershipRole;
  iecs: IecWithAlertCount[];
  initialWorkspace: IncentivesWorkspaceData;
}

type ActiveTab = "comparison" | "scroll" | "scrips" | "rates";

const STATUS_BADGE: Record<
  IncentiveComparisonStatus,
  { label: string; variant: "primary" | "success" | "warning" | "danger" | "neutral" | "accent" }
> = {
  ok: { label: "OK", variant: "success" },
  short: { label: "Short", variant: "warning" },
  missing: { label: "Missing", variant: "danger" },
  not_claimed: { label: "Not claimed", variant: "neutral" },
  unknown_rate: { label: "Unknown rate", variant: "accent" },
};

const SCRIP_STATUS_BADGE: Record<
  ScripStatus,
  { label: string; variant: "primary" | "success" | "warning" | "danger" | "neutral" }
> = {
  active: { label: "Active", variant: "success" },
  utilised: { label: "Utilised", variant: "neutral" },
  transferred: { label: "Transferred", variant: "primary" },
  expired: { label: "Expired", variant: "danger" },
};

function canWriteRole(role: MembershipRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function IncentivesWorkspace({
  orgId,
  userRole,
  iecs,
  initialWorkspace,
}: IncentivesWorkspaceProps) {
  const { toast } = useToast();
  const canWrite = canWriteRole(userRole);

  const [workspace, setWorkspace] = React.useState<IncentivesWorkspaceData>(initialWorkspace);
  const [selectedIecId, setSelectedIecId] = React.useState<string>(
    initialWorkspace.activeIec?.id ?? iecs[0]?.id ?? ""
  );
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("comparison");
  const [statusFilter, setStatusFilter] = React.useState<IncentiveComparisonStatus | "all">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedRow, setSelectedRow] = React.useState<IncentiveComparisonRow | null>(null);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  // Scroll importer state
  const [scrollPreview, setScrollPreview] = React.useState<ScrollCsvPreviewResult | null>(null);

  // Admin rates importer state
  const [ratePreview, setRatePreview] = React.useState<RateCsvPreviewResult | null>(null);
  const [validityMonthsInput, setValidityMonthsInput] = React.useState(
    workspace.validityRule?.months ? String(workspace.validityRule.months) : ""
  );
  const [validityNoteInput, setValidityNoteInput] = React.useState(
    workspace.validityRule?.sourceNote ?? ""
  );

  // Scrip creation form state
  const [scripNumber, setScripNumber] = React.useState("");
  const [scripScheme, setScripScheme] = React.useState<IncentiveScheme>("rodtep");
  const [scripFaceAmount, setScripFaceAmount] = React.useState("");
  const [scripGeneratedOn, setScripGeneratedOn] = React.useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
  );
  const [scripExpiresOn, setScripExpiresOn] = React.useState("");
  const [scripNotes, setScripNotes] = React.useState("");

  const refreshWorkspace = React.useCallback(
    async (overrideIecId?: string) => {
      const targetIec = overrideIecId ?? selectedIecId;
      const query = targetIec ? `?iecId=${encodeURIComponent(targetIec)}` : "";
      const res = await fetch(`/api/orgs/${orgId}/incentives${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Could not load incentives",
          description: data?.error?.message ?? "Refresh failed.",
          variant: "danger",
        });
        return;
      }
      setWorkspace(data as IncentivesWorkspaceData);
    },
    [orgId, selectedIecId, toast]
  );

  const handleRecalculate = async () => {
    setBusyAction("recalculate");
    try {
      const res = await fetch(`/api/orgs/${orgId}/incentives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iecId: selectedIecId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Recalculation failed",
          description: data?.error?.message ?? "Could not recalculate incentives.",
          variant: "danger",
        });
        return;
      }
      toast({
        title: "Incentives recalculated",
        description: `Evaluated ${data.billsEvaluated} Shipping Bill(s) (${data.expectationsUpserted} scheme rows).`,
        variant: "success",
      });
      await refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const handleScrollFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!selectedIecId) {
      toast({ title: "Select an IEC profile first", variant: "danger" });
      return;
    }

    setBusyAction("scroll-preview");
    try {
      const formData = new FormData();
      formData.set("iecId", selectedIecId);
      formData.set("file", file);
      const res = await fetch(`/api/orgs/${orgId}/incentives/scroll`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Scroll preview failed",
          description: data?.error?.message ?? "Could not parse customs scroll file.",
          variant: "danger",
        });
        return;
      }
      setScrollPreview(data as ScrollCsvPreviewResult);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCommitScroll = async () => {
    if (!scrollPreview || scrollPreview.validRows.length === 0 || !selectedIecId) return;
    setBusyAction("scroll-commit");
    try {
      const res = await fetch(`/api/orgs/${orgId}/incentives/scroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          iecId: selectedIecId,
          rows: scrollPreview.validRows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Scroll commit failed",
          description: data?.error?.message ?? "Could not save credits.",
          variant: "danger",
        });
        return;
      }
      toast({
        title: "Scroll credits imported",
        description: `${data.importedCount} credit row(s) recorded and comparisons updated.`,
        variant: "success",
      });
      setScrollPreview(null);
      await refreshWorkspace();
      setActiveTab("comparison");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRateFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusyAction("rate-preview");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/admin/incentive-rates", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Rate preview failed",
          description:
            data?.error?.message ?? "Platform admin authorization or valid CSV required.",
          variant: "danger",
        });
        return;
      }
      setRatePreview(data as RateCsvPreviewResult);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCommitRates = async () => {
    if (!ratePreview || ratePreview.validRows.length === 0) return;
    setBusyAction("rate-commit");
    try {
      const res = await fetch("/api/admin/incentive-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          orgId,
          rows: ratePreview.validRows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Rate commit failed",
          description: data?.error?.message ?? "Could not commit incentive rates.",
          variant: "danger",
        });
        return;
      }
      toast({
        title: "Incentive rates imported",
        description: `${data.insertedCount} effective-dated rate row(s) saved.`,
        variant: "success",
      });
      setRatePreview(null);
      await refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmValidityRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const months = Number(validityMonthsInput);
    if (!Number.isInteger(months) || months <= 0) {
      toast({ title: "Enter positive integer months", variant: "danger" });
      return;
    }
    setBusyAction("validity-rule");
    try {
      const res = await fetch("/api/admin/incentive-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          months,
          days: 0,
          sourceNote: validityNoteInput.trim() || "Admin verified scrip validity",
          effectiveFrom: "2026-01-01",
          orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Could not save rule",
          description: data?.error?.message ?? "Save failed.",
          variant: "danger",
        });
        return;
      }
      toast({ title: "Scrip validity rule confirmed", variant: "success" });
      await refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateScrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIecId) return;
    setBusyAction("create-scrip");
    try {
      const res = await fetch(`/api/orgs/${orgId}/scrips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iecId: selectedIecId,
          scripNumber,
          scheme: scripScheme,
          faceAmountInr: scripFaceAmount,
          generatedOn: scripGeneratedOn,
          expiresOn: scripExpiresOn.trim() ? scripExpiresOn.trim() : null,
          notes: scripNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Could not save scrip",
          description: data?.error?.message ?? "Check inputs and retry.",
          variant: "danger",
        });
        return;
      }
      toast({
        title: "e-Scrip recorded",
        description: `Saved scrip ${data.scrip?.scripNumber ?? scripNumber}.`,
        variant: "success",
      });
      setScripNumber("");
      setScripFaceAmount("");
      setScripExpiresOn("");
      setScripNotes("");
      await refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateScripStatus = async (scripId: string, status: ScripStatus) => {
    setBusyAction(`scrip-${scripId}`);
    try {
      const res = await fetch(`/api/orgs/${orgId}/scrips/${scripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({
          title: "Status update failed",
          description: data?.error?.message ?? "Could not update scrip.",
          variant: "danger",
        });
        return;
      }
      await refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteScrip = async (scripId: string) => {
    setBusyAction(`del-${scripId}`);
    try {
      const res = await fetch(`/api/orgs/${orgId}/scrips/${scripId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast({
          title: "Delete failed",
          description: data?.error?.message ?? "Could not delete scrip.",
          variant: "danger",
        });
        return;
      }
      await refreshWorkspace();
    } finally {
      setBusyAction(null);
    }
  };

  const filteredRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workspace.rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (
        q &&
        !row.sbNumber.toLowerCase().includes(q) &&
        !INCENTIVE_SCHEME_LABELS[row.scheme].toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [workspace.rows, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incentives &amp; e-Scrips</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Compare expected RoDTEP, Drawback, and RoSCTL claims against customs scrolls and track
            scrip expiries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {iecs.length > 1 ? (
            <select
              aria-label="Active IEC profile"
              value={selectedIecId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedIecId(nextId);
                void refreshWorkspace(nextId);
              }}
              className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
            >
              {iecs.map((iec) => (
                <option key={iec.id} value={iec.id}>
                  {iec.iecCode} · {iec.legalName}
                </option>
              ))}
            </select>
          ) : null}

          {canWrite ? (
            <Button
              type="button"
              onClick={() => void handleRecalculate()}
              disabled={busyAction === "recalculate"}
              className="min-h-11"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", busyAction === "recalculate" && "animate-spin")}
              />
              {busyAction === "recalculate" ? "Calculating..." : "Recalculate"}
            </Button>
          ) : (
            <Badge variant="neutral">Read-only viewer</Badge>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expected (INR)</CardDescription>
            <CardTitle className="text-2xl">
              <MoneyText minorUnits={workspace.summary.expectedTotalInrMinor} currency="INR" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--muted-foreground)]">
            Computed strictly from confirmed SBs and effective-dated rates.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credited on Scrolls (INR)</CardDescription>
            <CardTitle className="text-2xl">
              <MoneyText minorUnits={workspace.summary.creditedTotalInrMinor} currency="INR" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--muted-foreground)]">
            From {workspace.credits.length} customs scroll credit entry(ies).
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shortfall / Missing (INR)</CardDescription>
            <CardTitle className="text-2xl text-[var(--danger-fg,#b91c1c)]">
              <MoneyText minorUnits={workspace.summary.gapTotalInrMinor} currency="INR" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--muted-foreground)]">
            {workspace.summary.shortOrMissingCount} short/missing ·{" "}
            {workspace.summary.unknownRateCount} unknown rate
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Next-to-Expire Scrips</CardDescription>
            <CardTitle className="text-2xl">{workspace.summary.nextToExpireCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--muted-foreground)]">
            {workspace.validityRule?.confirmed
              ? `Rule confirmed: ${workspace.validityRule.months ?? 0} mo`
              : "Scrip validity period unconfirmed"}
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs (min 44px touch height) */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3" role="tablist">
        {(
          [
            { id: "comparison", label: `Comparison (${workspace.rows.length})`, icon: Calculator },
            {
              id: "scroll",
              label: `Scroll Import (${workspace.credits.length})`,
              icon: FileSpreadsheet,
            },
            { id: "scrips", label: `e-Scrips (${workspace.scrips.length})`, icon: CalendarClock },
            {
              id: "rates",
              label: `Rate Table (${workspace.rates.length})`,
              icon: BadgeIndianRupee,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: SB Comparison */}
      {activeTab === "comparison" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["all", "missing", "short", "ok", "unknown_rate", "not_claimed"] as const).map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "min-h-11 rounded-[var(--radius-md)] border px-3 text-xs font-medium",
                      statusFilter === status
                        ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--background)]"
                    )}
                  >
                    {status === "all" ? "All" : STATUS_BADGE[status].label}
                  </button>
                )
              )}
            </div>
            <Input
              type="search"
              placeholder="Search SB # or scheme..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full sm:w-64"
            />
          </div>

          {filteredRows.length === 0 ? (
            workspace.rows.length === 0 ? (
              <EmptyState
                icon={<Calculator className="h-7 w-7 text-accent" />}
                title="No incentive comparisons yet"
                description="ExportLeak calculates expected RoDTEP, RoSCTL, and Duty Drawback by cross-referencing your Shipping Bill HS codes against official government rate schedules."
                tips={[
                  "Upload Shipping Bill PDFs in Documents to extract claimed schemes and FOB values",
                  "Rates are calculated based on LEO (Let Export Order) date validity",
                  "Click 'Recalculate all' to run calculations across all eligible bills",
                ]}
                primaryAction={
                  <Button asChild variant="primary">
                    <Link href="/app/documents">Upload Shipping Bills</Link>
                  </Button>
                }
                secondaryAction={
                  <Button asChild variant="secondary">
                    <Link href="/tools/incentive-calculator">Open Web Calculator</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="filter"
                title="No incentive claims match filter"
                description={`No records found matching status '${statusFilter}'${searchQuery ? ` and query '${searchQuery}'` : ""}.`}
                primaryAction={
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      setStatusFilter("all");
                      setSearchQuery("");
                    }}
                  >
                    Reset filters & search
                  </Button>
                }
              />
            )
          ) : (
            <>
              {/* Mobile card layout (< md) */}
              <div className="space-y-3 md:hidden">
                {filteredRows.map((row) => {
                  const badge = STATUS_BADGE[row.status];
                  return (
                    <Card key={`${row.shippingBillId}:${row.scheme}`}>
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">{row.sbNumber}</div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {INCENTIVE_SCHEME_LABELS[row.scheme]} · LEO:{" "}
                              {row.leoDate ? <DateText date={row.leoDate} /> : "—"}
                            </div>
                          </div>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] p-2 hover:bg-[var(--muted)]"
                          >
                            <div className="text-[var(--muted-foreground)]">Expected</div>
                            <div className="font-semibold">
                              <MoneyText minorUnits={row.expectedMinor} currency="INR" />
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] p-2 hover:bg-[var(--muted)]"
                          >
                            <div className="text-[var(--muted-foreground)]">Credited</div>
                            <div className="font-semibold">
                              <MoneyText minorUnits={row.creditedMinor} currency="INR" />
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] p-2 hover:bg-[var(--muted)]"
                          >
                            <div className="text-[var(--muted-foreground)]">Gap</div>
                            <div className="font-semibold">
                              <MoneyText minorUnits={row.gapMinor} currency="INR" />
                            </div>
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Desktop table (>= md) */}
              <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-xs uppercase text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3">Shipping Bill</th>
                      <th className="px-4 py-3">Scheme</th>
                      <th className="px-4 py-3">Ref Date</th>
                      <th className="px-4 py-3 text-right">Expected (INR)</th>
                      <th className="px-4 py-3 text-right">Credited (INR)</th>
                      <th className="px-4 py-3 text-right">Gap (INR)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Formula</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredRows.map((row) => {
                      const badge = STATUS_BADGE[row.status];
                      return (
                        <tr
                          key={`${row.shippingBillId}:${row.scheme}`}
                          className="hover:bg-[var(--muted)]/30"
                        >
                          <td className="px-4 py-3 font-medium">
                            <div>{row.sbNumber}</div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {row.currency} FOB · SB <DateText date={row.sbDate} />
                            </div>
                          </td>
                          <td className="px-4 py-3">{INCENTIVE_SCHEME_LABELS[row.scheme]}</td>
                          <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                            {row.calcDetail?.referenceDate ? (
                              <>
                                <DateText date={row.calcDetail.referenceDate} />{" "}
                                <span className="opacity-75">
                                  ({row.calcDetail.referenceDateField})
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRow(row)}
                              className="inline-flex min-h-11 items-center font-semibold underline decoration-dotted underline-offset-4 hover:text-[var(--primary)]"
                            >
                              <MoneyText minorUnits={row.expectedMinor} currency="INR" />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRow(row)}
                              className="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-4 hover:text-[var(--primary)]"
                            >
                              <MoneyText minorUnits={row.creditedMinor} currency="INR" />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRow(row)}
                              className="inline-flex min-h-11 items-center font-medium underline decoration-dotted underline-offset-4 hover:text-[var(--primary)]"
                            >
                              <MoneyText minorUnits={row.gapMinor} currency="INR" />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setSelectedRow(row)}
                              className="min-h-11"
                            >
                              <Info className="mr-1.5 h-3.5 w-3.5" />
                              How calculated
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Tab 2: Scroll / Credits Importer */}
      {activeTab === "scroll" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Customs Scroll / Ledger Credits</CardTitle>
              <CardDescription>
                Upload a customs scroll CSV/XLSX (`sb_number`, `scheme`, `credited_amount`,
                `credited_on`, `scroll_number`). Invalid rows and unknown Shipping Bills are
                reported loudly before committing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canWrite ? (
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]">
                  <Upload className="h-4 w-4" />
                  <span>
                    {busyAction === "scroll-preview"
                      ? "Validating scroll file..."
                      : "Select scroll CSV / XLSX"}
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => void handleScrollFileChange(e)}
                    className="sr-only"
                    data-testid="scroll-file-input"
                  />
                </label>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Only members, admins, or owners can import scroll credits.
                </p>
              )}

              {scrollPreview ? (
                <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      Dry-run preview: {scrollPreview.validRows.length} valid row(s),{" "}
                      {scrollPreview.errors.length} error(s) out of {scrollPreview.totalDataRows}.
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setScrollPreview(null)}
                        className="min-h-11"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleCommitScroll()}
                        disabled={
                          scrollPreview.validRows.length === 0 || busyAction === "scroll-commit"
                        }
                        className="min-h-11"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {busyAction === "scroll-commit"
                          ? "Importing..."
                          : `Commit ${scrollPreview.validRows.length} credit row(s)`}
                      </Button>
                    </div>
                  </div>

                  {scrollPreview.errors.length > 0 ? (
                    <div className="space-y-1 rounded-[var(--radius-md)] border border-red-300 bg-red-50/70 p-3 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                      <div className="font-semibold">
                        Rejected / unmapped rows ({scrollPreview.errors.length}):
                      </div>
                      {scrollPreview.errors.map((err) => (
                        <div key={`${err.rowNumber}-${err.message}`}>
                          Row {err.rowNumber}
                          {err.sbNumber ? ` (${err.sbNumber})` : ""}: {err.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imported Scroll Credits ({workspace.credits.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {workspace.credits.length === 0 ? (
                <EmptyState
                  icon={<FileSpreadsheet className="h-7 w-7 text-accent" />}
                  title="No scroll credits imported yet"
                  description="Upload your ICEGATE customs scroll export above to compare actual government disbursements against expected export incentives and discover unpaid claims."
                  tips={[
                    "Accepted columns: SB No, SB Date, Scheme (RoDTEP/RoSCTL/Drawback), Scroll No, Scroll Date, Credited Amount",
                    "Disbursed amounts are matched 1-to-1 against parsed Shipping Bills",
                    "Flags short disbursements and delayed government scrolls automatically",
                  ]}
                  primaryAction={
                    canWrite ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => document.getElementById("scroll-file-input")?.click()}
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        <span>Select Scroll File (.csv / .xlsx)</span>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-2">
                  {workspace.credits.map((credit) => (
                    <div
                      key={credit.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm"
                    >
                      <div>
                        <span className="font-semibold">{credit.sbNumber}</span> ·{" "}
                        {INCENTIVE_SCHEME_LABELS[credit.scheme]}
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Scroll: {credit.scrollNumber || "—"} · Credited on:{" "}
                          {credit.creditedOn ? <DateText date={credit.creditedOn} /> : "—"}
                        </div>
                      </div>
                      <div className="font-semibold">
                        <MoneyText minorUnits={credit.creditedMinor} currency="INR" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Tab 3: e-Scrips Tracker */}
      {activeTab === "scrips" ? (
        <div className="space-y-4">
          {/* Compliance Rule Validity Status */}
          <Card>
            <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                {workspace.validityRule?.confirmed ? (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                )}
                <div className="text-sm">
                  <div className="font-semibold">
                    {workspace.validityRule?.confirmed
                      ? `Confirmed scrip validity rule: ${workspace.validityRule.months} month(s) from generation`
                      : "Scrip validity period unconfirmed — expiry dates are NOT assumed automatically"}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {workspace.validityRule?.sourceNote ||
                      "Until an admin confirms the notification validity in compliance_rules, enter individual scrip expiry dates manually."}
                  </div>
                </div>
              </div>
              {workspace.isPlatformAdmin ? (
                <form
                  onSubmit={(e) => void handleConfirmValidityRule(e)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    placeholder="Months"
                    value={validityMonthsInput}
                    onChange={(e) => setValidityMonthsInput(e.target.value)}
                    className="h-11 w-24"
                  />
                  <Input
                    type="text"
                    placeholder="Notification / source note"
                    value={validityNoteInput}
                    onChange={(e) => setValidityNoteInput(e.target.value)}
                    className="h-11 w-48"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busyAction === "validity-rule"}
                    className="min-h-11"
                  >
                    Confirm Rule
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {/* Add e-Scrip Form */}
          {canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Record e-Scrip</CardTitle>
                <CardDescription>
                  Track generated duty-credit scrips and surface expiring balances before lapse.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => void handleCreateScrip(e)}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <Input
                    required
                    placeholder="Scrip number (e.g. SCRP2026001)"
                    value={scripNumber}
                    onChange={(e) => setScripNumber(e.target.value)}
                    className="h-11"
                  />
                  <select
                    aria-label="Scrip scheme"
                    value={scripScheme}
                    onChange={(e) => setScripScheme(e.target.value as IncentiveScheme)}
                    className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                  >
                    {INCENTIVE_SCHEMES.map((s) => (
                      <option key={s} value={s}>
                        {INCENTIVE_SCHEME_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <Input
                    required
                    placeholder="Face value INR (e.g. 45000.00)"
                    value={scripFaceAmount}
                    onChange={(e) => setScripFaceAmount(e.target.value)}
                    className="h-11"
                  />
                  <Input
                    required
                    type="date"
                    aria-label="Generated date"
                    value={scripGeneratedOn}
                    onChange={(e) => setScripGeneratedOn(e.target.value)}
                    className="h-11"
                  />
                  <Input
                    type="date"
                    aria-label="Optional manual expiry date"
                    value={scripExpiresOn}
                    onChange={(e) => setScripExpiresOn(e.target.value)}
                    className="h-11"
                  />
                  <Input
                    placeholder="Notes (optional)"
                    value={scripNotes}
                    onChange={(e) => setScripNotes(e.target.value)}
                    className="h-11"
                  />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Button
                      type="submit"
                      disabled={busyAction === "create-scrip"}
                      className="min-h-11"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {busyAction === "create-scrip" ? "Saving..." : "Save e-Scrip"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {/* Next-to-expire Highlight */}
          {workspace.nextToExpireScrips.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Next to Expire</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {workspace.nextToExpireScrips.slice(0, 5).map((scrip) => (
                  <div
                    key={`exp-${scrip.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-amber-300/60 bg-amber-50/50 p-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/20"
                  >
                    <div>
                      <span className="font-semibold">{scrip.scripNumber}</span> ·{" "}
                      {INCENTIVE_SCHEME_LABELS[scrip.scheme]} ·{" "}
                      <MoneyText minorUnits={scrip.faceMinor} currency="INR" />
                    </div>
                    <Badge
                      variant={
                        scrip.daysToExpiry !== null && scrip.daysToExpiry <= 30
                          ? "danger"
                          : "warning"
                      }
                    >
                      Expires {scrip.expiresOn ? <DateText date={scrip.expiresOn} /> : "—"} (
                      {scrip.daysToExpiry ?? "?"}d)
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* All Scrips */}
          <Card>
            <CardHeader>
              <CardTitle>All Recorded Scrips ({workspace.scrips.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {workspace.scrips.length === 0 ? (
                <EmptyState
                  icon={<CalendarClock className="h-7 w-7 text-accent" />}
                  title="No duty credit scrips recorded"
                  description="Add your electronic duty credit scrips (RoDTEP / RoSCTL) issued by DGFT to monitor 1-year expiry deadlines and record customs utilisation or third-party transfer."
                  tips={[
                    "DGFT e-scrips expire exactly 1 year from the date of generation",
                    "ExportLeak triggers automated alerts 30 days before expiration to prevent forfeiture",
                    "Record transfers to buyers or utilisation against customs bills of entry",
                  ]}
                  primaryAction={
                    canWrite ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          const input = document.querySelector<HTMLInputElement>(
                            "input[placeholder*='e.g. 0510']"
                          );
                          input?.focus();
                        }}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        <span>Record first Scrip</span>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-2">
                  {workspace.scrips.map((scrip) => {
                    const badge = SCRIP_STATUS_BADGE[scrip.status];
                    return (
                      <div
                        key={scrip.id}
                        className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{scrip.scripNumber}</span>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            <Badge variant="neutral">{INCENTIVE_SCHEME_LABELS[scrip.scheme]}</Badge>
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            Face: <MoneyText minorUnits={scrip.faceMinor} currency="INR" /> ·
                            Generated: <DateText date={scrip.generatedOn} /> · Expires:{" "}
                            {scrip.expiresOn ? (
                              <DateText date={scrip.expiresOn} />
                            ) : (
                              "Unconfirmed (set manually or confirm rule)"
                            )}
                          </div>
                        </div>

                        {canWrite ? (
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Status for ${scrip.scripNumber}`}
                              value={scrip.status}
                              onChange={(e) =>
                                void handleUpdateScripStatus(
                                  scrip.id,
                                  e.target.value as ScripStatus
                                )
                              }
                              className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                            >
                              <option value="active">Active</option>
                              <option value="utilised">Utilised</option>
                              <option value="transferred">Transferred</option>
                              <option value="expired">Expired</option>
                            </select>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              aria-label={`Delete scrip ${scrip.scripNumber}`}
                              onClick={() => void handleDeleteScrip(scrip.id)}
                              className="h-11 w-11"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Tab 4: Effective-Dated Rates & Admin CSV Importer */}
      {activeTab === "rates" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Effective-Dated Incentive Rate Schedule</CardTitle>
              <CardDescription>
                Rates are never hard-coded in application logic. Only verified DGFT / CBIC
                notifications imported via CSV/XLSX populate this table.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {workspace.isPlatformAdmin ? (
                <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
                  <div className="text-sm font-medium">
                    Admin CSV / XLSX Rate Importer (`scheme, hs_code, rate_bps, cap_per_unit, uqc,
                    effective_from, effective_to, source_note`)
                  </div>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]">
                    <Upload className="h-4 w-4" />
                    <span>
                      {busyAction === "rate-preview"
                        ? "Validating rate CSV..."
                        : "Select rate CSV / XLSX"}
                    </span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => void handleRateFileChange(e)}
                      className="sr-only"
                      data-testid="rate-file-input"
                    />
                  </label>

                  {ratePreview ? (
                    <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          Dry-run: {ratePreview.validRows.length} valid, {ratePreview.errors.length}{" "}
                          rejected
                        </span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setRatePreview(null)}
                            className="min-h-11"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleCommitRates()}
                            disabled={
                              ratePreview.validRows.length === 0 || busyAction === "rate-commit"
                            }
                            className="min-h-11"
                          >
                            Import {ratePreview.validRows.length} rate row(s)
                          </Button>
                        </div>
                      </div>
                      {ratePreview.errors.length > 0 ? (
                        <div className="space-y-1 rounded-[var(--radius-md)] border border-red-300 bg-red-50/70 p-2 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                          {ratePreview.errors.map((err) => (
                            <div key={`${err.rowNumber}-${err.message}`}>
                              Row {err.rowNumber}: {err.message}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-xs text-[var(--muted-foreground)]">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>
                    Read-only view. Only platform admins can import or modify effective-dated
                    incentive rates.
                  </span>
                </div>
              )}

              {workspace.rates.length === 0 ? (
                <EmptyState
                  icon={<BadgeIndianRupee className="h-7 w-7 text-accent" />}
                  title="No incentive rates loaded"
                  description="Effective-dated DGFT RoDTEP, RoSCTL, or Drawback rates have not been populated for this environment yet."
                  tips={[
                    "DGFT rate schedules are effective-dated based on customs notification dates",
                    "Cap per unit and percentage rates apply to FOB values",
                    "Admins can upload official DGFT Appendix 4R / 4T schedule CSVs above",
                  ]}
                />
              ) : (
                <div className="space-y-2">
                  {workspace.rates.map((rate) => (
                    <div
                      key={rate.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm"
                    >
                      <div>
                        <span className="font-semibold">
                          {INCENTIVE_SCHEME_LABELS[rate.scheme]}
                        </span>{" "}
                        · HS <code>{rate.hsCode}</code> · {(rate.rateBps / 100).toFixed(2)}% (
                        {rate.rateBps} bps)
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Cap:{" "}
                          {rate.capPerUnitMinor !== null ? (
                            <>
                              <MoneyText minorUnits={rate.capPerUnitMinor} currency="INR" /> /{" "}
                              {rate.uqc ?? "UNIT"}
                            </>
                          ) : (
                            "No cap"
                          )}{" "}
                          · Effective <DateText date={rate.effectiveFrom} /> to{" "}
                          {rate.effectiveTo ? <DateText date={rate.effectiveTo} /> : "Open"}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {rate.sourceNote || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* "How we calculated this" Sheet */}
      <Sheet open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              How we calculated this · {selectedRow?.sbNumber} (
              {selectedRow ? INCENTIVE_SCHEME_LABELS[selectedRow.scheme] : ""})
            </SheetTitle>
            <SheetDescription>
              Transparent line-item rate, cap, reference date, and rounding breakdown.
            </SheetDescription>
          </SheetHeader>

          {selectedRow ? (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-center">
                <div>
                  <div className="text-xs text-[var(--muted-foreground)]">Expected</div>
                  <div className="font-semibold">
                    <MoneyText minorUnits={selectedRow.expectedMinor} currency="INR" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--muted-foreground)]">Credited</div>
                  <div className="font-semibold">
                    <MoneyText minorUnits={selectedRow.creditedMinor} currency="INR" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--muted-foreground)]">Gap</div>
                  <div className="font-semibold">
                    <MoneyText minorUnits={selectedRow.gapMinor} currency="INR" />
                  </div>
                </div>
              </div>

              {selectedRow.calcDetail ? (
                <>
                  <div className="space-y-1 rounded-[var(--radius-md)] bg-[var(--muted)]/50 p-3 text-xs">
                    <div>
                      <strong>Formula summary:</strong> {selectedRow.calcDetail.formulaSummary}
                    </div>
                    <div>
                      <strong>Reference date:</strong>{" "}
                      {selectedRow.calcDetail.referenceDate ?? "Missing"} (
                      {selectedRow.calcDetail.referenceDateField})
                    </div>
                    <div>
                      <strong>FX rate applied:</strong> {selectedRow.calcDetail.currency} -&gt; INR
                      @ {selectedRow.calcDetail.exchangeRateUsed ?? "missing"}
                    </div>
                    <div>
                      <strong>Rounding rule:</strong> {selectedRow.calcDetail.roundingPolicy} (sum
                      of rounded items equals bill total)
                    </div>
                  </div>

                  {selectedRow.calcDetail.warnings.length > 0 ? (
                    <div className="space-y-1 rounded-[var(--radius-md)] border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="font-semibold">Warnings &amp; notes</div>
                      {selectedRow.calcDetail.warnings.map((w, idx) => (
                        <div key={`${w.code}-${idx}`}>
                          [{w.code}] {w.message}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="font-semibold">
                      HS Line Items ({selectedRow.calcDetail.items.length})
                    </div>
                    {selectedRow.calcDetail.items.map((item) => (
                      <div
                        key={item.itemId}
                        className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            HS {item.hsCode} · {item.description}
                          </span>
                          <Badge variant={item.appliedLimb === "cap" ? "warning" : "primary"}>
                            {item.appliedLimb === "none" ? "No rate" : `${item.appliedLimb} limb`}
                          </Badge>
                        </div>
                        <div className="text-[var(--muted-foreground)]">
                          Qty: {item.quantity} {item.itemUqc} · FOB:{" "}
                          <MoneyText
                            minorUnits={item.itemFobMinor}
                            currency={item.itemFobCurrency}
                          />
                          {item.itemFobInrMinor !== null ? (
                            <>
                              {" "}
                              (INR <MoneyText minorUnits={item.itemFobInrMinor} currency="INR" />)
                            </>
                          ) : null}
                        </div>
                        <div className="font-mono text-[11px]">{item.formulaText}</div>
                        <div className="font-semibold">
                          Item Expected:{" "}
                          <MoneyText minorUnits={item.expectedMinor} currency="INR" />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-xs text-[var(--muted-foreground)]">
                  No persisted expectation snapshot yet. Click <strong>Recalculate</strong> to
                  compute and inspect line-by-line workings.
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
