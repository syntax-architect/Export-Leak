"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Lock,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { useToast } from "@/components/ui/toast";
import type { IecWithAlertCount } from "@/lib/auth/repository";
import type { MembershipRole } from "@/lib/database.types";
import type { DocumentListEntry } from "@/lib/documents/repository";
import type {
  IrmImportCommitResult,
  ReconciliationWorkspaceData,
  WorkspaceRemittanceRow,
  WorkspaceShippingBillRow,
} from "@/lib/matching/irm-repository";
import {
  IRM_CANONICAL_FIELDS,
  type IrmCanonicalField,
  type IrmColumnMapping,
  type IrmImportPreview,
  type MatchCandidate,
} from "@/lib/matching/types";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<IrmCanonicalField, string> = {
  irmNumber: "IRM number *",
  bankName: "Bank *",
  remittanceDate: "Remittance date *",
  currency: "Currency *",
  amount: "Amount *",
  utilisedAmount: "Utilised amount",
  remitterName: "Buyer / Remitter name",
  invoiceReference: "Invoice reference",
  adCode: "AD code",
};

const HIGH_CONFIDENCE_BULK_THRESHOLD = 0.8;

function formatMinorInputDecimal(minorUnits: number): string {
  const abs = Math.abs(Math.trunc(minorUnits));
  const major = Math.trunc(abs / 100);
  const cents = abs % 100;
  return cents === 0 ? String(major) : `${major}.${String(cents).padStart(2, "0")}`;
}

export interface IrmMatchingWorkspaceProps {
  orgId: string;
  userRole: MembershipRole;
  iecs: readonly IecWithAlertCount[];
  activeIecId: string | null;
  irmDocuments: readonly DocumentListEntry[];
  initialDocId?: string | null;
  initialWorkspace: ReconciliationWorkspaceData;
}

export function IrmMatchingWorkspace({
  orgId,
  userRole,
  iecs,
  activeIecId,
  irmDocuments,
  initialDocId = null,
  initialWorkspace,
}: IrmMatchingWorkspaceProps) {
  const { toast } = useToast();
  const canWrite = userRole === "member" || userRole === "admin" || userRole === "owner";

  const [workspace, setWorkspace] = React.useState<ReconciliationWorkspaceData>(initialWorkspace);
  const [selectedIecId, setSelectedIecId] = React.useState<string>(
    activeIecId ?? iecs[0]?.id ?? ""
  );
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [selectedDocId, setSelectedDocId] = React.useState<string>(initialDocId ?? "");
  const [preview, setPreview] = React.useState<IrmImportPreview | null>(null);
  const [columnMapping, setColumnMapping] = React.useState<IrmColumnMapping | null>(null);
  const [lastCommitResult, setLastCommitResult] = React.useState<IrmImportCommitResult | null>(
    null
  );
  const [importError, setImportError] = React.useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [isCommitting, setIsCommitting] = React.useState(false);
  const [isBusyAction, setIsBusyAction] = React.useState(false);

  const [selectedSbId, setSelectedSbId] = React.useState<string | null>(
    () =>
      initialWorkspace.shippingBills.find((sb) => sb.remainingMinor > 0)?.id ??
      initialWorkspace.shippingBills[0]?.id ??
      null
  );

  // Per-remittance custom decimal allocation amounts keyed by `${sbId}:${remId}`
  const [customAllocations, setCustomAllocations] = React.useState<Record<string, string>>({});

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const refreshWorkspace = React.useCallback(async () => {
    const query = workspace.iecId ? `?iecId=${encodeURIComponent(workspace.iecId)}` : "";
    const res = await fetch(`/api/orgs/${orgId}/matches${query}`, { cache: "no-store" });
    const data = (await res.json()) as ReconciliationWorkspaceData & {
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message ?? "Could not reload reconciliation workspace.");
    }
    setWorkspace(data);
    setSelectedSbId((prev) => {
      if (prev && data.shippingBills.some((b) => b.id === prev)) {
        return prev;
      }
      return (
        data.shippingBills.find((sb) => sb.remainingMinor > 0)?.id ??
        data.shippingBills[0]?.id ??
        null
      );
    });
  }, [orgId, workspace.iecId]);

  const requestPreview = React.useCallback(
    async (opts: {
      file?: File | null;
      docId?: string;
      overrideMapping?: IrmColumnMapping | null;
    }) => {
      setImportError(null);
      setIsPreviewLoading(true);
      try {
        let res: Response;
        if (opts.file) {
          const fd = new FormData();
          fd.set("action", "preview");
          if (selectedIecId) fd.set("iecId", selectedIecId);
          if (opts.overrideMapping) fd.set("columnMapping", JSON.stringify(opts.overrideMapping));
          fd.set("file", opts.file);
          res = await fetch(`/api/orgs/${orgId}/irm/import`, { method: "POST", body: fd });
        } else if (opts.docId) {
          res = await fetch(`/api/orgs/${orgId}/irm/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "preview",
              docId: opts.docId,
              iecId: selectedIecId || undefined,
              columnMapping: opts.overrideMapping ?? undefined,
            }),
          });
        } else {
          setIsPreviewLoading(false);
          return;
        }

        const payload = (await res.json()) as {
          preview?: IrmImportPreview;
          error?: { message?: string };
        };
        if (!res.ok || !payload.preview) {
          throw new Error(payload.error?.message ?? "Failed to inspect IRM spreadsheet.");
        }
        setPreview(payload.preview);
        setColumnMapping(payload.preview.suggestedMapping);
        setLastCommitResult(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not preview IRM file.";
        setImportError(message);
        setPreview(null);
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [orgId, selectedIecId]
  );

  // Auto-load preview when user navigates via "Import IRM" on Documents (?docId=...)
  const autoLoadedDocRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (initialDocId && autoLoadedDocRef.current !== initialDocId) {
      autoLoadedDocRef.current = initialDocId;
      void requestPreview({ docId: initialDocId });
    }
  }, [initialDocId, requestPreview]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setSelectedFile(file);
    setSelectedDocId("");
    await requestPreview({ file, overrideMapping: null });
  }

  async function handleConfirmImport() {
    if (!preview || !canWrite) return;
    setImportError(null);
    setIsCommitting(true);
    try {
      let res: Response;
      if (selectedFile) {
        const fd = new FormData();
        fd.set("action", "commit");
        if (selectedIecId) fd.set("iecId", selectedIecId);
        if (columnMapping) fd.set("columnMapping", JSON.stringify(columnMapping));
        fd.set("file", selectedFile);
        res = await fetch(`/api/orgs/${orgId}/irm/import`, { method: "POST", body: fd });
      } else if (selectedDocId) {
        res = await fetch(`/api/orgs/${orgId}/irm/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "commit",
            docId: selectedDocId,
            iecId: selectedIecId || undefined,
            columnMapping: columnMapping ?? undefined,
          }),
        });
      } else {
        throw new Error("Select a file or uploaded IRM document first.");
      }

      const payload = (await res.json()) as {
        result?: IrmImportCommitResult;
        error?: { message?: string };
      };
      if (!res.ok || !payload.result) {
        throw new Error(payload.error?.message ?? "IRM import failed.");
      }

      setLastCommitResult(payload.result);
      toast({
        title: "IRM import completed",
        description: `${payload.result.importedCount + payload.result.updatedCount} IRM row(s) saved, ${payload.result.autoConfirmedCount} auto-matched.`,
        variant: payload.result.failedCount > 0 ? "warning" : "success",
      });
      await refreshWorkspace();
    } catch (err) {
      const message = err instanceof Error ? err.message : "IRM import failed.";
      setImportError(message);
      toast({ title: "Import failed", description: message, variant: "danger" });
    } finally {
      setIsCommitting(false);
    }
  }

  async function runMatchPost(body: Record<string, unknown>, successTitle: string) {
    setIsBusyAction(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        autoConfirmedCount?: number;
        confirmedCount?: number;
      };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Match action failed.");
      }
      toast({ title: successTitle, variant: "success" });
      await refreshWorkspace();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Match action failed.";
      toast({ title: "Action failed", description: message, variant: "danger" });
    } finally {
      setIsBusyAction(false);
    }
  }

  async function handleUnmatch(matchId: string) {
    setIsBusyAction(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/matches/${matchId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Could not unmatch link.");
      }
      toast({ title: "Match removed and balances restored", variant: "success" });
      await refreshWorkspace();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not unmatch link.";
      toast({ title: "Unmatch failed", description: message, variant: "danger" });
    } finally {
      setIsBusyAction(false);
    }
  }

  // Review suggestions are candidates not already auto-confirmed or settled
  const openShippingBills = React.useMemo(
    () =>
      workspace.shippingBills.filter(
        (sb) =>
          sb.remainingMinor > 0 || sb.status === "partially_matched" || !sb.calculationEligible
      ),
    [workspace.shippingBills]
  );

  const selectedSb: WorkspaceShippingBillRow | null = React.useMemo(
    () =>
      workspace.shippingBills.find((sb) => sb.id === selectedSbId) ??
      openShippingBills[0] ??
      workspace.shippingBills[0] ??
      null,
    [workspace.shippingBills, openShippingBills, selectedSbId]
  );

  const suggestionsBySb = React.useMemo(() => {
    const map = new Map<string, MatchCandidate[]>();
    for (const s of workspace.suggestions) {
      const list = map.get(s.shippingBillId) ?? [];
      list.push(s);
      map.set(s.shippingBillId, list);
    }
    return map;
  }, [workspace.suggestions]);

  const selectedSbSuggestions = React.useMemo(
    () => (selectedSb ? (suggestionsBySb.get(selectedSb.id) ?? []) : []),
    [selectedSb, suggestionsBySb]
  );

  // Rule 4: candidate manual remittances STRICTLY share the selected SB's currency
  const sameCurrencyOpenRemittances = React.useMemo(() => {
    if (!selectedSb) return [];
    return workspace.remittances.filter(
      (r) => r.currency === selectedSb.currency && r.remainingMinor > 0
    );
  }, [selectedSb, workspace.remittances]);

  const hiddenOtherCurrencies = React.useMemo(() => {
    if (!selectedSb) return [];
    const set = new Set<string>();
    for (const r of workspace.remittances) {
      if (r.remainingMinor > 0 && r.currency !== selectedSb.currency) {
        set.add(r.currency);
      }
    }
    return [...set].sort();
  }, [selectedSb, workspace.remittances]);

  // High-confidence candidates eligible for non-conflicting bulk accept
  const bulkAcceptablePairs = React.useMemo(() => {
    const sbRemLeft = new Map<string, number>();
    for (const sb of workspace.shippingBills) {
      if (sb.calculationEligible && sb.remainingMinor > 0) {
        sbRemLeft.set(sb.id, sb.remainingMinor);
      }
    }
    const irmRemLeft = new Map<string, number>();
    for (const r of workspace.remittances) {
      if (r.remainingMinor > 0) irmRemLeft.set(r.id, r.remainingMinor);
    }
    const chosen: Array<{
      shippingBillId: string;
      remittanceId: string;
      allocatedMinor: number;
      method: "manual";
      confidence: number;
      explanation: string;
    }> = [];

    for (const s of workspace.suggestions) {
      if (s.confidence < HIGH_CONFIDENCE_BULK_THRESHOLD) continue;
      if (s.signals.invoiceAmbiguous) continue;
      const sbLeft = sbRemLeft.get(s.shippingBillId) ?? 0;
      const irmLeft = irmRemLeft.get(s.remittanceId) ?? 0;
      const alloc = Math.min(s.proposedMinor, sbLeft, irmLeft);
      if (alloc <= 0) continue;
      chosen.push({
        shippingBillId: s.shippingBillId,
        remittanceId: s.remittanceId,
        allocatedMinor: alloc,
        method: "manual",
        confidence: s.confidence,
        explanation: s.explanation,
      });
      sbRemLeft.set(s.shippingBillId, sbLeft - alloc);
      irmRemLeft.set(s.remittanceId, irmLeft - alloc);
    }
    return chosen;
  }, [workspace.suggestions, workspace.shippingBills, workspace.remittances]);

  const remittanceColumns: DataTableColumn<WorkspaceRemittanceRow>[] = [
    {
      id: "irmNumber",
      header: "IRM Number",
      cell: (row) => (
        <div className="space-y-0.5">
          <p className="font-semibold text-text">{row.irmNumber}</p>
          <p className="text-xs text-text-muted">{row.bankName}</p>
        </div>
      ),
    },
    {
      id: "remitter",
      header: "Remitter & Invoice Ref",
      cell: (row) => (
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium text-text">{row.remitterName || "—"}</p>
          <p className="text-xs text-text-muted">{row.invoiceReference || "No invoice ref"}</p>
        </div>
      ),
    },
    {
      id: "date",
      header: "Remittance Date",
      cell: (row) => <DateText date={row.remittanceDate} />,
    },
    {
      id: "amount",
      header: "IRM Amount",
      align: "right",
      cell: (row) => (
        <span className="font-semibold text-text">
          <MoneyText minorUnits={row.amountMinor} currency={row.currency} />
        </span>
      ),
    },
    {
      id: "remaining",
      header: "Available Balance",
      align: "right",
      cell: (row) => (
        <Badge variant={row.remainingMinor === 0 ? "success" : "accent"}>
          <MoneyText minorUnits={row.remainingMinor} currency={row.currency} />
        </Badge>
      ),
    },
  ];

  const existingMatchedPairsSet = React.useMemo(
    () => new Set(workspace.confirmedMatches.map((m) => `${m.shippingBillId}:${m.remittanceId}`)),
    [workspace.confirmedMatches]
  );

  return (
    <div className="min-w-0 space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            IRM Import &amp; Matching
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Import bank or DGFT EDPMS remittance sheets, verify column mappings, and reconcile
            Shipping Bills with explainable same-currency matching.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isBusyAction}
              onClick={() =>
                void runMatchPost(
                  { action: "auto_match", iecId: workspace.iecId ?? undefined },
                  "Auto-match run complete"
                )
              }
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Run auto-match</span>
            </Button>
            {bulkAcceptablePairs.length > 0 ? (
              <Button
                type="button"
                variant="primary"
                disabled={isBusyAction}
                data-testid="bulk-accept-button"
                onClick={() =>
                  void runMatchPost(
                    { action: "bulk_confirm", pairs: bulkAcceptablePairs },
                    `Confirmed ${bulkAcceptablePairs.length} high-confidence match(es)`
                  )
                }
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Bulk accept &gt;= 80% ({bulkAcceptablePairs.length})</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* KPI / Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-text-muted">Open Shipping Bills</p>
            <p className="mt-1 text-xl font-semibold text-text">
              {workspace.shippingBills.filter((sb) => sb.remainingMinor > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-text-muted">Open Remittances</p>
            <p className="mt-1 text-xl font-semibold text-text">
              {workspace.remittances.filter((r) => r.remainingMinor > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-text-muted">Needs Review</p>
            <p className="mt-1 text-xl font-semibold text-accent">{workspace.suggestions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-text-muted">Confirmed Links</p>
            <p className="mt-1 text-xl font-semibold text-success-soft-fg">
              {workspace.confirmedMatches.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IRM Import Card with Column Mapping Preview */}
      {canWrite ? (
        <Card data-testid="irm-import-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden="true" />
              <span>Import IRM Excel / CSV Statement</span>
            </CardTitle>
            <CardDescription>
              Automatically skips bank preamble banners, lets you verify detected columns before
              saving, and keeps failed rows visible with exact reasons.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="irm-target-iec" className="text-xs font-medium text-text-muted">
                  Target IEC Profile
                </label>
                <select
                  id="irm-target-iec"
                  value={selectedIecId}
                  onChange={(e) => setSelectedIecId(e.target.value)}
                  className="min-h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-text"
                >
                  {iecs.map((iec) => (
                    <option key={iec.id} value={iec.id}>
                      {iec.iecCode} — {iec.legalName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="irm-existing-doc" className="text-xs font-medium text-text-muted">
                  Or load uploaded IRM document
                </label>
                <select
                  id="irm-existing-doc"
                  value={selectedDocId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedDocId(id);
                    setSelectedFile(null);
                    if (id) {
                      void requestPreview({ docId: id, overrideMapping: null });
                    }
                  }}
                  className="min-h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-text"
                >
                  <option value="">Choose from Document Vault...</option>
                  {irmDocuments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  data-testid="irm-file-input"
                  className="sr-only"
                  onChange={(e) => void handleFileChange(e)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPreviewLoading}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="irm-choose-file-button"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isPreviewLoading
                      ? "Reading spreadsheet..."
                      : selectedFile
                        ? selectedFile.name
                        : "Upload .xlsx / .csv"}
                  </span>
                </Button>
              </div>
            </div>

            {importError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft p-3 text-sm text-danger-soft-fg"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{importError}</span>
              </div>
            ) : null}

            {/* User-visible Column Mapping Preview BEFORE Commit */}
            {preview && columnMapping ? (
              <div
                data-testid="irm-mapping-preview"
                className="space-y-4 rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text">
                      Column Mapping Preview — {preview.filename}
                    </p>
                    <p className="text-xs text-text-muted">
                      Sheet &ldquo;{preview.sheetName}&rdquo; • Header row {preview.headerRowNumber}{" "}
                      • {preview.validCount} valid / {preview.failedCount} failed out of{" "}
                      {preview.totalDataRows} row(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isPreviewLoading}
                      onClick={() =>
                        void requestPreview({
                          file: selectedFile,
                          docId: selectedDocId || undefined,
                          overrideMapping: columnMapping,
                        })
                      }
                    >
                      Refresh preview
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isCommitting || preview.validCount === 0}
                      data-testid="confirm-irm-import-button"
                      onClick={() => void handleConfirmImport()}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {isCommitting ? "Importing..." : `Confirm & Import (${preview.validCount})`}
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Mapping Selectors */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {IRM_CANONICAL_FIELDS.map((field) => (
                    <div key={field} className="space-y-1">
                      <label
                        htmlFor={`map-${field}`}
                        className="text-xs font-medium text-text-muted"
                      >
                        {FIELD_LABELS[field]}
                      </label>
                      <select
                        id={`map-${field}`}
                        value={columnMapping[field] ?? ""}
                        onChange={(e) => {
                          const nextVal = e.target.value || null;
                          setColumnMapping((prev) => (prev ? { ...prev, [field]: nextVal } : prev));
                        }}
                        className="min-h-11 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-sm text-text"
                      >
                        <option value="">Not mapped</option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Failed Rows Warning */}
                {preview.failedRows.length > 0 ? (
                  <div
                    data-testid="irm-preview-errors"
                    className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft p-3 text-xs text-warning-soft-fg"
                  >
                    <p className="font-semibold">
                      {preview.failedRows.length} row(s) will be skipped with errors:
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {preview.failedRows.slice(0, 6).map((err) => (
                        <li key={`${err.rowNumber}-${err.irmNumber ?? "row"}`}>
                          Row {err.rowNumber}
                          {err.irmNumber ? ` (${err.irmNumber})` : ""}: {err.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Normalized Preview Table */}
                {preview.previewRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="border-b border-border-subtle bg-surface-muted/70 text-text-muted">
                        <tr>
                          <th className="px-3 py-2">IRM #</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Bank &amp; Remitter</th>
                          <th className="px-3 py-2">Invoice Ref</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {preview.previewRows.slice(0, 8).map((row) => (
                          <tr key={`${row.rowNumber}-${row.irmNumber}`}>
                            <td className="px-3 py-2 font-medium text-text">{row.irmNumber}</td>
                            <td className="px-3 py-2">
                              <DateText date={row.remittanceDate} />
                            </td>
                            <td className="px-3 py-2">
                              {row.bankName}
                              {row.remitterName ? ` • ${row.remitterName}` : ""}
                            </td>
                            <td className="px-3 py-2">{row.invoiceReference || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <MoneyText minorUnits={row.amountMinor} currency={row.currency} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Import Batch Result Banner */}
            {lastCommitResult ? (
              <div
                data-testid="irm-commit-summary"
                className="rounded-[var(--radius-sm)] border border-success/30 bg-success-soft p-3 text-sm text-success-soft-fg"
              >
                <p className="font-semibold">
                  Import saved: {lastCommitResult.importedCount} new IRM(s),{" "}
                  {lastCommitResult.updatedCount} updated, {lastCommitResult.autoConfirmedCount}{" "}
                  auto-confirmed match(es), {lastCommitResult.reviewNeededCount} queued for Review
                  Matches.
                </p>
                {lastCommitResult.failedCount > 0 ? (
                  <p className="mt-1 text-xs">
                    {lastCommitResult.failedCount} row(s) failed:{" "}
                    {lastCommitResult.failedRows
                      .slice(0, 4)
                      .map((r) => `Row ${r.rowNumber}: ${r.reason}`)
                      .join(" | ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Review Matches Split View (Left: Unmatched/Partial SBs, Right: Candidate Payments) */}
      <Card data-testid="review-matches-section">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>Review Matches</span>
              </CardTitle>
              <CardDescription>
                High-confidence unambiguous matches auto-confirm on import. Review split payments,
                duplicate invoices, or manually allocate partial IRMs below.
              </CardDescription>
            </div>
            {selectedSb && hiddenOtherCurrencies.length > 0 ? (
              <Badge variant="neutral" className="gap-1">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {selectedSb.currency} only ({hiddenOtherCurrencies.join(", ")} locked)
                </span>
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {workspace.shippingBills.length === 0 ? (
            <EmptyState
              icon={<ArrowLeftRight className="h-6 w-6" aria-hidden="true" />}
              title="No Shipping Bills available to match"
              description="Upload and confirm at least one Shipping Bill PDF first, then import your IRM Excel/CSV statement."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Left Column: Unmatched & Partially Matched Shipping Bills */}
              <div className="space-y-2 lg:col-span-5" data-testid="sb-match-list">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Shipping Bills ({openShippingBills.length} open / {workspace.shippingBills.length}{" "}
                  total)
                </p>
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {workspace.shippingBills.map((sb) => {
                    const isSelected = selectedSb?.id === sb.id;
                    const sugCount = suggestionsBySb.get(sb.id)?.length ?? 0;
                    return (
                      <button
                        key={sb.id}
                        type="button"
                        onClick={() => setSelectedSbId(sb.id)}
                        data-testid={`sb-select-${sb.sbNumber}`}
                        className={cn(
                          "min-h-11 w-full rounded-[var(--radius-sm)] border p-3 text-left transition-colors",
                          isSelected
                            ? "border-accent bg-accent-soft/40"
                            : "border-border-subtle bg-surface hover:bg-surface-muted/50"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-text">#{sb.sbNumber}</span>
                          <div className="flex items-center gap-1.5">
                            {sugCount > 0 ? (
                              <Badge variant="accent">{sugCount} suggestion(s)</Badge>
                            ) : null}
                            <Badge
                              variant={
                                sb.status === "matched"
                                  ? "success"
                                  : sb.status === "needs_review"
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {sb.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-1 truncate text-xs text-text-muted">
                          {sb.buyerName || "Buyer missing"} • Inv: {sb.invoiceNo || "—"} •{" "}
                          <DateText date={sb.sbDate} />
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-text-muted">
                            FOB: <MoneyText minorUnits={sb.fobMinor} currency={sb.currency} />
                          </span>
                          <span className="font-semibold text-text">
                            Remaining:{" "}
                            <MoneyText minorUnits={sb.remainingMinor} currency={sb.currency} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Candidate Payments & Manual Allocation */}
              <div className="space-y-4 lg:col-span-7" data-testid="candidate-payments-pane">
                {selectedSb ? (
                  <>
                    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-text">
                            Selected: SB #{selectedSb.sbNumber} ({selectedSb.currency})
                          </p>
                          <p className="text-xs text-text-muted">
                            {selectedSb.buyerName || "Unknown buyer"} • Invoice{" "}
                            {selectedSb.invoiceNo || "—"}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-text-muted">Open balance</p>
                          <p className="text-sm font-semibold text-text">
                            <MoneyText
                              minorUnits={selectedSb.remainingMinor}
                              currency={selectedSb.currency}
                            />
                          </p>
                        </div>
                      </div>

                      {!selectedSb.calculationEligible ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-soft-fg">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            Field review required on Shipping Bill before payments can be matched.
                          </span>
                        </p>
                      ) : null}

                      {hiddenOtherCurrencies.length > 0 ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            Rule 4 active: Showing {selectedSb.currency} payments only.{" "}
                            {hiddenOtherCurrencies.join(", ")} IRMs cannot be clubbed with a{" "}
                            {selectedSb.currency} bill.
                          </span>
                        </p>
                      ) : null}
                    </div>

                    {/* Engine Suggestions for this SB */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Suggested Candidate Payments ({selectedSbSuggestions.length})
                      </p>
                      {selectedSbSuggestions.length === 0 ? (
                        <p className="rounded-[var(--radius-sm)] border border-dashed border-border-subtle p-3 text-xs text-text-muted">
                          No automatic suggestions pending for #{selectedSb.sbNumber}. Use manual
                          allocation below if matching partial installments.
                        </p>
                      ) : (
                        selectedSbSuggestions.map((cand) => {
                          const rem = workspace.remittances.find((r) => r.id === cand.remittanceId);
                          const pct = Math.round(cand.confidence * 100);
                          return (
                            <div
                              key={`${cand.shippingBillId}:${cand.remittanceId}`}
                              data-testid={`suggestion-${cand.remittanceId}`}
                              className="space-y-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-text">
                                    {cand.irmNumber}
                                    {rem ? ` • ${rem.bankName}` : ""}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    Proposed:{" "}
                                    <MoneyText
                                      minorUnits={cand.proposedMinor}
                                      currency={cand.currency}
                                    />
                                    {rem ? (
                                      <>
                                        {" "}
                                        • Remitter: {rem.remitterName || "—"} • Date:{" "}
                                        <DateText date={rem.remittanceDate} />
                                      </>
                                    ) : null}
                                  </p>
                                </div>
                                <Badge variant={pct >= 85 ? "success" : "warning"}>
                                  {pct}% confidence
                                </Badge>
                              </div>

                              <p className="text-xs text-text">{cand.explanation}</p>

                              {canWrite ? (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="primary"
                                    disabled={isBusyAction || !selectedSb.calculationEligible}
                                    data-testid={`accept-suggestion-${cand.irmNumber}`}
                                    onClick={() =>
                                      void runMatchPost(
                                        {
                                          action: "confirm",
                                          pair: {
                                            shippingBillId: cand.shippingBillId,
                                            remittanceId: cand.remittanceId,
                                            allocatedMinor: cand.proposedMinor,
                                            method: "manual",
                                            confidence: cand.confidence,
                                            explanation: cand.explanation,
                                          },
                                        },
                                        `Matched #${cand.sbNumber} to ${cand.irmNumber}`
                                      )
                                    }
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                    <span>Accept</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={isBusyAction}
                                    data-testid={`reject-suggestion-${cand.irmNumber}`}
                                    onClick={() =>
                                      void runMatchPost(
                                        {
                                          action: "reject",
                                          shippingBillId: cand.shippingBillId,
                                          remittanceId: cand.remittanceId,
                                          reason: "Rejected by user in Review Matches",
                                        },
                                        `Dismissed ${cand.irmNumber} suggestion`
                                      )
                                    }
                                  >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                    <span>Reject</span>
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Manual Same-Currency Allocation Section */}
                    {canWrite && selectedSb.remainingMinor > 0 && selectedSb.calculationEligible ? (
                      <div className="space-y-2 border-t border-border-subtle pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Manual Same-Currency Link ({selectedSb.currency})
                        </p>
                        {sameCurrencyOpenRemittances.length === 0 ? (
                          <p className="text-xs text-text-muted">
                            No open {selectedSb.currency} IRM balance available.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {sameCurrencyOpenRemittances.map((rem) => {
                              const key = `${selectedSb.id}:${rem.id}`;
                              const defaultMinor = Math.min(
                                selectedSb.remainingMinor,
                                rem.remainingMinor
                              );
                              const inputVal =
                                customAllocations[key] ?? formatMinorInputDecimal(defaultMinor);
                              const alreadyLinked = existingMatchedPairsSet.has(key);

                              return (
                                <div
                                  key={rem.id}
                                  className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-text">
                                      {rem.irmNumber} • {rem.bankName}
                                    </p>
                                    <p className="text-xs text-text-muted">
                                      Available:{" "}
                                      <MoneyText
                                        minorUnits={rem.remainingMinor}
                                        currency={rem.currency}
                                      />{" "}
                                      • Inv: {rem.invoiceReference || "—"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      aria-label={`Allocation amount for ${rem.irmNumber}`}
                                      value={inputVal}
                                      onChange={(e) =>
                                        setCustomAllocations((prev) => ({
                                          ...prev,
                                          [key]: e.target.value,
                                        }))
                                      }
                                      className="w-28 text-right font-mono text-sm"
                                      disabled={alreadyLinked || isBusyAction}
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={alreadyLinked || isBusyAction}
                                      data-testid={`manual-link-${rem.irmNumber}`}
                                      onClick={() =>
                                        void runMatchPost(
                                          {
                                            action: "confirm",
                                            pair: {
                                              shippingBillId: selectedSb.id,
                                              remittanceId: rem.id,
                                              allocatedAmount: inputVal,
                                              method: "manual",
                                              confidence: 1,
                                              explanation: `Manual link of ${inputVal} ${selectedSb.currency} between #${selectedSb.sbNumber} and ${rem.irmNumber}.`,
                                            },
                                          },
                                          `Linked ${rem.irmNumber} to #${selectedSb.sbNumber}`
                                        )
                                      }
                                    >
                                      <Link2 className="h-4 w-4" aria-hidden="true" />
                                      <span>{alreadyLinked ? "Linked" : "Link"}</span>
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmed Matches (Always Unmatchable) */}
      <Card data-testid="confirmed-matches-section">
        <CardHeader>
          <CardTitle className="text-base">
            Confirmed Matches ({workspace.confirmedMatches.length})
          </CardTitle>
          <CardDescription>
            Confirmed links update Shipping Bill and IRM balances. You can unmatch any link at any
            time with full audit history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspace.confirmedMatches.length === 0 ? (
            <p className="text-sm text-text-muted">No confirmed SB-to-IRM matches yet.</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {workspace.confirmedMatches.map((m) => (
                <div
                  key={m.id}
                  data-testid={`confirmed-match-${m.sbNumber}-${m.irmNumber}`}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text">
                        SB #{m.sbNumber} &harr; {m.irmNumber}
                      </span>
                      <Badge variant={m.method === "auto" ? "success" : "accent"}>
                        {m.method === "auto" ? "Auto-matched" : "Manual"} •{" "}
                        {Math.round(m.confidence * 100)}%
                      </Badge>
                      <span className="text-sm font-semibold text-text">
                        <MoneyText minorUnits={m.matchedMinor} currency={m.currency} />
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">{m.explanation}</p>
                  </div>
                  {canWrite ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusyAction}
                      data-testid={`unmatch-${m.sbNumber}-${m.irmNumber}`}
                      onClick={() => void handleUnmatch(m.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>Unmatch</span>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Imported IRMs Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Imported Remittances ({workspace.remittances.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={workspace.remittances}
            columns={remittanceColumns}
            keyExtractor={(r) => r.id}
            caption="Imported Inward Remittance Messages"
            mobileTitle={(r) => (
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-text">{r.irmNumber}</span>
                <MoneyText minorUnits={r.amountMinor} currency={r.currency} />
              </div>
            )}
            mobileSubtitle={(r) => (
              <p className="text-xs text-text-muted">
                {r.bankName} • <DateText date={r.remittanceDate} />
              </p>
            )}
            emptyState={
              <EmptyState
                icon={<FileSpreadsheet className="h-6 w-6" aria-hidden="true" />}
                title="No IRMs imported yet"
                description="Upload a bank or DGFT EDPMS IRM file above to begin reconciliation."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
