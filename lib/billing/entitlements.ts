import { getPlanConfig, type PlanConfig, type PlanKey } from "@/config/plans";
import { PlanLimitError } from "@/lib/auth/errors";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface OrgUsageSummary {
  orgId: string;
  planKey: PlanKey;
  planDisplayName: string;
  periodStart: string;
  shippingBillsUsed: number;
  shippingBillsLimit: number;
  trialEligibleForAutoStart: boolean;
}

export function getCurrentKolkataPeriodStart(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}-01`;
}

function resolveEffectivePlan(params: {
  planKey: string;
  planStatus: string;
  trialEndsAt: string | null;
}): PlanConfig {
  const now = Date.now();
  if (params.planKey === "trial_pro" && params.trialEndsAt) {
    if (new Date(params.trialEndsAt).getTime() <= now) {
      return getPlanConfig("free");
    }
    return getPlanConfig("trial_pro");
  }

  if (
    params.planStatus === "canceled" ||
    params.planStatus === "halted" ||
    params.planStatus === "expired"
  ) {
    return getPlanConfig("free");
  }

  return getPlanConfig(params.planKey);
}

export async function getOrgUsageSummary(orgId: string, userId?: string): Promise<OrgUsageSummary> {
  const periodStart = getCurrentKolkataPeriodStart();

  let planKey = "free";
  let planStatus = "active";
  let trialEndsAt: string | null = null;
  let shippingBillsUsed = 0;

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser, getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const runQuery = async (tx: {
      query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
    }) => {
      const [orgRes, counterRes] = await Promise.all([
        tx.query<{ plan_key: string; plan_status: string; trial_ends_at: string | null }>(
          `select plan_key, plan_status, trial_ends_at::text
           from public.organizations
           where id = $1`,
          [orgId]
        ),
        tx.query<{ shipping_bills_used: number }>(
          `select shipping_bills_used
           from public.usage_counters
           where org_id = $1 and period_start = $2`,
          [orgId, periodStart]
        ),
      ]);
      return { orgRow: orgRes.rows[0], used: counterRes.rows[0]?.shipping_bills_used ?? 0 };
    };

    const res = userId ? await asPgliteUser(userId, runQuery) : await runQuery(await getPgliteDb());

    if (res.orgRow) {
      planKey = res.orgRow.plan_key;
      planStatus = res.orgRow.plan_status;
      trialEndsAt = res.orgRow.trial_ends_at;
    }
    shippingBillsUsed = res.used;
  } else {
    const supabase = await createSupabaseServerClient();
    const [{ data: orgRow }, { data: counterRow }] = await Promise.all([
      supabase
        .from("organizations")
        .select("plan_key, plan_status, trial_ends_at")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("usage_counters")
        .select("shipping_bills_used")
        .eq("org_id", orgId)
        .eq("period_start", periodStart)
        .maybeSingle(),
    ]);

    if (orgRow) {
      planKey = orgRow.plan_key;
      planStatus = orgRow.plan_status;
      trialEndsAt = orgRow.trial_ends_at;
    }
    shippingBillsUsed = counterRow?.shipping_bills_used ?? 0;
  }

  const effectivePlan = resolveEffectivePlan({ planKey, planStatus, trialEndsAt });
  const trialEligibleForAutoStart = effectivePlan.key === "free" && trialEndsAt === null;

  return {
    orgId,
    planKey: effectivePlan.key,
    planDisplayName: effectivePlan.displayName,
    periodStart,
    shippingBillsUsed,
    shippingBillsLimit: effectivePlan.entitlements.shippingBillsPerMonth,
    trialEligibleForAutoStart,
  };
}

export async function assertCanUploadBatch(params: {
  orgId: string;
  userId: string;
  shippingBillCount: number;
  isDemo?: boolean;
}): Promise<OrgUsageSummary> {
  const usage = await getOrgUsageSummary(params.orgId, params.userId);
  if (params.isDemo || params.shippingBillCount <= 0) {
    return usage;
  }

  // First real upload on a fresh account auto-unlocks 7-day Pro Trial (50/mo) unless already used.
  const effectiveLimit = usage.trialEligibleForAutoStart
    ? getPlanConfig("trial_pro").entitlements.shippingBillsPerMonth
    : usage.shippingBillsLimit;

  if (usage.shippingBillsUsed + params.shippingBillCount > effectiveLimit) {
    const recommendedPlanKey =
      usage.planKey === "free" || usage.planKey === "trial_pro"
        ? "exporter_monthly"
        : "consultant_monthly";

    throw new PlanLimitError(
      `Monthly shipping bill allowance (${effectiveLimit}) reached (${usage.shippingBillsUsed} used). Upgrade your plan to upload more shipping bills this month.`,
      {
        limitKey: "shippingBillsPerMonth",
        currentUsage: usage.shippingBillsUsed,
        limit: effectiveLimit,
        currentPlanKey: usage.planKey,
        recommendedPlanKey,
      }
    );
  }

  return usage;
}

export async function incrementShippingBillUsage(params: {
  orgId: string;
  delta: number;
  now?: Date;
}): Promise<number> {
  if (params.delta <= 0) return 0;
  const periodStart = getCurrentKolkataPeriodStart(params.now);

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{ shipping_bills_used: number }>(
      `insert into public.usage_counters (org_id, period_start, shipping_bills_used)
       values ($1, $2, $3)
       on conflict (org_id, period_start) do update
         set shipping_bills_used = public.usage_counters.shipping_bills_used + excluded.shipping_bills_used,
             updated_at = now()
       returning shipping_bills_used`,
      [params.orgId, periodStart, params.delta]
    );
    return res.rows[0]?.shipping_bills_used ?? params.delta;
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("increment_shipping_bill_usage", {
    target_org_id: params.orgId,
    target_period_start: periodStart,
    delta: params.delta,
  });

  if (error) {
    throw new Error("Could not update monthly shipping bill usage counter.");
  }

  return typeof data === "number" ? data : params.delta;
}
