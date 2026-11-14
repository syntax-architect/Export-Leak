import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateCostGuardrails } from "@/lib/observability/cost-guardrails";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin();

    let totalOrgs = 0;
    let activeTrials = 0;
    let activePaid = 0;
    let mrrMinor = 0;
    let failedWebhooks: unknown[] = [];
    let docCount = 0;

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      // Total orgs
      const orgRes = await db.query<{ count: string }>(
        `select count(*) as count from public.organizations`
      );
      totalOrgs = Number(orgRes.rows[0]?.count || 0);

      // Active trials
      const trialRes = await db.query<{ count: string }>(
        `select count(*) as count from public.organizations
         where plan_key = 'trial_pro' and trial_ends_at > now()`
      );
      activeTrials = Number(trialRes.rows[0]?.count || 0);

      // Active paid subscriptions
      const paidRes = await db.query<{ plan_key: string; count: string }>(
        `select plan_key, count(*) as count from public.subscriptions
         where status = 'active'
         group by plan_key`
      );

      for (const row of paidRes.rows) {
        const count = Number(row.count);
        activePaid += count;
        if (row.plan_key === "exporter_monthly") mrrMinor += count * 99900;
        else if (row.plan_key === "exporter_annual") mrrMinor += Math.round((count * 999000) / 12);
        else if (row.plan_key === "consultant_monthly") mrrMinor += count * 299900;
        else if (row.plan_key === "consultant_annual")
          mrrMinor += Math.round((count * 2999000) / 12);
      }

      // Failed webhooks
      const failRes = await db.query(
        `select id, provider, event_type, error, processed_at
         from public.payment_events
         where error is not null
         order by processed_at desc
         limit 10`
      );
      failedWebhooks = failRes.rows;

      // Documents count
      const docRes = await db.query<{ count: string }>(
        `select count(*) as count from public.documents where deleted_at is null`
      );
      docCount = Number(docRes.rows[0]?.count || 0);
    } else {
      const supabase = await createSupabaseServerClient();

      const { count: orgCount } = await supabase
        .from("organizations")
        .select("*", { count: "exact", head: true });
      totalOrgs = orgCount || 0;

      const { count: trialCount } = await supabase
        .from("organizations")
        .select("*", { count: "exact", head: true })
        .eq("plan_key", "trial_pro")
        .gt("trial_ends_at", new Date().toISOString());
      activeTrials = trialCount || 0;

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("plan_key")
        .eq("status", "active");

      for (const sub of subs || []) {
        activePaid += 1;
        if (sub.plan_key === "exporter_monthly") mrrMinor += 99900;
        else if (sub.plan_key === "exporter_annual") mrrMinor += Math.round(999000 / 12);
        else if (sub.plan_key === "consultant_monthly") mrrMinor += 299900;
        else if (sub.plan_key === "consultant_annual") mrrMinor += Math.round(2999000 / 12);
      }

      const { data: failedEvents } = await supabase
        .from("payment_events")
        .select("id, provider, event_type, error, processed_at")
        .not("error", "is", null)
        .order("processed_at", { ascending: false })
        .limit(10);
      failedWebhooks = failedEvents || [];

      const { count: dCount } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null);
      docCount = dCount || 0;
    }

    const conversionRate = totalOrgs > 0 ? Number(((activePaid / totalOrgs) * 100).toFixed(1)) : 0;

    // Estimate storage & AI spend: ~200 KB per document average, ~₹0.20 per doc AI fallback
    const estimatedStorageBytes = docCount * 200 * 1024;
    const estimatedAiSpendMinor = Math.round(docCount * 20); // 20 paise per doc
    const costGuardrails = evaluateCostGuardrails({
      aiSpendMinor: estimatedAiSpendMinor,
      storageBytesUsed: estimatedStorageBytes,
      emailCountUsed: Math.min(docCount * 2, 3000),
    });

    return NextResponse.json({
      overview: {
        totalSignups: totalOrgs,
        activeTrials,
        activePaidSubscriptions: activePaid,
        conversionRatePercent: conversionRate,
        mrrMinor,
        mrrInr: mrrMinor / 100,
      },
      failedWebhooks,
      costGuardrails,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load metrics";
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
