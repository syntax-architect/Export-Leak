"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Download,
  FileCheck2,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { UpgradePlanDialog } from "@/components/billing/upgrade-plan-dialog";
import { UsageMeterCard } from "@/components/billing/usage-meter-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { IecWithAlertCount } from "@/lib/auth/repository";
import type { PlanLimitDetails } from "@/lib/auth/errors";
import type { OrgUsageSummary } from "@/lib/billing/entitlements";
import type { DocumentKind, DocumentParseStatus, MembershipRole } from "@/lib/database.types";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  CANONICAL_MIME_BY_EXTENSION,
  computeSha256HexClient,
  encodeHeaderBase64,
  formatFileSize,
  getDocumentExtension,
  MAX_BATCH_FILES,
  MAX_DOCUMENT_BYTES,
  validateMagicBytes,
} from "@/lib/documents/file-security";
import type { DocumentBatchSummary } from "@/lib/documents/parse-repository";
import type { DocumentListEntry, PreparedUploadResultItem } from "@/lib/documents/repository";
import { cn } from "@/lib/utils";

export interface DocumentsManagerProps {
  orgId: string;
  role: MembershipRole;
  iecs: readonly IecWithAlertCount[];
  initialIecId: string;
  initialDocuments: readonly DocumentListEntry[];
  initialUsage: OrgUsageSummary;
  initialBatchSummary?: DocumentBatchSummary;
  initialAiParsingEnabled?: boolean;
}

type QueueStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "parsing"
  | "needs_review"
  | "done"
  | "failed"
  | "duplicate";

interface UploadQueueItem {
  localId: string;
  file: File;
  iecId: string;
  kind: DocumentKind;
  originalName: string;
  sizeBytes: number;
  sha256?: string;
  headerBase64?: string;
  progress: number;
  status: QueueStatus;
  message?: string;
  docId?: string;
  storagePath?: string;
  signedUrl?: string;
  mimeType?: string;
}

const KIND_LABELS: Record<DocumentKind, string> = {
  shipping_bill: "Shipping Bill",
  irm_export: "Bank IRM",
  scroll: "Customs Scroll",
  other: "Other",
};

const PARSE_STATUS_BADGE: Record<
  DocumentParseStatus | QueueStatus,
  { label: string; variant: "neutral" | "accent" | "success" | "warning" | "danger" }
> = {
  queued: { label: "Queued", variant: "neutral" },
  uploading: { label: "Uploading", variant: "accent" },
  uploaded: { label: "Uploaded", variant: "accent" },
  parsing: { label: "Parsing", variant: "accent" },
  needs_review: { label: "Needs review", variant: "warning" },
  done: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  duplicate: { label: "Already uploaded", variant: "warning" },
};

const CONCURRENT_UPLOADS = 3;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function uploadFileViaXhr(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage upload failed (HTTP ${xhr.status}).`));
      }
    };

    xhr.onerror = () => reject(new Error("Network interruption during upload."));
    xhr.onabort = () => reject(new Error("Upload was aborted."));
    xhr.send(file);
  });
}

function subscribeHydration() {
  return () => {};
}

export function DocumentsManager({
  orgId,
  role,
  iecs,
  initialIecId,
  initialDocuments,
  initialUsage,
  initialBatchSummary,
  initialAiParsingEnabled = true,
}: DocumentsManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const isHydrated = React.useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );

  const canWrite = role !== "viewer";
  const isOrgAdmin = role === "owner" || role === "admin";
  const selectableIecs = React.useMemo(() => {
    const nonDemo = iecs.filter((i) => !i.isDemo);
    return nonDemo.length > 0 ? nonDemo : iecs;
  }, [iecs]);

  const [selectedIecId, setSelectedIecId] = React.useState(
    initialIecId || selectableIecs[0]?.id || ""
  );
  const [selectedKind, setSelectedKind] = React.useState<DocumentKind>("shipping_bill");
  const [isDragging, setIsDragging] = React.useState(false);

  const [documents, setDocuments] = React.useState<DocumentListEntry[]>([...initialDocuments]);
  const [usage, setUsage] = React.useState<OrgUsageSummary>(initialUsage);
  const [batchSummary, setBatchSummary] = React.useState<DocumentBatchSummary>(
    initialBatchSummary ?? {
      totalShippingBills: 0,
      parsedCount: 0,
      needsReviewCount: 0,
      failedCount: 0,
      queuedCount: 0,
      latestNeedsReviewSbId: null,
    }
  );
  const [aiParsingEnabled, setAiParsingEnabled] = React.useState(initialAiParsingEnabled);
  const [isSavingAiSetting, setIsSavingAiSetting] = React.useState(false);
  const [isTriggeringParse, setIsTriggeringParse] = React.useState(false);
  const [queue, setQueue] = React.useState<UploadQueueItem[]>([]);
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const [upgradePrompt, setUpgradePrompt] = React.useState<PlanLimitDetails | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<"all" | DocumentKind>("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | DocumentParseStatus>("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const fetchFilteredDocuments = React.useCallback(async () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    try {
      const res = await fetch(`/api/orgs/${orgId}/documents?${params.toString()}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        documents?: DocumentListEntry[];
        usage?: OrgUsageSummary;
        batchSummary?: DocumentBatchSummary;
      };
      if (body.documents) setDocuments(body.documents);
      if (body.usage) setUsage(body.usage);
      if (body.batchSummary) setBatchSummary(body.batchSummary);
    } catch {
      // Transient polling errors do not disrupt active uploads
    }
  }, [orgId, searchQuery, kindFilter, statusFilter, dateFrom, dateTo]);

  const triggerParsePending = React.useCallback(
    async (limit = 10) => {
      if (!canWrite) return;
      setIsTriggeringParse(true);
      try {
        const res = await fetch(`/api/orgs/${orgId}/documents/parse-pending?limit=${limit}`, {
          method: "POST",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { summary?: DocumentBatchSummary };
        if (body.summary) {
          setBatchSummary(body.summary);
        }
        await fetchFilteredDocuments();
      } catch {
        // Silent background retry via scheduled poll
      } finally {
        setIsTriggeringParse(false);
      }
    },
    [canWrite, orgId, fetchFilteredDocuments]
  );

  async function handleToggleAiParsing() {
    if (!isOrgAdmin || isSavingAiSetting) return;
    setIsSavingAiSetting(true);
    const nextValue = !aiParsingEnabled;
    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiParsingEnabled: nextValue }),
      });
      if (!res.ok) {
        toast({ title: "Could not update AI fallback setting", variant: "danger" });
        return;
      }
      setAiParsingEnabled(nextValue);
      toast({
        title: nextValue ? "AI fallback enabled" : "AI fallback disabled",
        description: nextValue
          ? "Uncertain Shipping Bill fields will use capped AI extraction before review."
          : "All uncertain Shipping Bill fields will go directly to manual review.",
        variant: "success",
      });
    } finally {
      setIsSavingAiSetting(false);
    }
  }

  // Refetch when filter controls change
  React.useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFilteredDocuments();
    }, 120);
    return () => clearTimeout(timer);
  }, [fetchFilteredDocuments]);

  // Live 3-second polling while any document is queued or parsing
  const hasActiveParsing = documents.some(
    (d) => d.parseStatus === "queued" || d.parseStatus === "parsing"
  );

  React.useEffect(() => {
    if (!hasActiveParsing) return;
    const interval = setInterval(() => {
      void fetchFilteredDocuments();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasActiveParsing, fetchFilteredDocuments]);

  function updateQueueItem(localId: string, patch: Partial<UploadQueueItem>) {
    setQueue((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
    );
  }

  async function processSinglePreparedUpload(
    item: UploadQueueItem,
    prepared: PreparedUploadResultItem
  ): Promise<boolean> {
    if (prepared.status === "duplicate") {
      updateQueueItem(item.localId, {
        status: "duplicate",
        progress: 100,
        message: "Already uploaded",
      });
      return false;
    }

    if (prepared.status === "rejected" || !prepared.signedUrl || !prepared.docId) {
      updateQueueItem(item.localId, {
        status: "failed",
        progress: 0,
        message: prepared.message ?? "Rejected by server file validation.",
      });
      return false;
    }

    const mimeType =
      prepared.mimeType ||
      CANONICAL_MIME_BY_EXTENSION[getDocumentExtension(item.originalName) ?? "pdf"];

    try {
      updateQueueItem(item.localId, {
        status: "uploading",
        progress: 10,
        docId: prepared.docId,
        storagePath: prepared.storagePath,
        signedUrl: prepared.signedUrl,
        mimeType,
        message: undefined,
      });

      await uploadFileViaXhr(prepared.signedUrl, item.file, mimeType, (pct) => {
        updateQueueItem(item.localId, { progress: pct });
      });

      updateQueueItem(item.localId, {
        status: "uploaded",
        progress: 100,
      });

      const commitRes = await fetch(`/api/orgs/${orgId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: prepared.docId,
          iecId: item.iecId,
          kind: item.kind,
          originalName: item.originalName,
          sha256: item.sha256,
          storagePath: prepared.storagePath,
          fileSizeBytes: item.sizeBytes,
          mimeType,
        }),
      });

      const commitBody = (await commitRes.json()) as {
        duplicate?: boolean;
        message?: string;
        trialStarted?: boolean;
        document?: DocumentListEntry;
        error?: { code?: string; message?: string; details?: PlanLimitDetails };
      };

      if (commitRes.status === 402 && commitBody.error?.details) {
        setUpgradePrompt(commitBody.error.details);
        updateQueueItem(item.localId, {
          status: "failed",
          progress: 0,
          message: commitBody.error.message ?? "Plan limit reached.",
        });
        return false;
      }

      if (!commitRes.ok) {
        updateQueueItem(item.localId, {
          status: "failed",
          progress: 0,
          message: commitBody.error?.message ?? "Server validation failed.",
        });
        return false;
      }

      if (commitBody.duplicate) {
        updateQueueItem(item.localId, {
          status: "duplicate",
          progress: 100,
          message: "Already uploaded",
        });
        return false;
      }

      updateQueueItem(item.localId, {
        status: "queued",
        progress: 100,
        message: "Queued for parsing",
      });

      const uploadedDoc = commitBody.document;
      if (uploadedDoc) {
        setDocuments((prev) =>
          prev.some((d) => d.id === uploadedDoc.id) ? prev : [uploadedDoc, ...prev]
        );
      }

      if (commitBody.trialStarted) {
        toast({
          title: "7-day Pro trial activated!",
          description: "Your first file was uploaded and your card-free Pro trial is now active.",
          variant: "success",
        });
      }

      return true;
    } catch (err) {
      updateQueueItem(item.localId, {
        status: "failed",
        progress: 0,
        message: err instanceof Error ? err.message : "Upload failed.",
      });
      return false;
    }
  }

  async function runPreparedBatch(
    items: UploadQueueItem[],
    preparedMap: Map<string, PreparedUploadResultItem>
  ) {
    let index = 0;
    let uploadedAny = false;

    async function worker() {
      while (index < items.length) {
        const current = items[index++];
        if (!current) break;
        const prepared = preparedMap.get(current.localId);
        if (!prepared) continue;
        const didUpload = await processSinglePreparedUpload(current, prepared);
        if (didUpload) {
          uploadedAny = true;
        }
      }
    }

    const workerCount = Math.min(CONCURRENT_UPLOADS, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (uploadedAny) {
      await fetchFilteredDocuments();
      router.refresh();
      if (items.some((item) => item.kind === "shipping_bill")) {
        void triggerParsePending(10);
      }
    }
  }

  async function handleFilesSelected(fileList: FileList | File[]) {
    if (!canWrite) return;
    if (!selectedIecId) {
      setBatchError("Add an IEC profile first before uploading documents.");
      return;
    }

    setBatchError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (files.length > MAX_BATCH_FILES) {
      setBatchError(
        `You selected ${files.length} files. Please upload at most ${MAX_BATCH_FILES} files per batch.`
      );
      return;
    }

    const initialItems: UploadQueueItem[] = files.map((file) => ({
      localId: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      iecId: selectedIecId,
      kind: selectedKind,
      originalName: file.name,
      sizeBytes: file.size,
      progress: 0,
      status: "queued",
      message: "Checking file safety...",
    }));

    setQueue((prev) => [...initialItems, ...prev].slice(0, 100));

    const validForServer: UploadQueueItem[] = [];
    for (const item of initialItems) {
      const ext = getDocumentExtension(item.file.name);
      if (!ext) {
        updateQueueItem(item.localId, {
          status: "failed",
          message: `Unsupported file type. Allowed: ${ALLOWED_DOCUMENT_EXTENSIONS.join(", ").toUpperCase()}.`,
        });
        continue;
      }

      if (item.file.size <= 0 || item.file.size > MAX_DOCUMENT_BYTES) {
        updateQueueItem(item.localId, {
          status: "failed",
          message: `File must be between 1 byte and ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`,
        });
        continue;
      }

      const headerSlice = item.file.slice(0, 512);
      const headerBytes = new Uint8Array(await headerSlice.arrayBuffer());
      const magic = validateMagicBytes(headerBytes, ext);
      if (!magic.valid) {
        updateQueueItem(item.localId, {
          status: "failed",
          message: magic.reason ?? "Invalid file signature.",
        });
        continue;
      }

      const sha256 = await computeSha256HexClient(item.file);
      const headerBase64 = encodeHeaderBase64(headerBytes);
      const enriched: UploadQueueItem = {
        ...item,
        sha256,
        headerBase64,
      };
      updateQueueItem(item.localId, { sha256, headerBase64, message: "Checking duplicates..." });
      validForServer.push(enriched);

      // Keep mobile UI completely responsive during 50-file batches
      await yieldToMainThread();
    }

    if (validForServer.length === 0) return;

    try {
      const prepRes = await fetch(`/api/orgs/${orgId}/documents/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: validForServer.map((item) => ({
            iecId: item.iecId,
            kind: item.kind,
            originalName: item.originalName,
            sha256: item.sha256,
            fileSizeBytes: item.sizeBytes,
            mimeType: item.file.type || undefined,
            headerBase64: item.headerBase64,
          })),
        }),
      });

      const prepBody = (await prepRes.json()) as {
        results?: PreparedUploadResultItem[];
        usage?: OrgUsageSummary;
        error?: { code?: string; message?: string; details?: PlanLimitDetails };
      };

      if (prepRes.status === 402 && prepBody.error?.details) {
        setUpgradePrompt(prepBody.error.details);
        for (const item of validForServer) {
          updateQueueItem(item.localId, {
            status: "failed",
            message: "Monthly allowance exceeded — upgrade plan to continue.",
          });
        }
        return;
      }

      if (!prepRes.ok || !prepBody.results) {
        const errMsg = prepBody.error?.message ?? "Upload preparation failed.";
        setBatchError(errMsg);
        for (const item of validForServer) {
          updateQueueItem(item.localId, {
            status: "failed",
            message: errMsg,
          });
        }
        return;
      }

      if (prepBody.usage) {
        setUsage(prepBody.usage);
      }

      const preparedMap = new Map<string, PreparedUploadResultItem>();
      validForServer.forEach((item, idx) => {
        const resItem = prepBody.results![idx];
        if (resItem) {
          preparedMap.set(item.localId, resItem);
        }
      });

      await runPreparedBatch(validForServer, preparedMap);
    } catch {
      setBatchError("Network error while preparing uploads.");
    }
  }

  async function handleRetryQueueItem(item: UploadQueueItem) {
    await handleFilesSelected([item.file]);
    setQueue((prev) => prev.filter((q) => q.localId !== item.localId));
  }

  async function handleRetryPersistedDoc(docId: string) {
    if (!canWrite) return;
    try {
      const res = await fetch(`/api/orgs/${orgId}/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      if (!res.ok) {
        setBatchError("Could not retry document parsing.");
        return;
      }
      toast({ title: "Document re-queued for parsing", variant: "success" });
      await fetchFilteredDocuments();
    } catch {
      setBatchError("Network error while retrying parse.");
    }
  }

  async function handleDelete(docId: string) {
    if (!canWrite) return;
    setBatchError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/documents/${docId}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setBatchError(body.error?.message ?? "Could not delete document.");
        return;
      }
      toast({
        title: "Document deleted",
        description: "Soft-deleted files are permanently purged after 30 days.",
        variant: "success",
      });
      await fetchFilteredDocuments();
      router.refresh();
    } catch {
      setBatchError("Network error while deleting document.");
    }
  }

  const effectiveLimit = usage.trialEligibleForAutoStart ? 50 : usage.shippingBillsLimit;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Documents</h1>
          <p className="mt-1 text-sm text-text-muted">
            Upload Shipping Bill PDFs, bank IRM sheets, and customs scrolls securely.
          </p>
        </div>

        <UsageMeterCard
          planDisplayName={usage.planDisplayName}
          used={usage.shippingBillsUsed}
          limit={effectiveLimit}
          unitLabel="SBs this month"
          secondaryText={`${usage.shippingBillsUsed} of ${effectiveLimit} shipping bills used this month`}
        />
      </div>

      {batchSummary.totalShippingBills > 0 ? (
        <Card data-testid="batch-parse-summary" className="border-border bg-surface">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 sm:pt-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-text">
                {batchSummary.parsedCount} parsed, {batchSummary.needsReviewCount} need review,{" "}
                {batchSummary.failedCount} failed
                {batchSummary.queuedCount > 0 ? ` (${batchSummary.queuedCount} queued)` : ""}
              </p>
              <p className="text-xs text-text-muted">
                Low-confidence fields are held from calculations until confirmed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite && batchSummary.queuedCount > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={isTriggeringParse}
                  onClick={() => void triggerParsePending(20)}
                  data-testid="parse-queued-btn"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Parse queued</span>
                </Button>
              ) : null}
              {batchSummary.latestNeedsReviewSbId ? (
                <Button asChild variant="primary" size="sm">
                  <Link href={`/app/shipping-bills/${batchSummary.latestNeedsReviewSbId}/review`}>
                    <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                    <span>Review next</span>
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link href="/app/shipping-bills">View Shipping Bills</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/50 px-4 py-3 text-xs">
        <div className="space-y-0.5">
          <p className="font-medium text-text">
            AI fallback extraction:{" "}
            <span className="font-semibold">
              {aiParsingEnabled ? "Enabled (capped per document)" : "Disabled (manual review only)"}
            </span>
          </p>
          <p className="text-text-muted">
            Deterministic extraction runs first. When enabled, minimum snippets for missing fields
            only may use AI extraction.{" "}
            <Link href="/privacy" className="font-medium text-accent underline underline-offset-2">
              Privacy Policy
            </Link>
          </p>
        </div>
        {isOrgAdmin ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isSavingAiSetting}
            onClick={() => void handleToggleAiParsing()}
            data-testid="ai-parsing-toggle"
          >
            {aiParsingEnabled ? "Disable AI fallback" : "Enable AI fallback"}
          </Button>
        ) : null}
      </div>

      {!canWrite ? (
        <div
          data-testid="viewer-readonly-notice"
          className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-muted p-4 text-sm text-text"
        >
          Viewers have read-only access and can download documents, but cannot upload or delete.
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upload documents</CardTitle>
            <CardDescription>
              {selectableIecs.length > 0
                ? "Direct encrypted upload to private storage. Duplicate files (by SHA-256) are skipped automatically."
                : "Add an IEC profile first before uploading documents."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="upload-iec-select">
                  IEC Profile
                </label>
                <Select
                  value={selectedIecId}
                  onValueChange={setSelectedIecId}
                  disabled={selectableIecs.length === 0}
                >
                  <SelectTrigger id="upload-iec-select" aria-label="Select IEC Profile">
                    <SelectValue placeholder="Choose IEC..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableIecs.map((iec) => (
                      <SelectItem key={iec.id} value={iec.id}>
                        {iec.iecCode} — {iec.legalName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="upload-kind-select">
                  Document Type
                </label>
                <Select
                  value={selectedKind}
                  onValueChange={(v) => setSelectedKind(v as DocumentKind)}
                  disabled={!selectedIecId}
                >
                  <SelectTrigger id="upload-kind-select" aria-label="Select Document Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shipping_bill">Shipping Bill (PDF)</SelectItem>
                    <SelectItem value="irm_export">Bank IRM Export (XLSX / XLS / CSV)</SelectItem>
                    <SelectItem value="scroll">
                      Customs Scroll / Ledger (XLSX / CSV / PDF)
                    </SelectItem>
                    <SelectItem value="other">Other Trade Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Drag-and-drop & mobile tap upload zone */}
            <div
              data-testid="upload-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                if (selectedIecId) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (selectedIecId && e.dataTransfer.files.length > 0) {
                  void handleFilesSelected(e.dataTransfer.files);
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed p-6 text-center transition-colors",
                isDragging
                  ? "border-accent bg-accent-soft/40"
                  : "border-border bg-surface-muted/40 hover:bg-surface-muted/70",
                !selectedIecId && "opacity-60"
              )}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="max-w-md space-y-1">
                <p className="text-sm font-semibold text-text">Tap to select or drop files here</p>
                <p className="text-xs text-text-muted">
                  ICEGATE Shipping Bill PDFs or Bank IRM Excel/CSV sheets • Max 10 MB per file
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv"
                disabled={!selectedIecId || !isHydrated}
                data-testid="document-file-input"
                aria-label="Choose files to upload"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }
                }}
                className="sr-only"
              />

              <Button
                type="button"
                variant="primary"
                size="lg"
                disabled={!selectedIecId}
                onClick={() => fileInputRef.current?.click()}
                data-testid="choose-files-btn"
                className="w-full sm:w-auto"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Choose files</span>
              </Button>

              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                <span>
                  100% Private &amp; Encrypted. We never connect to ICEGATE or request DSC tokens.
                </span>
              </p>
            </div>

            {batchError ? (
              <div
                role="alert"
                data-testid="upload-error-banner"
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft p-3 text-sm text-danger-soft-fg"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{batchError}</span>
              </div>
            ) : null}

            {/* Live Batch Upload Queue */}
            {queue.length > 0 ? (
              <div
                className="flex flex-col gap-2"
                aria-live="polite"
                data-testid="upload-queue-list"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Upload queue ({queue.length})
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setQueue((prev) =>
                        prev.filter((q) => q.status === "uploading" || q.status === "uploaded")
                      )
                    }
                  >
                    Clear completed
                  </Button>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {queue.map((item) => {
                    const badge = PARSE_STATUS_BADGE[item.status];
                    return (
                      <div
                        key={item.localId}
                        data-testid="upload-queue-item"
                        className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text">
                              {item.originalName}
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatFileSize(item.sizeBytes)}
                              {item.message ? ` — ${item.message}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {item.status === "failed" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleRetryQueueItem(item)}
                                aria-label={`Retry ${item.originalName}`}
                              >
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                <span>Retry</span>
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-200",
                              item.status === "failed"
                                ? "bg-danger"
                                : item.status === "duplicate"
                                  ? "bg-warning"
                                  : item.status === "queued" || item.status === "done"
                                    ? "bg-success"
                                    : "bg-accent"
                            )}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Search & Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-5 sm:pt-6">
          <div className="relative lg:col-span-2">
            <Input
              label="Search filename"
              placeholder="e.g. sb-849201.pdf"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search
              className="pointer-events-none absolute right-3 top-9.5 h-4 w-4 text-text-muted"
              aria-hidden="true"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text" htmlFor="filter-kind-select">
              Kind
            </label>
            <Select
              value={kindFilter}
              onValueChange={(v) => setKindFilter(v as "all" | DocumentKind)}
            >
              <SelectTrigger id="filter-kind-select" aria-label="Filter by document kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="shipping_bill">Shipping Bill</SelectItem>
                <SelectItem value="irm_export">Bank IRM</SelectItem>
                <SelectItem value="scroll">Customs Scroll</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text" htmlFor="filter-status-select">
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | DocumentParseStatus)}
            >
              <SelectTrigger id="filter-status-select" aria-label="Filter by parse status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="parsing">Parsing</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input
            label="From date"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label="To date"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Persisted Documents List */}
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden="true" />}
          title="No matching documents"
          description="Uploaded Shipping Bills, IRMs, and scrolls will appear here with live parsing status."
        />
      ) : (
        <Card data-testid="documents-list-card">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Uploaded files ({documents.length})</CardTitle>
              <span className="text-xs text-text-muted">
                Deleted files move to a 30-day soft-delete window before permanent purge.
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle pt-2">
            {documents.map((doc) => {
              const badge = PARSE_STATUS_BADGE[doc.parseStatus];
              return (
                <div
                  key={doc.id}
                  data-testid="document-row"
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text">{doc.originalName}</p>
                      {doc.iecCode ? <Badge variant="neutral">{doc.iecCode}</Badge> : null}
                      <Badge variant="neutral">{KIND_LABELS[doc.kind]}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {doc.fileSizeBytes ? <span>{formatFileSize(doc.fileSizeBytes)}</span> : null}
                      <span>
                        <DateText date={doc.createdAt} />
                      </span>
                      {doc.parseError ? (
                        <span className="text-danger-soft-fg">{doc.parseError}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {doc.kind === "shipping_bill" && doc.shippingBillId ? (
                      <Button
                        asChild
                        variant={doc.parseStatus === "needs_review" ? "primary" : "secondary"}
                        size="sm"
                      >
                        <Link href={`/app/shipping-bills/${doc.shippingBillId}/review`}>
                          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                          <span>
                            {doc.parseStatus === "needs_review" ? "Review fields" : "View parsed"}
                          </span>
                        </Link>
                      </Button>
                    ) : null}

                    {doc.kind === "irm_export" ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/app/matches?docId=${doc.id}`}>
                          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                          <span>Import IRM</span>
                        </Link>
                      </Button>
                    ) : null}

                    <Button asChild variant="secondary" size="sm">
                      <a
                        href={`/api/orgs/${orgId}/documents/${doc.id}/download`}
                        download={doc.originalName}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        <span>Download</span>
                      </a>
                    </Button>

                    {canWrite && doc.parseStatus === "failed" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRetryPersistedDoc(doc.id)}
                        aria-label={`Retry parsing ${doc.originalName}`}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        <span>Retry</span>
                      </Button>
                    ) : null}

                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${doc.originalName}`}
                        onClick={() => void handleDelete(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>Delete</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Upgrade Dialog shown when server returns 402 PlanLimitError */}
      <UpgradePlanDialog details={upgradePrompt} onClose={() => setUpgradePrompt(null)} />
    </div>
  );
}
