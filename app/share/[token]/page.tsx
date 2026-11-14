import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ArrowRight, Lock } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_CONFIG } from "@/config/app";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface SharedReportData {
  id: string;
  title: string;
  totals: {
    totalShipments?: number;
    totalFobMinor?: number;
    totalExpectedMinor?: number;
    totalCreditedMinor?: number;
    totalUnclaimedMinor?: number;
    overdueCount?: number;
    expiringScripsCount?: number;
  };
  expiresAt: string;
  createdAt: string;
  orgName?: string;
}

export const metadata: Metadata = {
  title: `Export Reconciliation Summary | ${APP_CONFIG.name}`,
  description:
    "Read-only export incentive and FEMA realisation reconciliation summary prepared for accounting and CA audit review.",
  robots: {
    index: false, // Never index private shared client report summaries
    follow: false,
  },
};

async function getSharedReport(token: string): Promise<SharedReportData | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{
      id: string;
      title: string;
      totals: SharedReportData["totals"];
      expires_at: string;
      created_at: string;
      org_name: string;
    }>(
      `select r.id, r.title, r.totals, r.expires_at::text, r.created_at::text, o.name as org_name
       from public.shared_reports r
       join public.organizations o on o.id = r.org_id
       where r.token = $1
         and r.revoked_at is null
         and r.expires_at > now()`,
      [token]
    );

    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      totals: row.totals,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      orgName: row.org_name,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shared_reports")
    .select(
      `id, title, totals, expires_at, created_at,
       organizations!inner(name)`
    )
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    title: string;
    totals: SharedReportData["totals"];
    expires_at: string;
    created_at: string;
    organizations: { name: string } | null;
  };

  return {
    id: row.id,
    title: row.title,
    totals: row.totals,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    orgName: row.organizations?.name,
  };
}

export default async function SharedReportPage(props: PageProps) {
  const { token } = await props.params;
  const report = await getSharedReport(token);

  if (!report) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface text-text">
        <PublicHeader />
        <main id="main-content" className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-[var(--radius-card)] border border-border-subtle bg-surface p-8 text-center space-y-4 shadow-[var(--shadow-sm)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning mx-auto">
              <Clock className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-text">Shared Report Unavailable</h1>
            <p className="text-xs text-text-muted leading-relaxed">
              This shared reconciliation link has expired, was revoked by the exporter, or is
              invalid. Please request a fresh summary link from your client or exporter.
            </p>
            <Button asChild variant="primary" size="sm" className="min-h-11">
              <Link href="/">Go to Homepage</Link>
            </Button>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const t = report.totals;
  const fobInr = ((t.totalFobMinor ?? 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const expectedInr = ((t.totalExpectedMinor ?? 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const creditedInr = ((t.totalCreditedMinor ?? 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const unclaimedInr = ((t.totalUnclaimedMinor ?? 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main
        id="main-content"
        className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-8"
      >
        {/* Top Certification Header */}
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-subtle pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="accent" className="text-xs">
                  CA / Audit Summary
                </Badge>
                <span className="text-xs text-text-muted">
                  Prepared on{" "}
                  {new Date(report.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-text">{report.title}</h1>
              {report.orgName && (
                <p className="text-xs font-semibold text-text-muted mt-0.5">
                  Client: {report.orgName}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium bg-surface-muted/50 px-3 py-1.5 rounded border border-border-subtle self-start sm:self-auto">
              <Lock className="h-3.5 w-3.5 text-accent" />
              <span>Read-Only Summary · Aggregated Totals</span>
            </div>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            This certified summary was generated via {APP_CONFIG.name} for chartered accountants,
            EXIM consultants, and finance teams to review export realisation status and unclaimed
            duty incentives without exposing underlying document files.
          </p>
        </div>

        {/* Big Key Figures Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 space-y-1">
            <span className="text-xs text-text-muted uppercase font-semibold">Total Shipments</span>
            <div className="text-2xl font-bold text-text font-mono">{t.totalShipments ?? 0}</div>
            <span className="text-[11px] text-text-muted block">Reconciled shipping bills</span>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 space-y-1">
            <span className="text-xs text-text-muted uppercase font-semibold">
              Total Realised FOB
            </span>
            <div className="text-2xl font-bold text-text font-mono">₹{fobInr}</div>
            <span className="text-[11px] text-text-muted block">FOB value in INR</span>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 space-y-1">
            <span className="text-xs text-text-muted uppercase font-semibold">
              Credited Incentives
            </span>
            <div className="text-2xl font-bold text-success font-mono">₹{creditedInr}</div>
            <span className="text-[11px] text-text-muted block">Expected: ₹{expectedInr}</span>
          </div>

          <div className="rounded-[var(--radius-card)] border border-danger/40 bg-danger/5 p-4 space-y-1">
            <span className="text-xs text-danger uppercase font-semibold">
              Unclaimed Money Leak
            </span>
            <div className="text-2xl font-bold text-danger font-mono">₹{unclaimedInr}</div>
            <span className="text-[11px] text-danger/80 block">Discrepancy vs official rates</span>
          </div>
        </div>

        {/* Detailed Compliance Breakdown */}
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-6 space-y-4">
          <h2 className="text-sm font-bold text-text uppercase tracking-wider">
            Statutory Realisation &amp; Scrip Overview
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">FEMA Realisation Deadlines</span>
                <Badge variant={t.overdueCount && t.overdueCount > 0 ? "danger" : "success"}>
                  {t.overdueCount ?? 0} At Risk
                </Badge>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Shipments approaching the statutory 9-month FEMA repatriation clock. Un-realised
                bills require filing eBRCs or obtaining bank extensions to prevent RBI EDPMS
                caution-listing.
              </p>
            </div>

            <div className="p-4 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">Expiring Duty Scrips</span>
                <Badge
                  variant={
                    t.expiringScripsCount && t.expiringScripsCount > 0 ? "warning" : "neutral"
                  }
                >
                  {t.expiringScripsCount ?? 0} Expiring Soon
                </Badge>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Duty credit scrips with upcoming expiry dates. Unutilized credits must be applied
                against customs duty or sold on the ICEGATE scrip transfer module.
              </p>
            </div>
          </div>
        </div>

        {/* CA Call to Action & Branded Footer */}
        <div className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/20 p-6 space-y-3 text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <h3 className="text-sm font-bold text-text">Are you an EXIM Consultant or CA?</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Automate bank IRM matching and bulk DGFT eBRC generation across all your exporter
              clients.
            </p>
          </div>
          <Button asChild variant="primary" size="sm" className="min-h-11 shrink-0">
            <Link href="/pricing">
              <span>View Consultant Plan</span>
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="text-center pt-4 text-xs text-text-muted">
          <p className="font-semibold text-text">Prepared with {APP_CONFIG.name}</p>
          <p className="text-[11px] mt-0.5">
            Automated export incentive tracking and bulk DGFT eBRC generation for Indian trade.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
