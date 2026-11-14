import * as React from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { PricingTable } from "@/components/pricing/pricing-table";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: `Plans & Pricing | ${APP_CONFIG.name}`,
  description:
    "Transparent INR pricing for Indian exporters and DGFT consultants. Card-free 7-day Pro trial, monthly or annual billing via Razorpay UPI Autopay & Cards.",
};

interface PricingPageProps {
  searchParams?: Promise<{
    highlight?: string;
  }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const highlight = resolvedSearchParams?.highlight ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main id="main-content" className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-text">
              Simple, transparent pricing for Indian exporters
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-text-muted">
              Choose the right plan for your business. Start immediately with a card-free 7-day Pro
              trial or subscribe with UPI Autopay, Netbanking &amp; Cards. No DSC or passwords ever.
            </p>
          </div>

          <PricingTable highlightedPlanKey={highlight} />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
