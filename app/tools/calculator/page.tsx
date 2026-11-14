import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { IncentiveCalculatorTool } from "@/components/tools/incentive-calculator-tool";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `Free RoDTEP & Duty Drawback Calculator (2026 Rates) | ${APP_CONFIG.name}`,
  description:
    "Calculate your export incentives by 8-digit ITC-HS code using official DGFT Appendix 4R and Customs AIR Drawback schedules. Free instant formula breakdown.",
  alternates: {
    canonical: "/tools/calculator",
  },
  openGraph: {
    title: `RoDTEP & Drawback Calculator (2026) | ${APP_CONFIG.name}`,
    description:
      "Instant incentive calculation with cap rules and formula breakdown. 100% free, no login required.",
  },
};

export default function CalculatorPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-1.5 text-xs text-text-muted mb-6"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-text transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="hover:text-text">Free Tools</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text font-medium" aria-current="page">
            RoDTEP &amp; Drawback Calculator
          </span>
        </nav>

        <IncentiveCalculatorTool />
      </main>

      <PublicFooter />
    </div>
  );
}
