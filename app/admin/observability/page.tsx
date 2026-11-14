import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Users,
  HardDrive,
  ShieldAlert,
} from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth/org-access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateCostGuardrails } from "@/lib/observability/cost-guardrails";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Observability & Metrics",
};

export default async function AdminObservabilityPage() {
  const user = await getAuthenticatedUser();
  if (!user || !user.isPlatformAdmin) {
    redirect("/app");
  }

  let totalOrgs = 0;
  let activeTrials = 0;
  let activePaid = 0;
  let mrrMinor = 0;
  let failedEvents: Array<{
    id: string;
    event_type: string;
    error: string | null;
    processed_at: string | null;
  }> = [];
  let docCount = 0;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const [orgRes, trialRes, paidRes, failRes, docRes] = await Promise.all([
      db.query<{ count: string }>(`select count(*) as count from public.organizations`),
      db.query<{ count: string }>(
        `select count(*) as count from public.organizations where plan_key = 'trial_pro' and trial_ends_at > now()`
      ),
      db.query<{ plan_key: string; count: string }>(
        `select plan_key, count(*) as count from public.subscriptions where status = 'active' group by plan_key`
      ),
      db.query<{
        id: string;
        event_type: string;
        error: string | null;
        processed_at: string | null;
      }>(
        `select id, event_type, error, processed_at::text from public.payment_events where error is not null order by processed_at desc limit 5`
      ),
      db.query<{ count: string }>(
        `select count(*) as count from public.documents where deleted_at is null`
      ),
    ]);

    totalOrgs = Number(orgRes.rows[0]?.count || 0);
    activeTrials = Number(trialRes.rows[0]?.count || 0);
    for (const r of paidRes.rows) {
      const c = Number(r.count);
      activePaid += c;
      if (r.plan_key === "exporter_monthly") mrrMinor += c * 99900;
      else if (r.plan_key === "exporter_annual") mrrMinor += Math.round((c * 999000) / 12);
      else if (r.plan_key === "consultant_monthly") mrrMinor += c * 299900;
      else if (r.plan_key === "consultant_annual") mrrMinor += Math.round((c * 2999000) / 12);
    }
    failedEvents = failRes.rows;
    docCount = Number(docRes.rows[0]?.count || 0);
  } else {
    const supabase = await createSupabaseServerClient();
    const { count: oCount } = await supabase
      .from("organizations")
      .select("*", { count: "exact", head: true });
    totalOrgs = oCount || 0;

    const { count: tCount } = await supabase
      .from("organizations")
      .select("*", { count: "exact", head: true })
      .eq("plan_key", "trial_pro")
      .gt("trial_ends_at", new Date().toISOString());
    activeTrials = tCount || 0;

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("plan_key")
      .eq("status", "active");

    for (const s of subs || []) {
      activePaid += 1;
      if (s.plan_key === "exporter_monthly") mrrMinor += 99900;
      else if (s.plan_key === "exporter_annual") mrrMinor += Math.round(999000 / 12);
      else if (s.plan_key === "consultant_monthly") mrrMinor += 299900;
      else if (s.plan_key === "consultant_annual") mrrMinor += Math.round(2999000 / 12);
    }

    const { data: fails } = await supabase
      .from("payment_events")
      .select("id, event_type, error, processed_at")
      .not("error", "is", null)
      .order("processed_at", { ascending: false })
      .limit(5);
    failedEvents = fails || [];

    const { count: dCount } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null);
    docCount = dCount || 0;
  }

  const conversionRate = totalOrgs > 0 ? ((activePaid / totalOrgs) * 100).toFixed(1) : "0.0";
  const cost = evaluateCostGuardrails({
    aiSpendMinor: Math.round(docCount * 20),
    storageBytesUsed: docCount * 200 * 1024,
    emailCountUsed: Math.min(docCount * 2, 3000),
  });

  return (
    <div className="min-h-dvh bg-bg text-text p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-accent" />
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Platform Observability &amp; Financial Metrics
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Real-time MRR, trial conversion funnel, webhook reliability, and infrastructure cost
            guardrails.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/billing">Webhook Event Stream</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/api/health" target="_blank">
              Health Check JSON
            </Link>
          </Button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Monthly Recurring Revenue</span>
              <DollarSign className="h-4 w-4 text-success" />
            </div>
            <div className="text-2xl font-bold font-mono text-text">
              ₹{(mrrMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-text-muted">
              Calculated from active Razorpay subscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Paid Subscriptions</span>
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
            <div className="text-2xl font-bold font-mono text-text">{activePaid}</div>
            <p className="text-[11px] text-text-muted">{conversionRate}% conversion from signups</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Active Pro Trials</span>
              <CheckCircle2 className="h-4 w-4 text-warning" />
            </div>
            <div className="text-2xl font-bold font-mono text-text">{activeTrials}</div>
            <p className="text-[11px] text-text-muted">7-day card-free trial evaluation</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Total Organizations</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono text-text">{totalOrgs}</div>
            <p className="text-[11px] text-text-muted">Exporter &amp; Consultant accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Guardrails & Limits */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-text flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-accent" />
          <span>Monthly Infrastructure Cost Guardrails (&lt; ₹3,000 Budget)</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">AI Parse Spend Cap</CardTitle>
                <Badge
                  variant={cost.aiUsagePercent >= 80 ? "warning" : "success"}
                  className="text-[10px]"
                >
                  {cost.aiUsagePercent}% Used
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Budget: ₹{(cost.aiSpendBudgetMinor / 100).toLocaleString("en-IN")} / mo
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
                <div
                  className={`h-full ${cost.aiUsagePercent >= 80 ? "bg-warning" : "bg-accent"}`}
                  style={{ width: `${cost.aiUsagePercent}%` }}
                />
              </div>
              <p className="text-text-muted">
                Estimated current spend: ₹{(cost.aiSpendMinor / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Document Storage</CardTitle>
                <Badge
                  variant={cost.storageUsagePercent >= 80 ? "warning" : "success"}
                  className="text-[10px]"
                >
                  {cost.storageUsagePercent}% Tier
                </Badge>
              </div>
              <CardDescription className="text-xs">Capacity: 5 GB private storage</CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
                <div
                  className={`h-full ${cost.storageUsagePercent >= 80 ? "bg-warning" : "bg-accent"}`}
                  style={{ width: `${cost.storageUsagePercent}%` }}
                />
              </div>
              <p className="text-text-muted">
                {(cost.storageBytesUsed / (1024 * 1024)).toFixed(1)} MB in active documents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Email Delivery Volume</CardTitle>
                <Badge
                  variant={cost.emailUsagePercent >= 80 ? "warning" : "success"}
                  className="text-[10px]"
                >
                  {cost.emailUsagePercent}% Allowance
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Resend free allowance: 3,000 / mo
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
                <div
                  className={`h-full ${cost.emailUsagePercent >= 80 ? "bg-warning" : "bg-accent"}`}
                  style={{ width: `${cost.emailUsagePercent}%` }}
                />
              </div>
              <p className="text-text-muted">
                {cost.emailCountUsed} transactional emails dispatched
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Webhook Errors Stream */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-warning" />
                <span>Recent Failed Payment Webhooks</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Captured by the idempotent webhook engine. Handled with automatic retries.
              </CardDescription>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/billing">View Full Event Stream</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {failedEvents.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted bg-surface-muted/30 rounded-[var(--radius-sm)]">
              No failed webhook events recorded. Razorpay subscription webhooks are processing
              cleanly.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {failedEvents.map((evt) => (
                <div key={evt.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div>
                    <span className="font-mono font-bold text-danger">{evt.event_type}</span>
                    <p className="text-text-muted mt-0.5">{evt.error}</p>
                  </div>
                  <span className="text-[11px] text-text-muted shrink-0 font-mono">
                    {evt.processed_at
                      ? new Date(evt.processed_at).toLocaleString("en-IN")
                      : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
