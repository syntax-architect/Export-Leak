"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, HelpCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS, type PlanKey } from "@/config/plans";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PricingTableProps {
  highlightedPlanKey?: string | null;
}

interface ComparisonFeature {
  name: string;
  category: string;
  tooltip?: string;
  free: string | boolean;
  exporter: string | boolean;
  consultant: string | boolean;
}

const COMPARISON_FEATURES: ComparisonFeature[] = [
  {
    name: "IEC Profiles managed",
    category: "Capacity & Limits",
    tooltip: "Number of Importer Exporter Code registrations linked to the organization",
    free: "1 IEC",
    exporter: "1 IEC",
    consultant: "Up to 25 IECs",
  },
  {
    name: "Monthly Shipping Bills",
    category: "Capacity & Limits",
    tooltip: "Shipping Bill PDFs parsed and tracked per calendar month",
    free: "5 bills / mo",
    exporter: "50 bills / mo",
    consultant: "500 bills / mo (pooled)",
  },
  {
    name: "Team Seats included",
    category: "Capacity & Limits",
    tooltip: "Accounts persons, logistics managers, and consultants",
    free: "1 seat (Owner)",
    exporter: "3 seats",
    consultant: "10 seats",
  },
  {
    name: "Bulk eBRC Excel Generator",
    category: "Export & Compliance",
    tooltip: "Generates the exact DGFT Bulk Generate eBRC Excel format from matched IRMs",
    free: "Validation only",
    exporter: true,
    consultant: true,
  },
  {
    name: "RoDTEP & Drawback Calculations",
    category: "Export & Compliance",
    tooltip: "Automated rate calculation by HS code with cap and unit checks",
    free: "Preview only",
    exporter: true,
    consultant: true,
  },
  {
    name: "Realisation Deadlines & Alerts",
    category: "Export & Compliance",
    tooltip: "FEMA 9-month countdown with timely reminders before expiry",
    free: "In-app only",
    exporter: "Email + In-app",
    consultant: "Priority Email + In-app",
  },
  {
    name: "Leakage Reports (PDF & Multi-sheet Excel)",
    category: "Reporting & Audit",
    tooltip: "Comprehensive export report ready to hand over to your CA or bank",
    free: false,
    exporter: true,
    consultant: true,
  },
  {
    name: "Historical Data Read Access",
    category: "Security & Freedom",
    tooltip: "You never lose access to your data even after downgrading",
    free: "Forever readable",
    exporter: "Forever readable",
    consultant: "Forever readable",
  },
  {
    name: "One-Click 'Export All Data'",
    category: "Security & Freedom",
    tooltip: "Download complete organization records in JSON/Excel format anytime",
    free: true,
    exporter: true,
    consultant: true,
  },
];

const FAQS = [
  {
    q: "Do you need my Digital Signature Certificate (DSC) or portal passwords?",
    a: "Never. Under our strict Master Security Rules, we never ask for, accept, or store your DSC hardware tokens, ICEGATE passwords, DGFT credentials, or banking passwords. You download your own Shipping Bills and bank IRMs directly from the respective government portals and upload them to ExportLeak.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes, absolutely. You can cancel your subscription with a single click from your Billing dashboard. Once cancelled, you will retain full access to all paid features until the end of your current billing period. No cancellation fees, questions, or phone calls required.",
  },
  {
    q: "What happens to my data if I cancel or downgrade to Free?",
    a: "Your data remains 100% yours and permanently readable. You will never be locked out of viewing past uploaded PDFs, parsed Shipping Bills, matched IRMs, or incentive audit logs. You can also export all your data anytime using the 'Export my data' button.",
  },
  {
    q: "Which payment methods are supported?",
    a: "We support recurring UPI Autopay (Google Pay, PhonePe, Paytm, BHIM), Indian Netbanking (50+ banks), and Indian Credit & Debit Cards (Visa, Mastercard, RuPay) via Razorpay's RBI-regulated payment gateway.",
  },
  {
    q: "Do you provide GST tax invoices?",
    a: "We generate instant branded payment receipts upon payment confirmation. A full automated GST Tax Invoice generator with your GSTIN and input tax credit (ITC) eligibility will be issued once our Chartered Accountant completes GST formalization.",
  },
];

export function PricingTable({ highlightedPlanKey }: PricingTableProps) {
  const [billingPeriod, setBillingPeriod] = React.useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  const [openAccordionCategory, setOpenAccordionCategory] = React.useState<string | null>(null);

  const isAnnual = billingPeriod === "annual";

  // Categories for comparison
  const categories = React.useMemo(() => {
    return Array.from(new Set(COMPARISON_FEATURES.map((f) => f.category)));
  }, []);

  const exporterKey: PlanKey = isAnnual ? "exporter_annual" : "exporter_monthly";
  const consultantKey: PlanKey = isAnnual ? "consultant_annual" : "consultant_monthly";

  const exporterPlan = PLANS[exporterKey];
  const consultantPlan = PLANS[consultantKey];

  return (
    <div className="flex flex-col gap-12" data-testid="pricing-table-root">
      {/* Billing interval switcher */}
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="inline-flex items-center rounded-[var(--radius-pill)] border border-border-subtle bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setBillingPeriod("monthly")}
            className={cn(
              "rounded-[var(--radius-pill)] px-4 py-1.5 text-xs font-medium transition-all min-h-11 flex items-center justify-center",
              !isAnnual
                ? "bg-surface text-text shadow-[var(--shadow-sm)] font-semibold"
                : "text-text-muted hover:text-text"
            )}
            aria-pressed={!isAnnual}
          >
            Monthly billing
          </button>
          <button
            type="button"
            onClick={() => setBillingPeriod("annual")}
            className={cn(
              "rounded-[var(--radius-pill)] px-4 py-1.5 text-xs font-medium transition-all min-h-11 flex items-center gap-1.5",
              isAnnual
                ? "bg-surface text-text shadow-[var(--shadow-sm)] font-semibold"
                : "text-text-muted hover:text-text"
            )}
            aria-pressed={isAnnual}
          >
            <span>Annual billing</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
              Save ~17%
            </span>
          </button>
        </div>
        <p className="text-xs text-text-muted">
          {isAnnual
            ? "Annual plans include 2 months free per year. Prices exclude applicable taxes."
            : "Cancel or switch billing frequency anytime without penalty."}
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* FREE PLAN */}
        <Card className="flex flex-col justify-between border-border-subtle">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Free</CardTitle>
              <Badge variant="neutral">Starter</Badge>
            </div>
            <CardDescription className="text-xs">
              Zero-friction signup to inspect your leakage without entering payment details.
            </CardDescription>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tabular-nums text-text">₹0</span>
              <span className="text-xs text-text-muted">forever</span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <ul className="space-y-2.5 text-xs text-text-muted">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>1 IEC profile</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>5 Shipping Bills per month</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Full dashboard overview of missing incentives</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Automatic 7-day Pro Trial on first upload</span>
              </li>
              <li className="flex items-start gap-2 text-text-muted">
                <X className="h-4 w-4 shrink-0 text-text-muted mt-0.5" aria-hidden="true" />
                <span>Bulk eBRC Excel export (preview only)</span>
              </li>
            </ul>

            <Button asChild variant="secondary" className="w-full min-h-11">
              <Link href="/login">Get started free</Link>
            </Button>
          </CardContent>
        </Card>

        {/* EXPORTER PLAN (MOST POPULAR) */}
        <Card
          className={cn(
            "relative flex flex-col justify-between border-2 border-accent shadow-[var(--shadow-md)]",
            (highlightedPlanKey === "exporter_monthly" ||
              highlightedPlanKey === "exporter_annual") &&
              "ring-2 ring-accent"
          )}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-accent-fg shadow-[var(--shadow-sm)]">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Most Popular
            </span>
          </div>

          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Exporter</CardTitle>
              <Badge variant="accent">For Single Exporters</Badge>
            </div>
            <CardDescription className="text-xs">
              Everything needed to prevent payment leakages, claim RoDTEP, and export bulk eBRC.
            </CardDescription>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tabular-nums text-text">
                {formatMoney(exporterPlan.pricePaise, "INR", {
                  showCode: false,
                  showDecimals: "never",
                })}
              </span>
              <span className="text-xs text-text-muted">
                {isAnnual ? "/ year (₹832/mo)" : "/ month"}
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <ul className="space-y-2.5 text-xs text-text-muted">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span className="font-medium text-text">1 IEC profile</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span className="font-medium text-text">50 Shipping Bills per month</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Bulk eBRC Excel export formatted for DGFT portal</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Leakage reports in PDF &amp; multi-sheet Excel</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Realisation deadline &amp; scrip expiry email alerts</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>3 team seats for accounts &amp; logistics staff</span>
              </li>
            </ul>

            <Button asChild variant="primary" className="w-full min-h-11">
              <Link href={`/app/billing?highlight=${encodeURIComponent(exporterPlan.key)}`}>
                Subscribe to Exporter
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* CONSULTANT PLAN */}
        <Card
          className={cn(
            "flex flex-col justify-between border-border-subtle",
            (highlightedPlanKey === "consultant_monthly" ||
              highlightedPlanKey === "consultant_annual") &&
              "border-accent ring-2 ring-accent/40"
          )}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Consultant</CardTitle>
              <Badge variant="neutral">EXIM &amp; CA Firms</Badge>
            </div>
            <CardDescription className="text-xs">
              Manage multiple exporter clients with pooled allowances and team collaboration.
            </CardDescription>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tabular-nums text-text">
                {formatMoney(consultantPlan.pricePaise, "INR", {
                  showCode: false,
                  showDecimals: "never",
                })}
              </span>
              <span className="text-xs text-text-muted">
                {isAnnual ? "/ year (₹2,499/mo)" : "/ month"}
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <ul className="space-y-2.5 text-xs text-text-muted">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span className="font-medium text-text">Up to 25 IEC profiles</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span className="font-medium text-text">500 Shipping Bills per month (pooled)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Consultant multi-client leakage overview</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Bulk eBRC Excel generator &amp; PDF/Excel exports</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>10 team seats with role permissions</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                <span>Priority WhatsApp &amp; email support</span>
              </li>
            </ul>

            <Button asChild variant="secondary" className="w-full min-h-11">
              <Link href={`/app/billing?highlight=${encodeURIComponent(consultantPlan.key)}`}>
                Subscribe to Consultant
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Feature Comparison Table */}
      <section aria-labelledby="comparison-heading" className="space-y-4">
        <div className="text-center">
          <h2 id="comparison-heading" className="text-xl font-bold tracking-tight text-text">
            Compare Plan Features
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Detailed breakdown of capabilities across Free, Exporter, and Consultant tiers.
          </p>
        </div>

        {/* Desktop Table (>= 768px) */}
        <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface md:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-muted/60 text-text">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Feature
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Free
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-accent">
                  Exporter
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Consultant
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {COMPARISON_FEATURES.map((item) => (
                <tr key={item.name} className="hover:bg-surface-muted/30">
                  <td className="px-4 py-3 font-medium text-text">
                    <div className="flex items-center gap-1.5">
                      <span>{item.name}</span>
                      {item.tooltip && (
                        <span
                          title={item.tooltip}
                          className="cursor-help text-text-muted hover:text-text"
                        >
                          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {typeof item.free === "boolean" ? (
                      item.free ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <X className="h-4 w-4 text-text-muted" aria-label="Not included" />
                      )
                    ) : (
                      item.free
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-text">
                    {typeof item.exporter === "boolean" ? (
                      item.exporter ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <X className="h-4 w-4 text-text-muted" aria-label="Not included" />
                      )
                    ) : (
                      item.exporter
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {typeof item.consultant === "boolean" ? (
                      item.consultant ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <X className="h-4 w-4 text-text-muted" aria-label="Not included" />
                      )
                    ) : (
                      item.consultant
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Accordions (< 768px) */}
        <div className="space-y-3 md:hidden">
          {categories.map((cat) => {
            const isOpen = openAccordionCategory === cat;
            const catFeatures = COMPARISON_FEATURES.filter((f) => f.category === cat);

            return (
              <div
                key={cat}
                className="overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface"
              >
                <button
                  type="button"
                  onClick={() => setOpenAccordionCategory(isOpen ? null : cat)}
                  className="flex w-full items-center justify-between p-3.5 text-left text-xs font-semibold text-text min-h-11"
                  aria-expanded={isOpen}
                >
                  <span>{cat}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-text-muted transition-transform",
                      isOpen && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div className="divide-y divide-border-subtle border-t border-border-subtle bg-surface-muted/30 p-2">
                    {catFeatures.map((f) => (
                      <div key={f.name} className="py-2.5 px-2 text-xs">
                        <p className="font-semibold text-text">{f.name}</p>
                        <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <span className="block text-text-muted">Free:</span>
                            <span className="font-medium text-text">
                              {typeof f.free === "boolean" ? (f.free ? "Yes" : "No") : f.free}
                            </span>
                          </div>
                          <div>
                            <span className="block text-accent">Exporter:</span>
                            <span className="font-semibold text-text">
                              {typeof f.exporter === "boolean"
                                ? f.exporter
                                  ? "Yes"
                                  : "No"
                                : f.exporter}
                            </span>
                          </div>
                          <div>
                            <span className="block text-text-muted">Consultant:</span>
                            <span className="font-medium text-text">
                              {typeof f.consultant === "boolean"
                                ? f.consultant
                                  ? "Yes"
                                  : "No"
                                : f.consultant}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Trust & Guarantee Banner */}
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted/50 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text">
            Bank-Grade Security &amp; Zero Password Storage
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            We never connect directly to ICEGATE or bank servers. You stay in 100% control of your
            government credentials. 256-bit TLS encryption, strict per-organization database
            isolation, and easy 1-click data exports.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="min-h-11">
          <Link href="/about">Learn about our security</Link>
        </Button>
      </div>

      {/* Plain-Language FAQ Section */}
      <section aria-labelledby="faq-heading" className="space-y-4">
        <div className="text-center">
          <h2 id="faq-heading" className="text-xl font-bold tracking-tight text-text">
            Frequently Asked Questions
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Honest answers to the most common questions from Indian exporters and consultants.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={faq.q}
                className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-text min-h-11"
                  aria-expanded={isOpen}
                >
                  <span className="pr-4">{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-text-muted transition-transform",
                      isOpen && "rotate-180"
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-border-subtle bg-surface-muted/20 px-4 py-3 text-xs leading-relaxed text-text-muted">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
