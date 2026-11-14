import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowRight,
  FileCheck2,
  Sparkles,
  Lock,
  Calculator,
  FileText,
  HeartHandshake,
} from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { ProductDemoLoop } from "@/components/landing/product-demo-loop";
import { LandingFaq } from "@/components/landing/landing-faq";
import { StickyMobileCta } from "@/components/landing/sticky-mobile-cta";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_CONFIG } from "@/config/app";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main id="main-content" className="flex-1 pb-16">
        {/* 1. Hero Section */}
        <section className="relative overflow-hidden py-14 sm:py-20 px-4 sm:px-6 lg:px-8 border-b border-border-subtle bg-gradient-to-b from-surface-muted/50 via-surface to-surface">
          <div className="mx-auto max-w-4xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft/40 px-3.5 py-1 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Card-Free 7-Day Pro Trial · Automated DGFT Bulk eBRC Generator</span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-text leading-tight sm:leading-tight">
              Find the export incentive money you are missing
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg leading-relaxed text-text-muted">
              {APP_CONFIG.name} extracts data from your Shipping Bill PDFs, matches bank IRMs, flags
              unclaimed RoDTEP &amp; Drawback credits, tracks FEMA 9-month deadlines, and generates
              your bulk DGFT eBRC Excel in seconds.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                asChild
                variant="primary"
                size="lg"
                className="min-h-12 px-6 text-sm font-semibold"
              >
                <Link href="/login">
                  <span>Check my shipments free</span>
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="min-h-12 px-6 text-sm font-semibold"
              >
                <Link href="/tools/calculator">Try Free RoDTEP Calculator</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-text-muted">
              <div className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>Zero DSC token or password storage</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                <span>No credit card required for 7-day trial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileCheck2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>100% DGFT Schema Compliant</span>
              </div>
            </div>
          </div>

          {/* 15-Second Animated Looping Product Demo */}
          <div className="mt-12 sm:mt-16">
            <ProductDemoLoop />
          </div>
        </section>

        {/* 2. How It Works in 3 Steps */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center space-y-2 mb-12">
            <span className="text-xs uppercase font-bold text-accent tracking-wider">
              Simple 3-Step Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-text">
              From PDF chaos to reconciled eBRCs in minutes
            </h2>
            <p className="text-xs sm:text-sm text-text-muted max-w-xl mx-auto">
              No manual typing, no complex spreadsheets, and zero government portal password
              sharing.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)] space-y-3 relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg font-bold text-sm">
                1
              </div>
              <h3 className="text-base font-bold text-text">Upload Documents</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Drop your Shipping Bill PDFs, bank IRM remittance sheets, and customs scroll
                exports. Our deterministic engine extracts every port code, FOB value, and 8-digit
                HS line item with 100% accuracy.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)] space-y-3 relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg font-bold text-sm">
                2
              </div>
              <h3 className="text-base font-bold text-text">Auto-Reconcile &amp; Spot Leaks</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                ExportLeak automatically matches bank payments to shipping bills, checks for short
                payments, compares RoDTEP/Drawback credits against official rate tables, and tracks
                FEMA 9-month realisation deadlines.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)] space-y-3 relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg font-bold text-sm">
                3
              </div>
              <h3 className="text-base font-bold text-text">Generate DGFT Bulk eBRC</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Download the exact bulk upload Excel file required by the DGFT portal with zero
                format errors, and reclaim unclaimed scroll money before statutory limitation dates
                expire.
              </p>
            </div>
          </div>
        </section>

        {/* 3. Free Public Tools Showcase */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-border-subtle bg-surface-muted/30">
          <div className="max-w-7xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <Badge variant="accent" className="text-xs uppercase tracking-wider py-0.5">
                Free Instant Tools
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-bold text-text">
                Free tools for Indian exporters &amp; consultants
              </h2>
              <p className="text-xs sm:text-sm text-text-muted max-w-xl mx-auto">
                Test our compliance calculators and validators right now. No registration, no credit
                card, zero files stored.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Tool 1 */}
              <Card className="flex flex-col justify-between hover:border-accent hover:shadow-[var(--shadow-sm)] transition-all">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent mb-2">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">RoDTEP &amp; Drawback Calculator</CardTitle>
                  <CardDescription className="text-xs">
                    Input your 8-digit HS code and export FOB value to calculate your exact expected
                    incentive, complete with per-unit caps and formula steps.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="secondary"
                    className="w-full min-h-11 text-xs font-semibold"
                  >
                    <Link href="/tools/calculator">
                      <span>Launch Calculator</span>
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Tool 2 */}
              <Card className="flex flex-col justify-between hover:border-accent hover:shadow-[var(--shadow-sm)] transition-all">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-success-soft text-success mb-2">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Bulk eBRC Excel Validator</CardTitle>
                  <CardDescription className="text-xs">
                    Drop your Bulk eBRC Excel sheet to check for schema errors, invalid AD codes,
                    date format problems, and cross-currency clubbing before DGFT filing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="secondary"
                    className="w-full min-h-11 text-xs font-semibold"
                  >
                    <Link href="/tools/ebrc-validator">
                      <span>Validate My eBRC Excel</span>
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Tool 3 */}
              <Card className="flex flex-col justify-between hover:border-accent hover:shadow-[var(--shadow-sm)] transition-all">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-warning-soft text-warning mb-2">
                    <FileText className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Shipping Bill PDF Extractor</CardTitle>
                  <CardDescription className="text-xs">
                    Convert customs Shipping Bill PDFs into cleanly formatted Excel spreadsheets
                    with all HS codes, quantities, and FOB values itemized.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="secondary"
                    className="w-full min-h-11 text-xs font-semibold"
                  >
                    <Link href="/tools/shipping-bill-extractor">
                      <span>Extract PDF to Excel</span>
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* 4. Trust & Security Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-8 sm:p-12 shadow-[var(--shadow-sm)] space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs uppercase font-bold text-accent tracking-wider">
                Uncompromising Security
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-text">
                Designed to earn the trust of conservative Indian exporters
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-text">
                  <Lock className="h-5 w-5 text-accent" />
                  <span>Zero Password Storage</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  We NEVER ask for, accept, or store your Digital Signature Certificate (DSC) USB
                  tokens, ICEGATE credentials, or DGFT portal passwords. You upload exports
                  yourself.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-text">
                  <ShieldCheck className="h-5 w-5 text-success" />
                  <span>India DPDP 2023 Compliant</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Your documents are encrypted in private storage buckets isolated by Row-Level
                  Security (RLS). You can delete your data anytime with guaranteed 30-day purge.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-text">
                  <HeartHandshake className="h-5 w-5 text-accent" />
                  <span>Transparent Calculations</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Every number shows its formula, source notification, and cap rule. We never make
                  silent guesses on your customs compliance records.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Pricing Preview Section */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-text">
              Fair, transparent pricing for every exporter
            </h2>
            <p className="text-xs sm:text-sm text-text-muted mt-1 max-w-md mx-auto">
              Start free forever, test the 7-day card-free trial, or upgrade when your volume grows.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Button asChild variant="primary" size="lg" className="min-h-12 px-6">
              <Link href="/pricing">
                <span>View All Plans &amp; Pricing</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* 6. Interactive FAQ */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-border-subtle">
          <div className="text-center space-y-2 mb-10">
            <span className="text-xs uppercase font-bold text-accent tracking-wider">
              Frequently Asked Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-text">
              Common questions from exporters and consultants
            </h2>
          </div>

          <LandingFaq />
        </section>

        {/* 7. Founder Note */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
          <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-muted/30 p-6 sm:p-8 space-y-4">
            <h3 className="text-base font-bold text-text">A Note from the Founder</h3>
            <div className="space-y-3 text-xs sm:text-sm text-text-muted leading-relaxed">
              <p>
                Indian manufacturers and exporters work tirelessly to win overseas buyers, ship
                quality goods, and navigate complex international trade. Yet, millions of rupees in
                RoDTEP rebates, Duty Drawback, and GST credits get left on the table every month
                simply due to clunky spreadsheets, missed 9-month FEMA deadlines, and portal filing
                rejections.
              </p>
              <p>
                We built {APP_CONFIG.name} to solve this single problem: give small exporters and
                their trusted CA / CHA consultants the exact mathematical clarity and automated DGFT
                tooling they need to reclaim every rupee they earned.
              </p>
              <p className="font-semibold text-text pt-1">— Founder, {APP_CONFIG.name}</p>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky Mobile CTA */}
      <StickyMobileCta />

      <PublicFooter />
    </div>
  );
}
