"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileSearch,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText } from "@/components/ui/date-text";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { IncentiveScheme, MembershipRole } from "@/lib/database.types";
import type { ShippingBillReviewDetail } from "@/lib/documents/parse-repository";
import {
  type FieldConfidenceEntry,
  type FieldSourceSpan,
  KNOWN_ISO_CURRENCIES,
  REVIEW_CONFIDENCE_THRESHOLD,
} from "@/lib/documents/parsing/types";
import { cn } from "@/lib/utils";

export interface ShippingBillReviewProps {
  bill: ShippingBillReviewDetail;
  role: MembershipRole;
}

interface EditableItemState {
  id?: string;
  hsCode: string;
  description: string;
  quantity: string;
  uqc: string;
  fobAmount: string;
}

function minorToDecimalInput(minor: number): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

function renderHighlightedPageText(text: string, span: FieldSourceSpan | null, pageNum: number) {
  if (!text) {
    return (
      <p className="text-xs italic text-text-muted">
        No extractable text layer was present on page {pageNum}.
      </p>
    );
  }

  if (!span || span.page !== pageNum || span.end <= span.start || span.start >= text.length) {
    return <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-text">{text}</pre>;
  }

  const safeStart = Math.max(0, Math.min(text.length, span.start));
  const safeEnd = Math.max(safeStart, Math.min(text.length, span.end));
  const before = text.slice(0, safeStart);
  const target = text.slice(safeStart, safeEnd);
  const after = text.slice(safeEnd);

  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-text">
      {before}
      <mark
        data-testid="source-highlight"
        className="rounded bg-warning-soft px-1 py-0.5 font-semibold text-warning-soft-fg ring-2 ring-warning"
      >
        {target}
      </mark>
      {after}
    </pre>
  );
}

export function ShippingBillReview({ bill: initialBill, role }: ShippingBillReviewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = role !== "viewer";

  const [bill, setBill] = React.useState(initialBill);
  const [sbNumber, setSbNumber] = React.useState(
    initialBill.sbNumber.startsWith("REV-") ? "" : initialBill.sbNumber
  );
  const [sbDate, setSbDate] = React.useState(initialBill.sbDate);
  const [portCode, setPortCode] = React.useState(
    initialBill.portCode === "INXXXX" ? "" : initialBill.portCode
  );
  const [leoDate, setLeoDate] = React.useState(initialBill.leoDate ?? "");
  const [invoiceNo, setInvoiceNo] = React.useState(initialBill.invoiceNo ?? "");
  const [buyerName, setBuyerName] = React.useState(initialBill.buyerName ?? "");
  const [currency, setCurrency] = React.useState(initialBill.currency);
  const [fobAmount, setFobAmount] = React.useState(minorToDecimalInput(initialBill.fobMinor));
  const [exchangeRate, setExchangeRate] = React.useState(initialBill.exchangeRate ?? "");
  const [schemesClaimed, setSchemesClaimed] = React.useState<IncentiveScheme[]>(
    initialBill.schemesClaimed as IncentiveScheme[]
  );
  const [items, setItems] = React.useState<EditableItemState[]>(
    initialBill.items.length > 0
      ? initialBill.items.map((it) => ({
          id: it.id,
          hsCode: it.hsCode,
          description: it.description,
          quantity: it.quantity,
          uqc: it.uqc,
          fobAmount: minorToDecimalInput(it.fobMinor),
        }))
      : [
          {
            hsCode: "",
            description: "",
            quantity: "1",
            uqc: "PCS",
            fobAmount: "0.00",
          },
        ]
  );

  const [confirmedFields, setConfirmedFields] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const [key, entry] of Object.entries(initialBill.fieldConfidence)) {
      if (entry.confirmed || entry.confidence >= REVIEW_CONFIDENCE_THRESHOLD) {
        initial.add(key);
      }
    }
    return initial;
  });

  const [showUncertainOnly, setShowUncertainOnly] = React.useState(
    initialBill.needsReviewFields.length > 0
  );
  const [activeFieldKey, setActiveFieldKey] = React.useState<string>(
    initialBill.needsReviewFields[0] ?? "sbNumber"
  );
  const [activePage, setActivePage] = React.useState<number>(1);
  const [mobileSourceOpen, setMobileSourceOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const formRef = React.useRef<HTMLFormElement | null>(null);

  const activeConfidenceEntry: FieldConfidenceEntry | null = React.useMemo(() => {
    if (activeFieldKey.startsWith("items[")) {
      const m = /^items\[(\d+)\]\.(.+)$/.exec(activeFieldKey);
      if (m) {
        const idx = Number(m[1]);
        const subKey = m[2]!;
        return bill.items[idx]?.fieldConfidence[subKey] ?? null;
      }
    }
    return bill.fieldConfidence[activeFieldKey] ?? null;
  }, [activeFieldKey, bill]);

  const activeSourceSpan = activeConfidenceEntry?.source ?? null;

  function focusFieldAndSource(fieldKey: string) {
    setActiveFieldKey(fieldKey);
    const entry = fieldKey.startsWith("items[")
      ? (() => {
          const m = /^items\[(\d+)\]\.(.+)$/.exec(fieldKey);
          return m ? bill.items[Number(m[1])]?.fieldConfidence[m[2]!] : undefined;
        })()
      : bill.fieldConfidence[fieldKey];
    if (entry?.source?.page) {
      setActivePage(entry.source.page);
    }
  }

  function handleFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>, fieldKey: string) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    setConfirmedFields((prev) => {
      const next = new Set(prev);
      next.add(fieldKey);
      return next;
    });
    const container = formRef.current;
    if (!container) return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>("[data-review-input='true']")
    );
    const currentIdx = focusables.indexOf(e.currentTarget);
    if (currentIdx >= 0 && currentIdx + 1 < focusables.length) {
      focusables[currentIdx + 1]?.focus();
    }
  }

  function isFieldUncertain(fieldKey: string): boolean {
    if (confirmedFields.has(fieldKey)) return false;
    if (bill.needsReviewFields.includes(fieldKey)) return true;
    const entry = bill.fieldConfidence[fieldKey];
    return Boolean(entry && !entry.confirmed && entry.confidence < REVIEW_CONFIDENCE_THRESHOLD);
  }

  function shouldShowField(fieldKey: string): boolean {
    if (!showUncertainOnly || bill.needsReviewFields.length === 0) return true;
    return isFieldUncertain(fieldKey);
  }

  function toggleScheme(scheme: IncentiveScheme) {
    setSchemesClaimed((prev) =>
      prev.includes(scheme) ? prev.filter((s) => s !== scheme) : [...prev, scheme]
    );
  }

  async function submitReview(confirmAll: boolean) {
    if (!canWrite) return;
    setFormError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/orgs/${bill.orgId}/shipping-bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sbNumber: sbNumber.trim(),
          sbDate: sbDate.trim(),
          portCode: portCode.trim().toUpperCase(),
          leoDate: leoDate.trim() ? leoDate.trim() : null,
          invoiceNo: invoiceNo.trim(),
          buyerName: buyerName.trim(),
          currency: currency.trim().toUpperCase(),
          fobAmount: fobAmount.trim(),
          exchangeRate: exchangeRate.trim() ? exchangeRate.trim() : null,
          schemesClaimed,
          items: items.map((it) => ({
            id: it.id,
            hsCode: it.hsCode.trim(),
            description: it.description.trim(),
            quantity: it.quantity.trim(),
            uqc: it.uqc.trim().toUpperCase(),
            fobAmount: it.fobAmount.trim(),
          })),
          confirmedFields: Array.from(confirmedFields),
          confirmAll,
        }),
      });

      const body = (await res.json()) as {
        shippingBill?: ShippingBillReviewDetail;
        error?: { message?: string };
      };
      if (!res.ok || !body.shippingBill) {
        setFormError(body.error?.message ?? "Could not save Shipping Bill review.");
        return;
      }

      setBill(body.shippingBill);
      setShowUncertainOnly(body.shippingBill.needsReviewFields.length > 0);
      toast({
        title: body.shippingBill.calculationEligible ? "Shipping Bill confirmed" : "Changes saved",
        description: body.shippingBill.calculationEligible
          ? "All fields are verified and unlocked for incentive & eBRC calculations."
          : `${body.shippingBill.needsReviewFields.length} field(s) still need confirmation.`,
        variant: "success",
      });
      router.refresh();
    } catch {
      setFormError("Network error while saving changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderFieldMeta(fieldKey: string) {
    const entry = bill.fieldConfidence[fieldKey];
    const isConfirmed = confirmedFields.has(fieldKey) || Boolean(entry?.confirmed);
    const uncertain = isFieldUncertain(fieldKey);

    return (
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {isConfirmed ? (
            <Badge variant="success">Confirmed</Badge>
          ) : uncertain ? (
            <Badge variant="warning">
              Low confidence{entry ? ` (${Math.round(entry.confidence * 100)}%)` : ""}
            </Badge>
          ) : (
            <Badge variant="neutral">
              {entry ? `${Math.round(entry.confidence * 100)}%` : "Detected"}
            </Badge>
          )}
          {entry?.source?.page ? (
            <span className="text-text-muted">Page {entry.source.page}</span>
          ) : null}
          {entry?.warnings.map((w) => (
            <span key={w} className="text-warning-soft-fg">
              • {w}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              focusFieldAndSource(fieldKey);
              setMobileSourceOpen(true);
            }}
            className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs font-medium text-accent hover:bg-surface-muted md:hidden"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Show source</span>
          </button>

          {canWrite && !isConfirmed ? (
            <button
              type="button"
              onClick={() =>
                setConfirmedFields((prev) => {
                  const next = new Set(prev);
                  next.add(fieldKey);
                  return next;
                })
              }
              className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 text-xs font-medium text-text hover:bg-surface-muted"
            >
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              <span>Confirm</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const pageViewerContent = (
    <div className="flex flex-col gap-3">
      {bill.usedOcrFallback ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft p-3 text-xs text-warning-soft-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Scanned PDF OCR fallback was used. Verify every extracted value carefully against your
            downloaded PDF.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(bill.sourceTextPages.length > 0 ? bill.sourceTextPages : [{ page: 1, text: "" }]).map(
            (p) => (
              <Button
                key={p.page}
                type="button"
                variant={activePage === p.page ? "primary" : "secondary"}
                size="sm"
                onClick={() => setActivePage(p.page)}
              >
                Page {p.page}
              </Button>
            )
          )}
        </div>
        {bill.documentId ? (
          <Button asChild variant="ghost" size="sm">
            <a
              href={`/api/orgs/${bill.orgId}/documents/${bill.documentId}/download`}
              download={bill.documentName ?? `sb-${bill.sbNumber}.pdf`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download PDF</span>
            </a>
          </Button>
        ) : null}
      </div>

      <div className="max-h-[540px] overflow-y-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/40 p-3">
        {renderHighlightedPageText(
          bill.sourceTextPages.find((p) => p.page === activePage)?.text ?? "",
          activeSourceSpan,
          activePage
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Top Action Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app/shipping-bills">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>All Shipping Bills</span>
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Review SB #{sbNumber || bill.sbNumber}
            </h1>
            {bill.calculationEligible ? (
              <Badge variant="success" data-testid="sb-calc-eligible-badge">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ready for calculations</span>
              </Badge>
            ) : (
              <Badge variant="warning" data-testid="sb-calc-locked-badge">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Held until reviewed</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-muted">
            {bill.documentName ? `${bill.documentName} • ` : ""}
            IEC {bill.iecCode} • Press Enter in a desktop field to confirm and move to the next.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setMobileSourceOpen(true)}
            data-testid="mobile-show-source-btn"
            className="md:hidden"
          >
            <FileSearch className="h-4 w-4" aria-hidden="true" />
            <span>Show source</span>
          </Button>

          {bill.needsReviewFields.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowUncertainOnly((prev) => !prev)}
              data-testid="uncertain-first-toggle"
            >
              {showUncertainOnly
                ? "Show all fields"
                : `Uncertain only (${bill.needsReviewFields.length})`}
            </Button>
          ) : null}

          {canWrite ? (
            <Button
              type="button"
              variant="primary"
              loading={isSaving}
              onClick={() => void submitReview(true)}
              data-testid="confirm-all-btn"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Confirm all</span>
            </Button>
          ) : null}
        </div>
      </div>

      {formError ? (
        <div
          role="alert"
          data-testid="review-error-banner"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-danger/40 bg-danger-soft p-3 text-sm text-danger-soft-fg"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      ) : null}

      {/* Desktop Split View / Mobile Stacked View */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Left Pane: PDF Text Source Viewer (Desktop) */}
        <Card
          className="hidden md:col-span-5 md:flex md:flex-col"
          data-testid="desktop-source-pane"
        >
          <CardHeader>
            <CardTitle className="text-base">Extracted PDF Source</CardTitle>
            <CardDescription>
              Clicking any field highlights its source page span here (safe text layer).
            </CardDescription>
          </CardHeader>
          <CardContent>{pageViewerContent}</CardContent>
        </Card>

        {/* Right Pane: Editable Fields & Items */}
        <div className="flex flex-col gap-5 md:col-span-7">
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              void submitReview(false);
            }}
            className="flex flex-col gap-5"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {showUncertainOnly && bill.needsReviewFields.length > 0
                    ? "Fields needing review"
                    : "Shipping Bill Header Fields"}
                </CardTitle>
                <CardDescription>
                  Confirm or correct values. Corrections are saved and audit-logged automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {shouldShowField("sbNumber") ? (
                  <div>
                    <Input
                      label="Shipping Bill Number"
                      value={sbNumber}
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("sbNumber")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "sbNumber")}
                      onChange={(e) => setSbNumber(e.target.value)}
                    />
                    {renderFieldMeta("sbNumber")}
                  </div>
                ) : null}

                {shouldShowField("sbDate") ? (
                  <div>
                    <Input
                      label="SB Filing Date"
                      type="date"
                      value={sbDate}
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("sbDate")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "sbDate")}
                      onChange={(e) => setSbDate(e.target.value)}
                    />
                    {renderFieldMeta("sbDate")}
                  </div>
                ) : null}

                {shouldShowField("portCode") ? (
                  <div>
                    <Input
                      label="Port Code"
                      value={portCode}
                      placeholder="e.g. INNSA1"
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("portCode")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "portCode")}
                      onChange={(e) => setPortCode(e.target.value.toUpperCase())}
                    />
                    {renderFieldMeta("portCode")}
                  </div>
                ) : null}

                {shouldShowField("leoDate") ? (
                  <div>
                    <Input
                      label="LEO Date (optional)"
                      type="date"
                      value={leoDate}
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("leoDate")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "leoDate")}
                      onChange={(e) => setLeoDate(e.target.value)}
                    />
                    {renderFieldMeta("leoDate")}
                  </div>
                ) : null}

                {shouldShowField("invoiceNo") ? (
                  <div>
                    <Input
                      label="Invoice Number"
                      value={invoiceNo}
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("invoiceNo")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "invoiceNo")}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                    />
                    {renderFieldMeta("invoiceNo")}
                  </div>
                ) : null}

                {shouldShowField("buyerName") ? (
                  <div>
                    <Input
                      label="Buyer / Consignee Name"
                      value={buyerName}
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("buyerName")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "buyerName")}
                      onChange={(e) => setBuyerName(e.target.value)}
                    />
                    {renderFieldMeta("buyerName")}
                  </div>
                ) : null}

                {shouldShowField("currency") ? (
                  <div>
                    <label
                      className="mb-1.5 block text-sm font-medium text-text"
                      htmlFor="sb-currency-select"
                    >
                      Currency
                    </label>
                    <Select
                      value={currency}
                      disabled={!canWrite}
                      onValueChange={(val) => {
                        focusFieldAndSource("currency");
                        setCurrency(val);
                      }}
                    >
                      <SelectTrigger id="sb-currency-select" aria-label="Currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(KNOWN_ISO_CURRENCIES).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderFieldMeta("currency")}
                  </div>
                ) : null}

                {shouldShowField("fobMinor") ? (
                  <div>
                    <Input
                      label={`Total FOB (${currency})`}
                      value={fobAmount}
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("fobMinor")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "fobMinor")}
                      onChange={(e) => setFobAmount(e.target.value)}
                    />
                    {renderFieldMeta("fobMinor")}
                  </div>
                ) : null}

                {shouldShowField("exchangeRate") ? (
                  <div>
                    <Input
                      label="Exchange Rate (INR per FC)"
                      value={exchangeRate}
                      placeholder="e.g. 84.2500"
                      disabled={!canWrite}
                      data-review-input="true"
                      onFocus={() => focusFieldAndSource("exchangeRate")}
                      onKeyDown={(e) => handleFieldKeyDown(e, "exchangeRate")}
                      onChange={(e) => setExchangeRate(e.target.value)}
                    />
                    {renderFieldMeta("exchangeRate")}
                  </div>
                ) : null}

                {shouldShowField("schemesClaimed") ? (
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-sm font-medium text-text">Schemes Claimed</p>
                    <div className="flex flex-wrap gap-2">
                      {(["rodtep", "drawback", "rosctl"] as const).map((scheme) => {
                        const active = schemesClaimed.includes(scheme);
                        return (
                          <Button
                            key={scheme}
                            type="button"
                            size="sm"
                            variant={active ? "primary" : "secondary"}
                            disabled={!canWrite}
                            onClick={() => {
                              focusFieldAndSource("schemesClaimed");
                              toggleScheme(scheme);
                            }}
                          >
                            {scheme.toUpperCase()}
                          </Button>
                        );
                      })}
                    </div>
                    {renderFieldMeta("schemesClaimed")}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Line Items ({items.length})</CardTitle>
                  <CardDescription>
                    HS codes must be 8 digits; item FOBs must sum to Total FOB within tolerance.
                  </CardDescription>
                </div>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setItems((prev) => [
                        ...prev,
                        {
                          hsCode: "",
                          description: "",
                          quantity: "1",
                          uqc: "PCS",
                          fobAmount: "0.00",
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>Add item</span>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {items.map((item, idx) => {
                  const hsKey = `items[${idx}].hsCode`;
                  const itemEntry = bill.items[idx]?.fieldConfidence.hsCode;
                  const hsUncertain =
                    !confirmedFields.has(hsKey) &&
                    Boolean(
                      bill.needsReviewFields.includes(hsKey) ||
                      (itemEntry &&
                        !itemEntry.confirmed &&
                        itemEntry.confidence < REVIEW_CONFIDENCE_THRESHOLD)
                    );

                  return (
                    <div
                      key={item.id ?? `item-${idx}`}
                      className={cn(
                        "rounded-[var(--radius-sm)] border p-3",
                        hsUncertain
                          ? "border-warning/60 bg-warning-soft/20"
                          : "border-border-subtle bg-surface"
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Item #{idx + 1}
                        </span>
                        {canWrite && items.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label={`Remove item ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          label={`Item ${idx + 1} HS Code (8 digits)`}
                          value={item.hsCode}
                          disabled={!canWrite}
                          data-review-input="true"
                          onFocus={() => focusFieldAndSource(hsKey)}
                          onKeyDown={(e) => handleFieldKeyDown(e, hsKey)}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, hsCode: e.target.value } : x))
                            )
                          }
                        />
                        <Input
                          label={`Item ${idx + 1} Description`}
                          value={item.description}
                          disabled={!canWrite}
                          data-review-input="true"
                          onFocus={() => focusFieldAndSource(`items[${idx}].description`)}
                          onKeyDown={(e) => handleFieldKeyDown(e, `items[${idx}].description`)}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, description: e.target.value } : x
                              )
                            )
                          }
                        />
                        <Input
                          label={`Item ${idx + 1} Quantity`}
                          value={item.quantity}
                          disabled={!canWrite}
                          data-review-input="true"
                          onFocus={() => focusFieldAndSource(`items[${idx}].quantity`)}
                          onKeyDown={(e) => handleFieldKeyDown(e, `items[${idx}].quantity`)}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, quantity: e.target.value } : x
                              )
                            )
                          }
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            label="UQC"
                            value={item.uqc}
                            disabled={!canWrite}
                            data-review-input="true"
                            onFocus={() => focusFieldAndSource(`items[${idx}].uqc`)}
                            onKeyDown={(e) => handleFieldKeyDown(e, `items[${idx}].uqc`)}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, uqc: e.target.value.toUpperCase() } : x
                                )
                              )
                            }
                          />
                          <Input
                            label={`FOB (${currency})`}
                            value={item.fobAmount}
                            disabled={!canWrite}
                            data-review-input="true"
                            onFocus={() => focusFieldAndSource(`items[${idx}].fobMinor`)}
                            onKeyDown={(e) => handleFieldKeyDown(e, `items[${idx}].fobMinor`)}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, fobAmount: e.target.value } : x
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {canWrite ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={isSaving}
                  data-testid="save-review-btn"
                >
                  Save &amp; re-validate
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={isSaving}
                  onClick={() => void submitReview(true)}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>Confirm all</span>
                </Button>
              </div>
            ) : null}
          </form>

          {/* Past Corrections Audit Table */}
          {bill.corrections.length > 0 ? (
            <Card data-testid="corrections-history-card">
              <CardHeader>
                <CardTitle className="text-base">
                  Saved Corrections ({bill.corrections.length})
                </CardTitle>
                <CardDescription>
                  Tracked changes improve deterministic rules and AI extraction quality over time.
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border-subtle text-xs">
                {bill.corrections.map((corr) => (
                  <div
                    key={corr.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div>
                      <span className="font-semibold text-text">{corr.fieldName}</span>:{" "}
                      <span className="line-through text-text-muted">{corr.oldValue ?? "—"}</span> →{" "}
                      <span className="font-medium text-text">{corr.newValue ?? "—"}</span>
                    </div>
                    <DateText date={corr.createdAt} className="text-text-muted" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Mobile "Show source" Bottom Sheet */}
      <Sheet open={mobileSourceOpen} onOpenChange={setMobileSourceOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Source Document Context</SheetTitle>
            <SheetDescription>
              Extracted PDF text for Page {activePage} with the active field span highlighted.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{pageViewerContent}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
