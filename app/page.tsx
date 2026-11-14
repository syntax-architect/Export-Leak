import * as React from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  FileCheck2,
  Clock,
  Sparkles,
  Lock,
} from "lucide-react";
import { APP_CONFIG } from "@/config/app";

export default function HomePage() {
  const showDevLinks = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 px-4 sm:px-6 lg:px-8 border-b border-border-subtle bg-surface-muted/30">
          <div className="mx-auto max-w-4xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft/40 px-3.5 py-1 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Card-Free 7-Day Pro Trial · Automated DGFT eBRC Generator</span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-text leading-tight">
              Stop losing money on unclaimed export incentives and late eBRCs
            </h1>

            <p className="mx-auto max-w-2xl text-base leading-relaxed text-text-muted">
              {APP_CONFIG.name} extracts data from your Shipping Bill PDFs, matches bank IRMs, flags
              missing RoDTEP &amp; Drawback credits, tracks FEMA 9-month deadlines, and creates your
              bulk DGFT eBRC Excel in seconds.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild variant="primary" size="lg" className="min-h-12 px-6">
                <Link href="/login">
                  <span>Start 7-day free trial</span>
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="min-h-12 px-6">
                <Link href="/pricing">View plan pricing</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-text-muted">
              <div className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>Zero DSC or portal password storage</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                <span>UPI Autopay &amp; Cards via Razorpay</span>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center space-y-2 mb-10">
            <h2 className="text-2xl font-bold text-text">
              Built specifically for Indian trade compliance
            </h2>
            <p className="text-xs text-text-muted max-w-xl mx-auto">
              Everything you need to reconcile customs incentives and bank remittances without
              manual Excel clutter.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent mb-2">
                  <TrendingUp className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">RoDTEP &amp; Drawback Tracking</CardTitle>
                <CardDescription className="text-xs">
                  Automated rate lookups by 8-digit HS code. Compare expected incentives against
                  what customs credited and spot missing money immediately.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-success-soft text-success mb-2">
                  <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">Bulk eBRC Excel Generator</CardTitle>
                <CardDescription className="text-xs">
                  Generates the exact bulk upload Excel format required by the DGFT portal from
                  confirmed Shipping Bill and bank IRM matches.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-warning-soft text-warning mb-2">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">FEMA Realisation Deadlines</CardTitle>
                <CardDescription className="text-xs">
                  Configurable statutory clock (default 9 months) with color-coded alerts and email
                  reminders before EDPMS caution-listing risks arise.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {showDevLinks && (
            <div className="mt-12 text-center">
              <Button asChild variant="ghost" size="sm">
                <Link href="/design">Internal Design System Preview (/design)</Link>
              </Button>
            </div>
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
