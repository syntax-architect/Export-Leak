"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileText,
  UploadCloud,
  Download,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app";

interface ExtractedItem {
  hsCode: string;
  description: string;
  quantity: number;
  uqc: string;
  itemFob: number;
}

interface ExtractionResponse {
  success: boolean;
  extracted: {
    sbNumber: string | null;
    sbDate: string | null;
    portCode: string | null;
    leoDate: string | null;
    invoiceNo: string | null;
    buyerName: string | null;
    currency: string | null;
    fobValue: number | null;
    schemesClaimed: string[];
    itemsCount: number;
    items: ExtractedItem[];
  };
  remainingFreeUses: number;
  conversionNudge: string;
  memoryOnlyNotice: string;
  error?: string;
  limitReached?: boolean;
}

export function ShippingBillExtractorTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [result, setResult] = React.useState<ExtractionResponse | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileSelect(selectedFile: File) {
    if (!selectedFile.name.endsWith(".pdf")) {
      setErrorMessage("Please select a .pdf Shipping Bill document.");
      return;
    }

    setFile(selectedFile);
    setErrorMessage(null);
    setResult(null);
    setExtracting(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/public/tools/extract-shipping-bill", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to extract shipping bill text.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setErrorMessage("Network error during document extraction.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleDownloadExcel() {
    if (!file) return;
    setDownloading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/public/tools/extract-shipping-bill?format=excel", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setErrorMessage("Failed to generate Excel download.");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shipping-bill-${result?.extracted.sbNumber || "extracted"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setErrorMessage("Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft/30 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-fg">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">
                Free Shipping Bill PDF to Excel Extractor
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Extract shipping bill headers, invoice numbers, port codes, and HS line items into
                structured Excel spreadsheets. Up to 5 PDFs daily.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-semibold text-accent bg-surface px-3 py-1.5 rounded-full border border-accent/20">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Zero files stored · Volatile memory only</span>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Upload Shipping Bill PDF</CardTitle>
          <CardDescription className="text-xs">
            Supports ICEGATE customs prints and CHA-generated Shipping Bill copies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files[0];
              if (dropped) handleFileSelect(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="group flex flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed border-border-subtle bg-surface-muted/20 p-8 text-center transition-colors hover:border-accent hover:bg-accent-soft/10 cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) handleFileSelect(selected);
              }}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent mb-3 transition-transform group-hover:scale-105">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-text">
              {file ? file.name : "Drop your Shipping Bill PDF here, or click to browse"}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Supports PDF files up to 10 MB. In-memory deterministic extraction.
            </p>
          </div>

          {extracting && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-accent">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Extracting shipment data, FOB values, and line items...</span>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-danger/30 bg-danger/10 p-3 text-xs text-danger flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted Data Preview */}
      {result && result.success && (
        <div className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-sm)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-subtle pb-4">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase">
                  Extracted Shipping Bill
                </span>
                <h3 className="text-lg font-bold text-text">
                  SB #{result.extracted.sbNumber || "Unknown"} ·{" "}
                  {result.extracted.sbDate || "Date pending"}
                </h3>
              </div>
              <Button
                onClick={handleDownloadExcel}
                variant="primary"
                className="min-h-11 shrink-0"
                disabled={downloading}
              >
                {downloading ? (
                  <span>Generating Excel...</span>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    <span>Download Excel (.xlsx)</span>
                  </>
                )}
              </Button>
            </div>

            {/* Header Field Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
              <div className="p-2.5 rounded bg-surface-muted/30 border border-border-subtle">
                <span className="text-text-muted block text-[11px]">Port Code</span>
                <span className="font-semibold text-text">{result.extracted.portCode || "—"}</span>
              </div>
              <div className="p-2.5 rounded bg-surface-muted/30 border border-border-subtle">
                <span className="text-text-muted block text-[11px]">Currency &amp; FOB</span>
                <span className="font-semibold text-text font-mono">
                  {result.extracted.currency || "INR"}{" "}
                  {result.extracted.fobValue
                    ? result.extracted.fobValue.toLocaleString("en-IN")
                    : "—"}
                </span>
              </div>
              <div className="p-2.5 rounded bg-surface-muted/30 border border-border-subtle">
                <span className="text-text-muted block text-[11px]">Invoice #</span>
                <span className="font-semibold text-text">{result.extracted.invoiceNo || "—"}</span>
              </div>
              <div className="p-2.5 rounded bg-surface-muted/30 border border-border-subtle">
                <span className="text-text-muted block text-[11px]">Schemes Claimed</span>
                <span className="font-semibold text-text">
                  {result.extracted.schemesClaimed.join(", ") || "None"}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            {result.extracted.items.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-text uppercase tracking-wider">
                  Extracted Line Items ({result.extracted.items.length})
                </h4>
                <div className="overflow-x-auto border border-border-subtle rounded-[var(--radius-sm)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-muted/50 text-text-muted font-semibold">
                        <th className="p-2.5 w-12">#</th>
                        <th className="p-2.5 w-24">HS Code</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5 w-24">Quantity</th>
                        <th className="p-2.5 w-28 text-right">Item FOB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {result.extracted.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-surface-muted/20">
                          <td className="p-2.5 font-mono text-text-muted">{idx + 1}</td>
                          <td className="p-2.5 font-mono font-semibold text-text">{item.hsCode}</td>
                          <td className="p-2.5 text-text-muted truncate max-w-xs">
                            {item.description}
                          </td>
                          <td className="p-2.5 font-mono text-text">
                            {item.quantity} {item.uqc}
                          </td>
                          <td className="p-2.5 font-mono font-semibold text-text text-right">
                            ₹{item.itemFob.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Signup Nudge */}
          <div className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/20 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <h3 className="text-sm font-bold text-text">
                Now match these shipments with your bank payments automatically
              </h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              {APP_CONFIG.name} reconciles every Shipping Bill against bank IRMs, calculates
              expected RoDTEP/Drawback credits, flags FEMA 9-month realisation deadlines, and
              generates your DGFT bulk eBRC file in seconds.
            </p>
            <div>
              <Button asChild variant="primary" size="sm" className="min-h-10">
                <Link href="/login">
                  <span>Start 7-Day Free Trial</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
