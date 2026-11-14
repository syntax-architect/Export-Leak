"use client";

import * as React from "react";
import {
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  Download,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { APP_CONFIG } from "@/config/app";

export function ProductDemoLoop() {
  const [activeStep, setActiveStep] = React.useState<0 | 1 | 2>(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  // 15 seconds loop = 5 seconds per step
  React.useEffect(() => {
    if (isPaused) return;

    const interval = 50; // update every 50ms
    const totalDuration = 15000;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (interval / totalDuration) * 100;
        if (next >= 100) {
          setActiveStep(0);
          return 0;
        }
        const currentStepIndex = Math.min(2, Math.floor(next / (100 / 3))) as 0 | 1 | 2;
        setActiveStep(currentStepIndex);
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div
      className="relative mx-auto w-full max-w-4xl rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 sm:p-6 shadow-[var(--shadow-md)]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Interactive Product Walkthrough Demo"
    >
      {/* Top Header & Step Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg text-xs font-bold">
            15s
          </div>
          <div>
            <span className="text-xs font-semibold text-text uppercase tracking-wider">
              Interactive Product Tour
            </span>
            <p className="text-[11px] text-text-muted">
              {isPaused ? "Paused on hover" : "Auto-playing live demo flow"}
            </p>
          </div>
        </div>

        {/* Step Tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveStep(0);
              setProgress(5);
            }}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              activeStep === 0
                ? "bg-surface text-text shadow-[var(--shadow-sm)] font-semibold"
                : "text-text-muted hover:text-text"
            }`}
          >
            1. Upload
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveStep(1);
              setProgress(38);
            }}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              activeStep === 1
                ? "bg-surface text-text shadow-[var(--shadow-sm)] font-semibold"
                : "text-text-muted hover:text-text"
            }`}
          >
            2. Detect Leaks
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveStep(2);
              setProgress(72);
            }}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              activeStep === 2
                ? "bg-surface text-text shadow-[var(--shadow-sm)] font-semibold"
                : "text-text-muted hover:text-text"
            }`}
          >
            3. DGFT eBRC
          </button>
        </div>
      </div>

      {/* 15s Continuous Progress Bar */}
      <div className="h-1 w-full bg-surface-muted overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main Interactive Stage Container */}
      <div className="min-h-[280px] sm:min-h-[300px] flex items-center justify-center py-6">
        {/* Step 0: Upload & Parse */}
        {activeStep === 0 && (
          <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-accent" />
                <span>Extracted Files &amp; Shipment Parsing</span>
              </span>
              <Badge variant="success" className="text-[10px]">
                2 Files Processed
              </Badge>
            </div>

            <div className="space-y-2.5">
              {/* File 1 */}
              <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/30 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-danger/10 text-danger">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text block">
                      Shipping_Bill_8492019_INTUT6.pdf
                    </span>
                    <span className="text-[11px] text-text-muted">
                      12 Items · Port INTUT6 · FOB ₹12,45,000 · RoDTEP Claimed
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Parsed</span>
                </div>
              </div>

              {/* File 2 */}
              <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/30 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-success/10 text-success">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text block">
                      Bank_Inward_Remittances_Oct2026.xlsx
                    </span>
                    <span className="text-[11px] text-text-muted">
                      HDFC Bank · 18 IRMs · Total Realised: $148,200.00
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Imported</span>
                </div>
              </div>
            </div>

            <div className="rounded bg-accent-soft/30 border border-accent/20 p-2.5 text-center text-xs text-accent font-medium">
              ⚡ Zero OCR errors: 100% deterministic text extraction from ICEGATE print
            </div>
          </div>
        )}

        {/* Step 1: Matching & Leak Detection */}
        {activeStep === 1 && (
          <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-accent" />
                <span>Automated Reconciliation &amp; Money Leak Detected</span>
              </span>
              <Badge variant="danger" className="text-[10px]">
                Action Required
              </Badge>
            </div>

            <div className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-danger/20 pb-2.5">
                <div>
                  <span className="text-xs font-bold text-text">SB #8492019 ⇄ IRM #HDFC092194</span>
                  <p className="text-[11px] text-text-muted">
                    Buyer: Nordic Garments AB · $15,000.00 matched at ₹83.00
                  </p>
                </div>
                <span className="text-xs font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Payment 100% Matched</span>
                </span>
              </div>

              {/* Two Leaks flagged */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="rounded bg-surface p-2.5 border border-danger/30 space-y-1">
                  <div className="flex items-center justify-between text-danger font-semibold">
                    <span>Unclaimed RoDTEP</span>
                    <span className="font-mono">₹31,125.00</span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-tight">
                    Customs credit scroll shows ₹0.00 credited. Rate valid under Notification
                    53/2026.
                  </p>
                </div>

                <div className="rounded bg-surface p-2.5 border border-warning/40 space-y-1">
                  <div className="flex items-center justify-between text-warning font-semibold">
                    <span>FEMA Realisation Clock</span>
                    <span className="font-mono">42 Days Left</span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-tight">
                    Statutory 9-month window ends on 15 Dec 2026. File eBRC now to prevent EDPMS
                    caution.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded bg-success-soft/30 border border-success/20 p-2.5 text-center text-xs text-success font-medium">
              💡 {APP_CONFIG.name} flagged ₹31,125 of unclaimed money you would have otherwise
              forgotten
            </div>
          </div>
        )}

        {/* Step 2: One-Click DGFT Bulk eBRC Excel Generation */}
        {activeStep === 2 && (
          <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Download className="h-4 w-4 text-success" />
                <span>Ready-To-File DGFT Bulk eBRC Excel</span>
              </span>
              <Badge variant="success" className="text-[10px]">
                100% Validated
              </Badge>
            </div>

            <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-text">
                    dgft-bulk-ebrc-reconciled-oct2026.xlsx
                  </h4>
                  <p className="text-[11px] text-text-muted">
                    Matches official DGFT sample layout · Validated AD codes &amp; IFSC
                  </p>
                </div>
                <Badge variant="accent" className="font-mono text-xs">
                  18 Rows Ready
                </Badge>
              </div>

              {/* DGFT Template Column Headers preview */}
              <div className="overflow-x-auto text-[10px] font-mono border border-border-subtle rounded bg-surface p-2 text-text-muted">
                <div className="grid grid-cols-6 gap-2 font-bold text-text border-b border-border-subtle pb-1">
                  <span>Sl. No.</span>
                  <span>IFSC Code</span>
                  <span>AD Code</span>
                  <span>IRM Number</span>
                  <span>Amount FCC</span>
                  <span>Port Code</span>
                </div>
                <div className="grid grid-cols-6 gap-2 pt-1 text-text">
                  <span>1</span>
                  <span>HDFC0000123</span>
                  <span>0510001</span>
                  <span>IRM-2026-9042</span>
                  <span>15000.00</span>
                  <span>INTUT6</span>
                </div>
              </div>
            </div>

            <div className="rounded bg-accent-soft/30 border border-accent/20 p-3 text-center text-xs font-semibold text-accent flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>
                One-click download. Ready to upload directly to DGFT portal without rejections.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Trust Guarantee Footnote */}
      <div className="border-t border-border-subtle pt-3 flex flex-wrap items-center justify-between text-[11px] text-text-muted gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <span>Zero portal password or DSC token storage required</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-text">
          <span>{APP_CONFIG.name} Reconciles ₹50+ Cr Export Invoices Monthly</span>
        </div>
      </div>
    </div>
  );
}
