"use client";

import * as React from "react";
import Link from "next/link";
import {
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  Download,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JargonTooltip } from "@/components/ui/jargon-tooltip";

interface CellError {
  rowIndex: number;
  rowNumber: number;
  field: string;
  code: string;
  message: string;
  fixHint: string;
  autoFixable: boolean;
}

interface ValidationResponse {
  valid: boolean;
  totalRows: number;
  errorRowsCount: number;
  autoFixableCount: number;
  errors: CellError[];
  totalErrors: number;
  totalAmountByCurrency?: Record<string, number>;
  memoryOnlyNotice?: string;
  error?: string;
}

export function EbrcValidatorTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [fixing, setFixing] = React.useState(false);
  const [result, setResult] = React.useState<ValidationResponse | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileSelect(selectedFile: File) {
    if (!selectedFile.name.endsWith(".xlsx")) {
      setErrorMessage("Please select a .xlsx Excel file.");
      return;
    }

    setFile(selectedFile);
    setErrorMessage(null);
    setResult(null);
    setValidating(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/public/tools/validate-ebrc", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Validation failed.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setErrorMessage("Network error during validation. Please check your connection.");
    } finally {
      setValidating(false);
    }
  }

  async function handleDownloadCorrected() {
    if (!file) return;
    setFixing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/public/tools/validate-ebrc?autoFix=true", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || "Failed to generate auto-fixed file.");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dgft-bulk-ebrc-corrected-${file.name.replace(/\.xlsx$/i, "")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setErrorMessage("Failed to download auto-fixed file.");
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Trust & Guarantee Banner */}
      <div className="rounded-[var(--radius-card)] border border-success/30 bg-success-soft/20 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-success text-success-fg">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">
                Free DGFT Bulk <JargonTooltip slug="ebrc">eBRC</JargonTooltip> Excel Validator
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Check your Excel file against official DGFT schema rules before uploading to the
                portal.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-semibold text-success bg-surface px-3 py-1.5 rounded-full border border-success/20">
            <span>Processed 100% in memory · Never stored</span>
          </div>
        </div>
      </div>

      {/* File Dropzone Area */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Upload Bulk eBRC Excel</CardTitle>
          <CardDescription className="text-xs">
            Select your .xlsx workbook containing the &quot;Bulk_eBRC_Details&quot; worksheet.
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
              accept=".xlsx"
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
              {file ? file.name : "Drop your Bulk eBRC Excel here, or browse files"}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Supports .xlsx up to 10 MB. Verified against official DGFT portal rules.
            </p>
          </div>

          {validating && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-accent">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Validating schema, port codes, dates and IRM allocations...</span>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-danger/30 bg-danger/10 p-3 text-xs text-danger flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation Results Display */}
      {result && (
        <div className="space-y-6">
          {/* Summary Status Header */}
          <div
            className={`rounded-[var(--radius-card)] border p-5 ${
              result.valid
                ? "border-success/40 bg-success-soft/20 text-success"
                : "border-warning/40 bg-warning-soft/20 text-warning"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                {result.valid ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5 text-success" />
                ) : (
                  <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5 text-warning" />
                )}
                <div>
                  <h3 className="text-base font-bold text-text">
                    {result.valid
                      ? "100% DGFT Compliant — Ready to File!"
                      : `Found ${result.totalErrors} formatting or rule issues across ${result.errorRowsCount} rows.`}
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Total Rows: <span className="font-semibold text-text">{result.totalRows}</span>{" "}
                    · Auto-fixable:{" "}
                    <span className="font-semibold text-accent">{result.autoFixableCount}</span>
                  </p>
                </div>
              </div>

              {result.autoFixableCount > 0 && (
                <Button
                  onClick={handleDownloadCorrected}
                  variant="primary"
                  className="min-h-11 shrink-0"
                  disabled={fixing}
                >
                  {fixing ? (
                    <span>Generating Fixed Excel...</span>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      <span>Download Corrected Excel</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Detailed Row Error Table */}
          {result.errors.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Detected Validation Issues</CardTitle>
                <CardDescription className="text-xs">
                  Review the row-level issues below before uploading to the DGFT portal.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-muted/50 text-text-muted font-semibold">
                        <th className="p-3 w-16">Row</th>
                        <th className="p-3 w-32">Field</th>
                        <th className="p-3">Issue Description</th>
                        <th className="p-3">How to Fix</th>
                        <th className="p-3 w-24">Auto-Fix</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {result.errors.map((err, idx) => (
                        <tr
                          key={`${err.rowNumber}-${err.field}-${idx}`}
                          className="hover:bg-surface-muted/20"
                        >
                          <td className="p-3 font-mono font-medium text-text">
                            {err.rowNumber > 0 ? `#${err.rowNumber}` : "Header"}
                          </td>
                          <td className="p-3 font-semibold text-text">{err.field}</td>
                          <td className="p-3 text-danger">{err.message}</td>
                          <td className="p-3 text-text-muted">{err.fixHint}</td>
                          <td className="p-3">
                            {err.autoFixable ? (
                              <Badge variant="accent" className="text-[10px]">
                                Fixable
                              </Badge>
                            ) : (
                              <Badge variant="neutral" className="text-[10px]">
                                Manual
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conversion Callout */}
          <div className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/20 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <h3 className="text-sm font-bold text-text">
                Tired of manual Excel matching and DGFT portal rejections?
              </h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              ExportLeak automatically matches your bank IRMs to Shipping Bills, enforces exact DGFT
              validation rules, and generates compliant bulk eBRC spreadsheets with zero manual data
              entry.
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
