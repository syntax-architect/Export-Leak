"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { EBRC_USER_CONFIRMATION_TEXT } from "@/config/ebrc";
import type { PlanLimitDetails } from "@/lib/auth/errors";
import type { MembershipRole } from "@/lib/database.types";
import type { EbrcWorkspaceData } from "@/lib/ebrc/repository";
import type { BulkEbrcRowInput, BulkEbrcValidationSummary } from "@/lib/ebrc/validator";
import { cn } from "@/lib/utils";

export interface EbrcWorkspaceProps {
  orgId: string;
  userRole: MembershipRole;
  initialData: EbrcWorkspaceData;
}

export function EbrcWorkspace({ orgId, userRole, initialData }: EbrcWorkspaceProps) {
  const { toast } = useToast();
  const canWrite = userRole !== "viewer";
  const isOrgAdmin = userRole === "owner" || userRole === "admin";

  const [data, setData] = React.useState<EbrcWorkspaceData>(initialData);
  const [rows, setRows] = React.useState<BulkEbrcRowInput[]>(initialData.rows);
  const [validation, setValidation] = React.useState<BulkEbrcValidationSummary>(
    initialData.validation
  );

  const [selectedIecId, setSelectedIecId] = React.useState<string>(
    initialData.selectedIecId ?? "all"
  );
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");
  const [selectedIrmIds, setSelectedIrmIds] = React.useState<string[]>([]);

  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [autoFixing, setAutoFixing] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [upgradePrompt, setUpgradePrompt] = React.useState<PlanLimitDetails | null>(null);

  const loadPreview = React.useCallback(
    async (overrides?: { iecId?: string; from?: string; to?: string; irmIds?: string[] }) => {
      const targetIec = overrides?.iecId ?? selectedIecId;
      const targetFrom = overrides?.from ?? dateFrom;
      const targetTo = overrides?.to ?? dateTo;
      const targetIrms = overrides?.irmIds ?? selectedIrmIds;

      const params = new URLSearchParams();
      if (targetIec && targetIec !== "all") params.set("iecId", targetIec);
      if (targetFrom) params.set("dateFrom", targetFrom);
      if (targetTo) params.set("dateTo", targetTo);
      for (const id of targetIrms) {
        params.append("irmId", id);
      }

      setLoadingPreview(true);
      try {
        const res = await fetch(`/api/orgs/${orgId}/ebrc?${params.toString()}`);
        const json = (await res.json()) as EbrcWorkspaceData & { error?: { message?: string } };
        if (!res.ok) {
          toast({
            title: "Could not refresh eBRC preview",
            description: json.error?.message,
            variant: "danger",
          });
          return;
        }
        setData(json);
        setRows(json.rows);
        setValidation(json.validation);
      } finally {
        setLoadingPreview(false);
      }
    },
    [dateFrom, dateTo, orgId, selectedIecId, selectedIrmIds, toast]
  );

  function updateRowField(rowIndex: number, field: keyof BulkEbrcRowInput, value: string) {
    setRows((prev) =>
      prev.map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row))
    );
  }

  function toggleIrmSelection(irmId: string) {
    setSelectedIrmIds((prev) =>
      prev.includes(irmId) ? prev.filter((id) => id !== irmId) : [...prev, irmId]
    );
  }

  async function runServerValidation(applyAutoFix: boolean) {
    if (!canWrite) return;
    if (applyAutoFix) {
      setAutoFixing(true);
    } else {
      setValidating(true);
    }

    try {
      const res = await fetch(`/api/orgs/${orgId}/ebrc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: applyAutoFix ? "autofix" : "validate",
          iecId: selectedIecId !== "all" ? selectedIecId : null,
          rows,
        }),
      });
      const json = (await res.json()) as {
        rows?: BulkEbrcRowInput[];
        fixesApplied?: number;
        validation?: BulkEbrcValidationSummary;
        error?: { message?: string };
      };
      if (!res.ok || !json.validation) {
        toast({
          title: "Validation failed",
          description: json.error?.message ?? "Please review the rows and try again.",
          variant: "danger",
        });
        return;
      }

      if (json.rows) setRows(json.rows);
      setValidation(json.validation);

      if (applyAutoFix) {
        toast({
          title:
            (json.fixesApplied ?? 0) > 0
              ? `Auto-fixed ${json.fixesApplied} formatting issue(s)`
              : "No safe auto-fixes needed",
          description: json.validation.valid
            ? "All rows now pass DGFT validation checks."
            : `${json.validation.errorRowsCount} row(s) still need manual review.`,
          variant: json.validation.valid ? "success" : "warning",
        });
      } else {
        toast({
          title: json.validation.valid
            ? "All rows passed validation"
            : `${json.validation.errorRowsCount} row(s) have errors`,
          variant: json.validation.valid ? "success" : "warning",
        });
      }
    } finally {
      setAutoFixing(false);
      setValidating(false);
    }
  }

  async function handleConfirmDownload() {
    if (!canWrite) return;
    if (!data.canGenerateEbrc) {
      setConfirmOpen(false);
      setUpgradePrompt({
        limitKey: "canGenerateEbrc",
        currentUsage: 1,
        limit: 0,
        currentPlanKey: data.planKey,
        recommendedPlanKey: "exporter_monthly",
      });
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/ebrc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          iecId: selectedIecId !== "all" ? selectedIecId : null,
          rows,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as {
          error?: { code?: string; message?: string; details?: PlanLimitDetails };
        };
        if (res.status === 402 && errJson.error?.details) {
          setConfirmOpen(false);
          setUpgradePrompt(errJson.error.details);
          return;
        }
        toast({
          title: "Could not generate eBRC file",
          description: errJson.error?.message ?? "Fix remaining validation errors and retry.",
          variant: "danger",
        });
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? "dgft-bulk-ebrc.xlsx";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setConfirmOpen(false);
      toast({
        title: "Bulk eBRC Excel downloaded",
        description: EBRC_USER_CONFIRMATION_TEXT,
        variant: "success",
      });
    } finally {
      setGenerating(false);
    }
  }

  const currencyEntries = Object.entries(validation.totalAmountByCurrency);

  return (
    <div className="space-y-6" data-testid="ebrc-workspace-root">
      {/* Header + Template Version Stamp */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Bulk eBRC Excel Generator
            </h1>
            <Badge variant="neutral" data-testid="ebrc-template-version">
              Template {data.templateVersion}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Build DGFT-ready Bulk Generate eBRC spreadsheets directly from confirmed IRM matches.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.canGenerateEbrc ? "success" : "warning"}>
            {data.planDisplayName}
            {data.canGenerateEbrc ? " • Export enabled" : " • Validation only"}
          </Badge>
        </div>
      </div>

      {/* Admin quarterly verification banner */}
      {isOrgAdmin ? (
        <div
          className="flex flex-wrap items-start gap-3 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft/40 p-3.5 text-sm text-text"
          data-testid="ebrc-quarterly-banner"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-0.5 text-xs">
            <p className="font-semibold">
              Quarterly DGFT Template Check (Verified on{" "}
              <DateText date={data.templateLastVerifiedOn} />)
            </p>
            <p className="text-text-muted">
              Admins should re-check the live sample Excel under DGFT Portal → Services → eBRC →
              Bulk Generate eBRC every quarter before uploading large batches.
            </p>
          </div>
        </div>
      ) : null}

      {/* Free Plan Gate Callout */}
      {!data.canGenerateEbrc ? (
        <Card className="border-accent/40 bg-accent-soft/20" data-testid="ebrc-free-gate-banner">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 sm:pt-5">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <div className="space-y-1 text-xs">
                <p className="text-sm font-semibold text-text">
                  Free plan: preview, inline edits, and full rule validation included
                </p>
                <p className="text-text-muted">
                  Upgrade to the Exporter or Consultant plan (or upload your first real document to
                  start your 7-day no-card Pro trial) to download the generated Bulk eBRC `.xlsx`
                  file.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="min-h-11"
              onClick={() =>
                setUpgradePrompt({
                  limitKey: "canGenerateEbrc",
                  currentUsage: 1,
                  limit: 0,
                  currentPlanKey: data.planKey,
                  recommendedPlanKey: "exporter_monthly",
                })
              }
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Upgrade to generate</span>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-muted">Matched Rows</p>
            <p className="mt-1 text-2xl font-bold text-text">{validation.totalRows}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-muted">Ready for DGFT</p>
            <p className="mt-1 text-2xl font-bold text-success">
              {Math.max(0, validation.totalRows - validation.errorRowsCount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-muted">Rows Needing Fix</p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold",
                validation.errorRowsCount > 0 ? "text-danger" : "text-success"
              )}
              data-testid="ebrc-error-row-count"
            >
              {validation.errorRowsCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-muted">Total FCC Allocated</p>
            <div className="mt-1 space-y-0.5 text-sm font-bold text-text">
              {currencyEntries.length === 0 ? (
                <span>—</span>
              ) : (
                currencyEntries.map(([curr, minor]) => (
                  <div key={curr}>
                    <MoneyText minorUnits={minor} currency={curr} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Matches by IEC, IRM, or Date Range</CardTitle>
          <CardDescription>
            Every export stays strictly isolated to the chosen IEC profile and organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">
                IEC Profile
              </label>
              <Select
                value={selectedIecId}
                onValueChange={(val) => {
                  setSelectedIecId(val);
                  setSelectedIrmIds([]);
                  void loadPreview({ iecId: val, irmIds: [] });
                }}
              >
                <SelectTrigger aria-label="Filter by IEC Profile" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All org IECs (strictly single-IEC verified)</SelectItem>
                  {data.iecs.map((iec) => (
                    <SelectItem key={iec.id} value={iec.id}>
                      {iec.iecCode} — {iec.legalName}
                      {iec.isDemo ? " (DEMO)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              type="date"
              label="IRM Date From"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              type="date"
              label="IRM Date To"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />

            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full"
                loading={loadingPreview}
                onClick={() => void loadPreview()}
                data-testid="ebrc-refresh-btn"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Load preview</span>
              </Button>
            </div>
          </div>

          {data.irms.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-text-muted">
                Optional: filter specific IRMs ({selectedIrmIds.length} selected)
              </p>
              <div className="flex flex-wrap gap-2">
                {data.irms.slice(0, 12).map((irm) => {
                  const active = selectedIrmIds.includes(irm.id);
                  return (
                    <button
                      key={irm.id}
                      type="button"
                      onClick={() => toggleIrmSelection(irm.id)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? "border-accent bg-accent-soft text-accent-soft-fg"
                          : "border-border bg-surface text-text hover:bg-surface-muted"
                      )}
                    >
                      <span>{irm.irmNumber}</span>
                      <span className="text-text-muted">({irm.currency})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={rows.length === 0 || autoFixing}
                loading={autoFixing}
                onClick={() => void runServerValidation(true)}
                data-testid="ebrc-autofix-btn"
              >
                <Wrench className="h-4 w-4" aria-hidden="true" />
                <span>
                  Auto-fix safe issues
                  {validation.autoFixableCount > 0 ? ` (${validation.autoFixableCount})` : ""}
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={rows.length === 0 || validating}
                loading={validating}
                onClick={() => void runServerValidation(false)}
                data-testid="ebrc-validate-btn"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Validate rows</span>
              </Button>
            </>
          ) : null}
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          className="min-h-11"
          disabled={!canWrite || rows.length === 0 || !validation.valid}
          onClick={() => {
            if (!data.canGenerateEbrc) {
              setUpgradePrompt({
                limitKey: "canGenerateEbrc",
                currentUsage: 1,
                limit: 0,
                currentPlanKey: data.planKey,
                recommendedPlanKey: "exporter_monthly",
              });
              return;
            }
            setConfirmOpen(true);
          }}
          data-testid="ebrc-generate-btn"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Generate Bulk eBRC Excel</span>
        </Button>
      </div>

      {/* Validation Error Summary */}
      {validation.errors.length > 0 ? (
        <Card className="border-danger/30 bg-danger-soft/20" data-testid="ebrc-validation-summary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-danger">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <span>{validation.errors.length} validation issue(s) to resolve</span>
            </CardTitle>
            <CardDescription>
              Fix the highlighted fields inline below or use Auto-fix for date/formatting fixes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs">
              {validation.errors.slice(0, 12).map((err, idx) => (
                <li
                  key={`${err.rowIndex}-${err.field}-${err.code}-${idx}`}
                  className="rounded-[var(--radius-sm)] border border-danger/20 bg-surface p-2.5"
                >
                  <p className="font-semibold text-text">
                    {err.rowNumber > 0 ? `Row ${err.rowNumber}: ` : ""}
                    {err.message}
                  </p>
                  <p className="mt-0.5 text-text-muted">Fix: {err.fixHint}</p>
                </li>
              ))}
              {validation.errors.length > 12 ? (
                <li className="text-text-muted">
                  + {validation.errors.length - 12} more errors shown on individual rows below.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : rows.length > 0 ? (
        <div
          className="flex items-center gap-2 rounded-[var(--radius-card)] border border-success/30 bg-success-soft/30 p-3.5 text-sm text-text"
          data-testid="ebrc-validation-passed-banner"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            All {rows.length} row(s) pass DGFT schema and clubbing rules. Ready for final check.
          </span>
        </div>
      ) : null}

      {/* Preview Rows or Empty State */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="No confirmed matches in this selection"
          description="Confirm IRM–Shipping Bill matches first on IRM & Matching, or widen your date/IEC filter."
          action={
            <Button asChild variant="primary">
              <Link href="/app/matches">Review IRM matches</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop Editable Preview Table */}
          <Card className="hidden md:block" data-testid="ebrc-preview-table">
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/40 text-text-muted">
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Branch</th>
                    <th className="p-2.5">IFSC Code</th>
                    <th className="p-2.5">AD Code</th>
                    <th className="p-2.5">IRM Number</th>
                    <th className="p-2.5">IRM Date</th>
                    <th className="p-2.5">Currency</th>
                    <th className="p-2.5">Purpose</th>
                    <th className="p-2.5">Amount (FCC)</th>
                    <th className="p-2.5">Port</th>
                    <th className="p-2.5">SB #</th>
                    <th className="p-2.5">SB Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const rowErrors = validation.rowErrorsByIndex[idx] ?? [];
                    const hasError = rowErrors.length > 0;
                    return (
                      <React.Fragment key={row.rowId ?? `row-${idx}`}>
                        <tr
                          className={cn(
                            "border-b border-border-subtle",
                            hasError && "bg-danger-soft/20"
                          )}
                        >
                          <td className="p-2 font-mono font-semibold">{row.serialNumber}</td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} Branch`}
                              value={row.iecBranchSlNo}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "iecBranchSlNo", e.target.value)}
                              className="min-h-10 w-12 rounded border border-border bg-surface px-2 py-1 font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} IFSC Code`}
                              value={row.ifscCode}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "ifscCode", e.target.value)}
                              placeholder="HDFC0000240"
                              className="min-h-10 w-28 rounded border border-border bg-surface px-2 py-1 font-mono uppercase"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} AD Code`}
                              value={row.adCode}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "adCode", e.target.value)}
                              placeholder="0510002"
                              className="min-h-10 w-24 rounded border border-border bg-surface px-2 py-1 font-mono uppercase"
                            />
                          </td>
                          <td className="p-2 font-mono text-text">{row.irmNumber}</td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} IRM Date`}
                              value={row.irmDate}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "irmDate", e.target.value)}
                              placeholder="DD/MM/YYYY"
                              className="min-h-10 w-28 rounded border border-border bg-surface px-2 py-1 font-mono"
                            />
                          </td>
                          <td className="p-2 font-mono font-semibold">{row.irmCurrency}</td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} Purpose Code`}
                              value={row.purposeCode}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "purposeCode", e.target.value)}
                              placeholder="P0102"
                              className="min-h-10 w-20 rounded border border-border bg-surface px-2 py-1 font-mono uppercase"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} Amount`}
                              value={row.amountInFcc}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "amountInFcc", e.target.value)}
                              className="min-h-10 w-28 rounded border border-border bg-surface px-2 py-1 text-right font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} Port Code`}
                              value={row.portCode}
                              disabled={!canWrite}
                              onChange={(e) => updateRowField(idx, "portCode", e.target.value)}
                              className="min-h-10 w-22 rounded border border-border bg-surface px-2 py-1 font-mono uppercase"
                            />
                          </td>
                          <td className="p-2 font-mono">{row.shippingBillNumber}</td>
                          <td className="p-2">
                            <input
                              aria-label={`Row ${idx + 1} SB Date`}
                              value={row.shippingBillDate}
                              disabled={!canWrite}
                              onChange={(e) =>
                                updateRowField(idx, "shippingBillDate", e.target.value)
                              }
                              placeholder="DD/MM/YYYY"
                              className="min-h-10 w-28 rounded border border-border bg-surface px-2 py-1 font-mono"
                            />
                          </td>
                        </tr>
                        {hasError ? (
                          <tr className="border-b border-danger/20 bg-danger-soft/30">
                            <td colSpan={12} className="px-3 py-1.5 text-xs text-danger">
                              {rowErrors.map((e) => `${e.message} (${e.fixHint})`).join(" • ")}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Mobile 360px Editable Cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden" data-testid="ebrc-preview-cards">
            {rows.map((row, idx) => {
              const rowErrors = validation.rowErrorsByIndex[idx] ?? [];
              const hasError = rowErrors.length > 0;
              return (
                <Card
                  key={row.rowId ?? `mobile-row-${idx}`}
                  className={cn(hasError && "border-danger/40")}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-text">
                          #{row.serialNumber} • SB {row.shippingBillNumber}
                        </p>
                        <p className="font-mono text-xs text-text-muted">
                          IRM {row.irmNumber} • {row.irmCurrency}
                        </p>
                      </div>
                      <Badge variant={hasError ? "danger" : "success"}>
                        {hasError ? `${rowErrors.length} fix` : "Valid"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <Input
                        label="IFSC Code"
                        value={row.ifscCode}
                        disabled={!canWrite}
                        onChange={(e) => updateRowField(idx, "ifscCode", e.target.value)}
                      />
                      <Input
                        label="AD Code"
                        value={row.adCode}
                        disabled={!canWrite}
                        onChange={(e) => updateRowField(idx, "adCode", e.target.value)}
                      />
                      <Input
                        label="Purpose Code"
                        value={row.purposeCode}
                        disabled={!canWrite}
                        onChange={(e) => updateRowField(idx, "purposeCode", e.target.value)}
                      />
                      <Input
                        label="Port Code"
                        value={row.portCode}
                        disabled={!canWrite}
                        onChange={(e) => updateRowField(idx, "portCode", e.target.value)}
                      />
                      <Input
                        label="IRM Date (DD/MM/YYYY)"
                        value={row.irmDate}
                        disabled={!canWrite}
                        onChange={(e) => updateRowField(idx, "irmDate", e.target.value)}
                      />
                      <Input
                        label="Amount (FCC)"
                        value={row.amountInFcc}
                        disabled={!canWrite}
                        onChange={(e) => updateRowField(idx, "amountInFcc", e.target.value)}
                      />
                    </div>

                    {hasError ? (
                      <div className="rounded-[var(--radius-sm)] bg-danger-soft/40 p-2.5 text-xs text-danger">
                        {rowErrors.map((e, i) => (
                          <p key={`${e.code}-${i}`}>
                            • {e.message} ({e.fixHint})
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Pre-download Final Self-Submission Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="ebrc-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
              <span>Ready to generate Bulk eBRC Excel</span>
            </DialogTitle>
            <DialogDescription>{EBRC_USER_CONFIRMATION_TEXT}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/40 p-3 text-xs text-text-muted">
            <p>
              <strong className="text-text">Rows included:</strong> {rows.length}
            </p>
            <p>
              <strong className="text-text">Template version:</strong> {data.templateVersion}
            </p>
            <p>
              We never ask for your DSC token or DGFT login password. Upload the downloaded file
              yourself under <strong>DGFT → Services → eBRC → Bulk Generate eBRC</strong>.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={generating}
              loadingText="Generating Excel..."
              onClick={() => void handleConfirmDownload()}
              data-testid="ebrc-confirm-download-btn"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Confirm &amp; download .xlsx</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Dialog for Free Plan Gating */}
      <Dialog
        open={Boolean(upgradePrompt)}
        onOpenChange={(open) => !open && setUpgradePrompt(null)}
      >
        <DialogContent data-testid="ebrc-upgrade-dialog">
          <DialogHeader>
            <DialogTitle>Upgrade required to generate Bulk eBRC</DialogTitle>
            <DialogDescription>
              Free plan includes full row preview, editing, and validation. Generating the DGFT
              `.xlsx` upload file requires a 7-day Pro Trial, Exporter, or Consultant plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setUpgradePrompt(null)}>
              Continue validating
            </Button>
            <Button asChild variant="primary">
              <Link href="/app/documents">Upload first file for free 7-day trial</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
