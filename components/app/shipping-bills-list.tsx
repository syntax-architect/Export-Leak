"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileCheck2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import type { DocumentBatchSummary, ShippingBillListRow } from "@/lib/documents/parse-repository";

export interface ShippingBillsListProps {
  initialRows: readonly ShippingBillListRow[];
  initialSummary: DocumentBatchSummary;
  initialFilter?: string;
}

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "neutral" | "accent" | "success" | "warning" | "danger" }
> = {
  needs_review: { label: "Needs review", variant: "warning" },
  queued: { label: "Queued", variant: "neutral" },
  parsed: { label: "Confirmed", variant: "success" },
  pending: { label: "Pending match", variant: "accent" },
  partially_matched: { label: "Partial match", variant: "accent" },
  matched: { label: "Matched", variant: "success" },
  ebrc_ready: { label: "eBRC ready", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
};

export function ShippingBillsList({
  initialRows,
  initialSummary,
  initialFilter = "all",
}: ShippingBillsListProps) {
  const [filter, setFilter] = React.useState(initialFilter);

  const visibleRows = React.useMemo(() => {
    if (filter === "needs_review") {
      return initialRows.filter((r) => r.status === "needs_review");
    }
    if (filter === "parsed") {
      return initialRows.filter((r) => r.status !== "needs_review" && r.status !== "queued");
    }
    return initialRows;
  }, [initialRows, filter]);

  const columns: DataTableColumn<ShippingBillListRow>[] = [
    {
      id: "sbNumber",
      header: "Shipping Bill",
      cell: (row) => (
        <div className="space-y-0.5">
          <Link
            href={`/app/shipping-bills/${row.id}`}
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            #{row.sbNumber}
          </Link>
          <p className="text-xs text-text-muted">
            {row.portCode} • <DateText date={row.sbDate} />
          </p>
        </div>
      ),
    },
    {
      id: "buyer",
      header: "Buyer & Invoice",
      cell: (row) => (
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium text-text">{row.buyerName ?? "Buyer missing"}</p>
          <p className="text-xs text-text-muted">{row.invoiceNo ?? "Invoice missing"}</p>
        </div>
      ),
    },
    {
      id: "fob",
      header: "FOB Value",
      align: "right",
      cell: (row) => (
        <span className="font-semibold text-text">
          <MoneyText minorUnits={row.fobMinor} currency={row.currency} />
        </span>
      ),
    },
    {
      id: "status",
      header: "Confidence",
      cell: (row) => {
        const badge = STATUS_BADGE[row.status] ?? {
          label: row.status,
          variant: "neutral" as const,
        };
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {!row.calculationEligible ? (
              <span className="inline-flex items-center gap-1 text-xs text-warning-soft-fg">
                <Lock className="h-3 w-3" aria-hidden="true" />
                <span>{row.needsReviewFields.length} uncertain</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-success-soft-fg">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>Verified</span>
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (row) => (
        <Button asChild variant={row.status === "needs_review" ? "primary" : "secondary"} size="sm">
          <Link href={`/app/shipping-bills/${row.id}/review`}>
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            <span>{row.status === "needs_review" ? "Review" : "Inspect"}</span>
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Shipping Bills</h1>
          <p className="mt-1 text-sm text-text-muted">
            Verify extracted fields before matching payments or computing RoDTEP / Drawback.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/app/documents">Upload more PDFs</Link>
        </Button>
      </div>

      {initialSummary.totalShippingBills > 0 ? (
        <Card data-testid="shipping-bills-batch-summary">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 sm:pt-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              {initialSummary.needsReviewCount > 0 ? (
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              )}
              <span>
                {initialSummary.parsedCount} parsed, {initialSummary.needsReviewCount} need review,{" "}
                {initialSummary.failedCount} failed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={filter === "all" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All ({initialRows.length})
              </Button>
              <Button
                type="button"
                variant={filter === "needs_review" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setFilter("needs_review")}
              >
                Needs review ({initialRows.filter((r) => r.status === "needs_review").length})
              </Button>
              <Button
                type="button"
                variant={filter === "parsed" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setFilter("parsed")}
              >
                Verified ({initialRows.filter((r) => r.status !== "needs_review").length})
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        data={visibleRows}
        columns={columns}
        keyExtractor={(r) => r.id}
        caption="Parsed Shipping Bills"
        mobileTitle={(row) => `SB #${row.sbNumber} (${row.portCode})`}
        mobileSubtitle={(row) => `${row.buyerName ?? "Buyer missing"} • ${row.invoiceNo ?? ""}`}
        emptyState={
          <EmptyState
            icon={<FileCheck2 className="h-6 w-6" aria-hidden="true" />}
            title="No Shipping Bills found"
            description="Upload Shipping Bill PDFs in Documents to extract fields, verify low-confidence items, and unlock calculations."
            action={
              <Button asChild variant="primary">
                <Link href="/app/documents">Go to Documents</Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
