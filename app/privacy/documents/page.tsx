import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Lock, FileText, Trash2, Download, ChevronRight } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `How We Handle Your Documents & Data Security | ${APP_CONFIG.name}`,
  description:
    "Plain-language explanation of our security architecture: zero DSC token storage, AES-256 encryption, ephemeral AI parsing, and India DPDP 2023 compliance.",
  alternates: {
    canonical: "/privacy/documents",
  },
};

export default function DocumentHandlingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main
        id="main-content"
        className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-10"
      >
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-xs text-text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-text transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/privacy" className="hover:text-text transition-colors">
            Privacy Policy
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text font-medium" aria-current="page">
            Document Handling &amp; Security
          </span>
        </nav>

        {/* Hero Section */}
        <div className="space-y-3 border-b border-border-subtle pb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft/30 px-3.5 py-1 text-xs font-semibold text-success">
            <ShieldCheck className="h-4 w-4" />
            <span>India DPDP Act 2023 Aligned · Zero DSC Architecture</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-text">
            How We Handle Your Documents &amp; Financial Data
          </h1>
          <p className="text-sm leading-relaxed text-text-muted">
            We understand that your export shipping bills, buyer details, and bank inward remittance
            messages (IRMs) contain highly sensitive commercial information. Here is our exact,
            transparent technical guarantee on how your data is handled, stored, and protected.
          </p>
        </div>

        {/* Core Security Commitments */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
                  <Lock className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">
                  1. Zero Government Password / DSC Storage
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed space-y-2">
              <p>
                {APP_CONFIG.name} will <strong>never</strong> ask for, accept, or store your Digital
                Signature Certificate (DSC) USB tokens, ICEGATE passwords, or DGFT credentials.
              </p>
              <p>
                We do not scrape government portals or run automated headless browsers on your
                behalf. You download your own documents from ICEGATE/DGFT and upload them directly
                into our secure workspace.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-fg">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">2. AES-256 Encryption &amp; Strict RLS</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed space-y-2">
              <p>
                All uploaded files are stored in private, access-controlled storage buckets
                encrypted at rest using AES-256 and transmitted exclusively over HTTPS/TLS 1.3.
              </p>
              <p>
                Postgres Row Level Security (RLS) policies enforce cryptographic multi-tenant data
                isolation. A user from Organization A can never query, read, or download records
                belonging to Organization B.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
                  <FileText className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">
                  3. Ephemeral AI Parsing &amp; No Training
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed space-y-2">
              <p>
                Document parsing is performed primarily via deterministic regex and coordinate
                extractors. If an AI fallback pass is required for degraded scans, only the minimal
                unparsed text snippets are processed.
              </p>
              <p>
                <strong>
                  Your document contents and trade details are never used to train public or
                  third-party foundation models.
                </strong>{" "}
                Enterprise organizations can also disable the AI fallback pass entirely from their
                workspace settings.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-danger-soft text-danger-soft-fg">
                  <Trash2 className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">4. Complete Deletion &amp; 30-Day Purge</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-text-muted leading-relaxed space-y-2">
              <p>
                You retain complete ownership of your data under the India Digital Personal Data
                Protection (DPDP) Act 2023.
              </p>
              <p>
                When you delete a document or close your account, all shipment line items, matches,
                and file references are instantly removed from calculations, and secondary backup
                archives are permanently purged within 30 days.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Data Rights & Export Action */}
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-muted/30 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-accent" />
            <h2 className="text-base font-semibold text-text">Export Your Data Anytime</h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            We never hold your compliance records hostage. Active and lapsed users can download a
            complete structured JSON archive of all IEC profiles, shipping bills, IRM remittances,
            matches, and scrips with a single click from the Billing &amp; Data settings page.
          </p>
          <div className="pt-2">
            <Button asChild variant="secondary" size="sm" className="min-h-10">
              <Link href="/privacy">Read Full Privacy Policy</Link>
            </Button>
          </div>
        </div>

        {/* Grievance Redressal */}
        <div className="border-t border-border-subtle pt-6 text-xs text-text-muted space-y-1">
          <p className="font-semibold text-text">DPDP Grievance Officer &amp; Inquiries:</p>
          <p>
            ExportLeak Solutions Private Limited · Email:{" "}
            <a href={`mailto:${APP_CONFIG.supportEmail}`} className="text-accent hover:underline">
              {APP_CONFIG.supportEmail}
            </a>
          </p>
          <p>Anna Salai, Chennai, Tamil Nadu 600002, India</p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
