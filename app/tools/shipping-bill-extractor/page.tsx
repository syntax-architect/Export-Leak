import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { ShippingBillExtractorTool } from "@/components/tools/shipping-bill-extractor-tool";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `Free Shipping Bill PDF to Excel Extractor | ${APP_CONFIG.name}`,
  description:
    "Convert your customs Shipping Bill PDFs into structured Excel sheets. Extracts shipping bill numbers, port codes, dates, FOB amounts, and line item HS codes.",
  alternates: {
    canonical: "/tools/shipping-bill-extractor",
  },
  openGraph: {
    title: `Shipping Bill PDF to Excel Extractor | ${APP_CONFIG.name}`,
    description:
      "Instant in-memory extraction of ICEGATE and CHA shipping bill PDFs. Download cleanly formatted Excel.",
  },
};

export default function ShippingBillExtractorPage() {
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
            Shipping Bill PDF Extractor
          </span>
        </nav>

        <ShippingBillExtractorTool />
      </main>

      <PublicFooter />
    </div>
  );
}
