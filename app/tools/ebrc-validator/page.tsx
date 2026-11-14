import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { EbrcValidatorTool } from "@/components/tools/ebrc-validator-tool";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `Free DGFT Bulk eBRC Excel Validator & Auto-Fix Tool | ${APP_CONFIG.name}`,
  description:
    "Validate your Bulk eBRC Excel spreadsheet against DGFT schema and validation rules before portal upload. Auto-fix date formats, IFSC codes, and currency mismatch.",
  alternates: {
    canonical: "/tools/ebrc-validator",
  },
  openGraph: {
    title: `DGFT Bulk eBRC Excel Validator | ${APP_CONFIG.name}`,
    description:
      "Avoid DGFT portal rejections. In-memory schema validation with 1-click auto-fix download. Zero storage, 100% private.",
  },
};

export default function EbrcValidatorPage() {
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
            Bulk eBRC Excel Validator
          </span>
        </nav>

        <EbrcValidatorTool />
      </main>

      <PublicFooter />
    </div>
  );
}
