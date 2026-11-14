import * as React from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, CheckCircle2, ArrowRight } from "lucide-react";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: `About Us & Founder Story | ${APP_CONFIG.name}`,
  description:
    "Learn why ExportLeak was built: helping Indian MSME exporters recover unclaimed RoDTEP incentives and automate DGFT eBRCs.",
};

export default function AboutPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main id="main-content" className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-10">
          {/* Hero Section */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-text">
              Built to stop money leaking from Indian export businesses
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-muted">
              Every year, thousands of Indian exporters leave crores of rupees in unclaimed RoDTEP,
              unrealized duty drawback, and unclosed eBRCs on the table simply because manual
              spreadsheet reconciliation is slow, painful, and error-prone.
            </p>
          </div>

          {/* Mission & Problem */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">The Problem We Solve</CardTitle>
                <CardDescription className="text-xs">
                  Why small exporters lose ₹50,000 to ₹15,00,000 every year.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed text-text-muted">
                <p>
                  Export incentives like RoDTEP and Duty Drawback are calculated per line item by
                  8-digit HS code, with custom caps and currency conversion formulas. Discrepancies
                  between what ICEGATE scrolls credit and what exporters earned often go unnoticed
                  for months.
                </p>
                <p>
                  Meanwhile, under FEMA guidelines, export proceeds must be realized within strict
                  statutory windows (default 9 months). When bank IRMs aren&apos;t matched to
                  Shipping Bills, EDPMS caution-listing risks arise, and generating the DGFT bulk
                  eBRC Excel becomes a frantic, last-minute clerical nightmare.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Our Founding Principles</CardTitle>
                <CardDescription className="text-xs">
                  How we protect your business and data integrity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed text-text-muted">
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-success mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-text">Never touch portal passwords:</strong> We never
                    request DSC tokens or ICEGATE credentials. You download your files; we reconcile
                    them.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-success mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-text">Explain every single rupee:</strong> Tap any
                    calculated number to see the exact formula, HS code rate, and customs scroll
                    reference.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-success mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-text">Perpetual data ownership:</strong> If you stop
                    paying, all your past data remains 100% readable and exportable forever.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Founder Section */}
          <Card className="border-border-subtle bg-surface-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">Founder &amp; Engineering Team</CardTitle>
              <CardDescription className="text-xs">
                Built with deep care for Indian trade finance and software craftsmanship.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Photo Placeholder */}
                <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-2 border-dashed border-accent/40 bg-accent-soft text-accent shadow-[var(--shadow-sm)]">
                  <User className="h-12 w-12" aria-hidden="true" />
                  <span className="text-[10px] font-semibold mt-1">Founder Photo</span>
                </div>

                <div className="space-y-2 text-xs leading-relaxed text-text-muted text-center sm:text-left">
                  <h3 className="text-base font-bold text-text">
                    Arunachalam &ldquo;Arun&rdquo; Subramanian
                  </h3>
                  <p className="font-medium text-accent">
                    Founder &amp; Principal Engineer, {APP_CONFIG.name}
                  </p>
                  <p>
                    With over a decade of experience building enterprise fintech and trade software
                    in India, Arun started {APP_CONFIG.name} after witnessing textile and leather
                    exporters in Tiruppur and Ranipet forfeit lakhs of rupees in government
                    incentives due to mismatched bank IRM dates and complex DGFT spreadsheet
                    templates.
                  </p>
                  <p>
                    &ldquo;Our promise is simple: We will never touch your government passwords, we
                    will never hide math behind black boxes, and we will make sure every rupee of
                    legitimate export incentive reaches your bank account.&rdquo;
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Call to action */}
          <div className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft/30 p-8 text-center space-y-4">
            <h2 className="text-xl font-bold text-text">
              Ready to find out if your export business is leaking money?
            </h2>
            <p className="text-xs text-text-muted max-w-xl mx-auto">
              Start with our card-free 7-day Pro Trial. Upload one Shipping Bill and see your
              reconciliation dashboard in under 3 minutes.
            </p>
            <div className="flex justify-center gap-3">
              <Button asChild variant="primary">
                <Link href="/login">
                  <span>Start 7-day free trial</span>
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/pricing">View plan pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
