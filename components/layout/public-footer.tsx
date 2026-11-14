import * as React from "react";
import Link from "next/link";
import { ShieldCheck, Lock } from "lucide-react";
import { APP_CONFIG } from "@/config/app";

export function PublicFooter() {
  const currentYear = 2026;

  return (
    <footer className="border-t border-border-subtle bg-surface-muted/50 text-text-muted">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand & Mission */}
          <div className="flex flex-col gap-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="text-base font-bold text-text">{APP_CONFIG.name}</span>
            </div>
            <p className="text-xs leading-relaxed">
              Export incentive reconciliation, FEMA realization tracking, and bulk DGFT eBRC exports
              for Indian exporters and EXIM consultants.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-text">
              <Lock className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>Zero password / DSC token storage</span>
            </div>
          </div>

          {/* Product links */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
              Product &amp; Tools
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/pricing" className="hover:text-text transition-colors">
                  Plans &amp; Pricing
                </Link>
              </li>
              <li>
                <Link href="/tools/calculator" className="hover:text-text transition-colors">
                  RoDTEP &amp; Drawback Calculator
                </Link>
              </li>
              <li>
                <Link href="/tools/ebrc-validator" className="hover:text-text transition-colors">
                  Bulk eBRC Excel Validator
                </Link>
              </li>
              <li>
                <Link
                  href="/tools/shipping-bill-extractor"
                  className="hover:text-text transition-colors"
                >
                  Shipping Bill PDF Extractor
                </Link>
              </li>
              <li>
                <Link href="/learn" className="hover:text-text transition-colors">
                  EXIM Compliance Glossary
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust & Legal links */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
              Trust &amp; Legal
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/terms" className="hover:text-text transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-text transition-colors">
                  Privacy Policy (DPDP 2023)
                </Link>
              </li>
              <li>
                <Link href="/refund" className="hover:text-text transition-colors">
                  Refund &amp; Cancellation Policy
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-text transition-colors">
                  Security Commitments
                </Link>
              </li>
            </ul>
          </div>

          {/* Company & Support */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
              Company &amp; Support
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/about" className="hover:text-text transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-text transition-colors">
                  Contact &amp; Support
                </Link>
              </li>
              <li>
                <span className="text-text-muted">Email: {APP_CONFIG.supportEmail}</span>
              </li>
              <li>
                <span className="text-text-muted">WhatsApp: {APP_CONFIG.whatsappNumber}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Company identifiers & Disclaimers */}
        <div className="mt-8 border-t border-border-subtle pt-6 text-xs text-text-muted">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="font-medium text-text">{APP_CONFIG.legalEntityName}</p>
              <p className="mt-1">
                CIN: U74999TN2026PTC000000 (Placeholder) · GSTIN: 33AAAAA0000A1Z5 (Pending CA
                confirmation)
              </p>
              <p className="mt-0.5">
                Registered Office: Anna Salai, Chennai, Tamil Nadu 600002, India
              </p>
            </div>
            <div className="md:text-right">
              <p>
                Regulatory Disclaimer: {APP_CONFIG.name} is an independent software tool and is not
                affiliated with or endorsed by the Directorate General of Foreign Trade (DGFT),
                ICEGATE, CBIC, or the Reserve Bank of India (RBI).
              </p>
              <p className="mt-1">
                &copy; {currentYear} {APP_CONFIG.name}. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
