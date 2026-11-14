"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calculator,
  ArrowRight,
  Sparkles,
  Info,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JargonTooltip } from "@/components/ui/jargon-tooltip";
import type { PublicCalculatorResponse } from "@/lib/incentives/public-lookup";

const SAMPLE_HS_CODES = [
  { code: "61091000", label: "Cotton T-Shirts" },
  { code: "84834000", label: "Gears & Transmission" },
  { code: "62052000", label: "Men's Cotton Shirts" },
  { code: "73181500", label: "Screws & Bolts" },
  { code: "09024020", label: "Black Tea (Bulk)" },
];

export function IncentiveCalculatorTool() {
  const [hsCode, setHsCode] = React.useState("61091000");
  const [fobInr, setFobInr] = React.useState("500000");
  const [quantity, setQuantity] = React.useState("2000");
  const [uqc, setUqc] = React.useState("PCS");
  const [scheme, setScheme] = React.useState<"all" | "rodtep" | "drawback">("all");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PublicCalculatorResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCalculate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/public/tools/calculate-incentive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hsCode: hsCode.trim(),
          fobInr: Number(fobInr) || 0,
          quantity: Number(quantity) || 1,
          uqc: uqc.trim().toUpperCase(),
          scheme,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to calculate export incentives.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error running calculation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Calculate automatically on mount with default values
  React.useEffect(() => {
    let active = true;
    fetch("/api/public/tools/calculate-incentive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hsCode: "61091000",
        fobInr: 500000,
        quantity: 2000,
        uqc: "PCS",
        scheme: "all",
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setResult(data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Tool Introduction & Trust Banner */}
      <div className="rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft/30 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-fg">
              <Calculator className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">
                Free Instant <JargonTooltip slug="rodtep">RoDTEP</JargonTooltip> &amp;{" "}
                <JargonTooltip slug="drawback">Drawback</JargonTooltip> Calculator
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Calculate expected incentives from DGFT Appendix 4R &amp; Customs AIR Drawback
                schedules. Zero login required.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-medium text-text-muted">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Rates updated: 01 Oct 2026</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Form Inputs (Left) */}
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Shipment &amp; Product Details</CardTitle>
              <CardDescription className="text-xs">
                Enter your product&apos;s 8-digit ITC-HS code and export value.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCalculate} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="hs-code-input" className="text-xs font-semibold text-text">
                      8-Digit ITC-HS Code
                    </label>
                    <span className="text-[11px] text-text-muted">e.g. 61091000</span>
                  </div>
                  <Input
                    id="hs-code-input"
                    value={hsCode}
                    onChange={(e) => setHsCode(e.target.value)}
                    placeholder="Enter 8 digits (e.g. 61091000)"
                    maxLength={8}
                    required
                    className="font-mono text-base"
                  />
                  {/* Sample pills */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] text-text-muted mr-1 self-center">Try:</span>
                    {SAMPLE_HS_CODES.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          setHsCode(item.code);
                          if (item.code === "84834000") setUqc("KGS");
                          else if (item.code === "09024020") setUqc("KGS");
                          else setUqc("PCS");
                        }}
                        className={`max-w-full rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors break-words ${
                          hsCode === item.code
                            ? "bg-primary text-primary-fg"
                            : "bg-surface-muted text-text hover:bg-border-subtle"
                        }`}
                      >
                        {item.code} ({item.label})
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="fob-inr-input"
                    className="text-xs font-semibold text-text mb-1.5 block"
                  >
                    FOB Value in INR (₹)
                  </label>
                  <Input
                    id="fob-inr-input"
                    type="number"
                    min="1"
                    step="1"
                    value={fobInr}
                    onChange={(e) => setFobInr(e.target.value)}
                    placeholder="500000"
                    required
                    className="text-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="qty-input"
                      className="text-xs font-semibold text-text mb-1.5 block"
                    >
                      Quantity
                    </label>
                    <Input
                      id="qty-input"
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="1000"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="uqc-select"
                      className="text-xs font-semibold text-text mb-1.5 block"
                    >
                      Unit (UQC)
                    </label>
                    <select
                      id="uqc-select"
                      value={uqc}
                      onChange={(e) => setUqc(e.target.value)}
                      className="h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-1 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="PCS">PCS (Pieces)</option>
                      <option value="NOS">NOS (Numbers)</option>
                      <option value="KGS">KGS (Kilograms)</option>
                      <option value="MTR">MTR (Meters)</option>
                      <option value="SQM">SQM (Square Meters)</option>
                      <option value="SET">SET (Sets)</option>
                      <option value="DOZ">DOZ (Dozens)</option>
                      <option value="TON">TON (Metric Tonnes)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-text mb-1.5 block">
                    Incentive Schemes
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setScheme("all")}
                      className={`h-9 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors ${
                        scheme === "all"
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-subtle bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      All Eligible
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheme("rodtep")}
                      className={`h-9 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors ${
                        scheme === "rodtep"
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-subtle bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      RoDTEP
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheme("drawback")}
                      className={`h-9 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors ${
                        scheme === "drawback"
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-subtle bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      Drawback
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full min-h-11 mt-2"
                  disabled={loading}
                >
                  {loading ? (
                    <span>Calculating...</span>
                  ) : (
                    <>
                      <span>Calculate Expected Incentives</span>
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Calculation Output & Formula Breakdown (Right) */}
        <div className="lg:col-span-7 space-y-6">
          {error && (
            <div className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/10 p-4 text-xs text-danger flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Grand Total Summary Card */}
              <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 sm:p-6 shadow-[var(--shadow-sm)] space-y-4 max-w-full overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border-subtle pb-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-semibold text-text-muted">
                      Total Expected Export Incentive
                    </span>
                    <div className="text-2xl sm:text-3xl font-bold tracking-tight text-text mt-0.5 font-mono">
                      ₹
                      {(result.totalExpectedMinor / 100).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <Badge variant="accent" className="self-start sm:self-auto text-xs py-1 px-3">
                    HS Code {result.hsCode}
                  </Badge>
                </div>

                {result.results.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted bg-surface-muted/50 rounded-[var(--radius-sm)]">
                    No active RoDTEP or Drawback rate found for HS Code {result.hsCode} under
                    current schedules. Check that the 8-digit code matches your export shipping
                    bill.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {result.results.map((item) => (
                      <div
                        key={item.scheme}
                        className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/30 p-3 sm:p-4 space-y-2 max-w-full overflow-hidden"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="text-sm font-semibold text-text">
                              {item.scheme === "rodtep"
                                ? "RoDTEP"
                                : item.scheme === "drawback"
                                  ? "Duty Drawback"
                                  : "RoSCTL"}
                            </span>
                            <Badge variant="neutral" className="text-[10px]">
                              {item.ratePercent}%
                            </Badge>
                            {item.capPerUnitMinor ? (
                              <span className="text-[11px] text-text-muted break-words">
                                (Cap: ₹{(item.capPerUnitMinor / 100).toFixed(2)} / {item.uqc})
                              </span>
                            ) : null}
                          </div>
                          <div className="text-base font-bold text-accent font-mono self-start sm:self-auto">
                            ₹
                            {(item.expectedMinor / 100).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                        </div>

                        {/* Formula Explanation */}
                        <div className="text-xs text-text-muted bg-surface p-2.5 rounded border border-border-subtle space-y-1 max-w-full overflow-hidden">
                          <div className="font-medium text-text flex items-center gap-1.5">
                            <HelpCircle className="h-3.5 w-3.5 text-accent shrink-0" />
                            <span>Calculation Formula:</span>
                          </div>
                          <p className="font-mono text-[11px] text-text leading-relaxed break-words">
                            {item.formulaExplanation}
                          </p>
                          <p className="text-[11px] text-text-muted pt-1 break-words">
                            Source: {item.sourceNote}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rates Last Updated & Disclaimer */}
                <div className="border-t border-border-subtle pt-3 text-[11px] text-text-muted space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-text">
                    <Info className="h-3.5 w-3.5 text-accent shrink-0" />
                    <span className="break-words">
                      Official Notification Schedule: {result.ratesLastUpdated}
                    </span>
                  </div>
                  <p className="italic leading-normal break-words">{result.disclaimer}</p>
                </div>
              </div>

              {/* Conversion Nudge Box */}
              <div className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/20 p-4 sm:p-5 space-y-3 max-w-full overflow-hidden">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-accent shrink-0" />
                  <h3 className="text-sm font-bold text-text">
                    Did customs credit this full amount to your bank ledger?
                  </h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed break-words">
                  Most exporters leave 1.5% to 3% of their FOB value unclaimed due to scroll delays,
                  unmatched shipping bills, and expiring duty scrips. ExportLeak compares your
                  actual customs credits against expected rates automatically.
                </p>
                <div className="pt-1">
                  <Button asChild variant="primary" size="sm" className="min-h-10 w-full sm:w-auto">
                    <Link href="/login">
                      <span>Start 7-Day Free Trial (No Card Required)</span>
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
