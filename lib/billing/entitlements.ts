import {
  BILLING_GRACE_PERIOD_DAYS,
  getPlanConfig,
  getRecommendedUpgradePlanKey,
  type GatedAction,
  type PlanConfig,
  type PlanEntitlements,
  type PlanKey,
  type PlanLimitKey,
} from "@/config/plans";
import { PlanLimitError } from "@/lib/auth/errors";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type OrgBillingState =
  "active_subscription" | "active_trial" | "grace_period" | "free_fallback";

export interface ResolvedOrgEntitlements {
  orgId: string;
  planKey: PlanKey;
  planDisplayName: string;
  planStatus: string;
  billingState: OrgBillingState;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentEnd: string | null;
  trialEligibleForAutoStart: boolean;
  entitlements: PlanEntitlements;
}

export interface OrgUsageSummary {
  orgId: string;
  planKey: PlanKey;
  planDisplayName: string;
  periodStart: string;
  shippingBillsUsed: number;
  shippingBillsLimit: number;
  trialEligibleForAutoStart: boolean;
}

export interface OrgUsageSnapshot extends OrgUsageSummary {
  billingState: OrgBillingState;
  graceEndsAt: string | null;
  trialEndsAt: string | null;
  currentEnd: string | null;
  iecsUsed: number;
  maxIecs: number;
  seatsUsed: number;
  teamSeatsLimit: number;
  canGenerateEbrc: boolean;
  canExportReports: boolean;
}

export interface AssertCanOptions {
  userId?: string;
  allowAutoTrial?: boolean;
  allowDemoExport?: boolean;
  now?: Date;
}

interface OrgEntitlementDbState {
  planKey: string;
  planStatus: string;
  trialEndsAt: string | null;
  orgUpdatedAt: string | null;
  subStatus: string | null;
  subCurrentEnd: string | null;
  subCancelAtCycleEnd: boolean;
  subUpdatedAt: string | null;
  shippingBillsUsed: number;
  iecsUsed: number;
  seatsUsed: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export function resolveEffectivePlanState(params: {
  planKey: string;
  planStatus: string;
  trialEndsAt: string | null;
  orgUpdatedAt?: string | null;
  subStatus?: string | null;
  subCurrentEnd?: string | null;
  subCancelAtCycleEnd?: boolean;
  subUpdatedAt?: string | null;
  now?: Date;
}): {
  plan: PlanConfig;
  billingState: OrgBillingState;
  graceEndsAt: string | null;
  currentEnd: string | null;
} {
  const nowMs = (params.now ?? new Date()).getTime();
  const configured = getPlanConfig(params.planKey);
  const currentEnd = params.subCurrentEnd ?? null;
  const currentEndMs = currentEnd ? new Date(currentEnd).getTime() : null;

  if (configured.key === "free") {
    return {
      plan: getPlanConfig("free"),
      billingState: "free_fallback",
      graceEndsAt: null,
      currentEnd,
    };
  }

  if (configured.key === "trial_pro") {
    if (params.trialEndsAt && new Date(params.trialEndsAt).getTime() > nowMs) {
      return {
        plan: configured,
        billingState: "active_trial",
        graceEndsAt: null,
        currentEnd: params.trialEndsAt,
      };
    }
    return {
      plan: getPlanConfig("free"),
      billingState: "free_fallback",
      graceEndsAt: null,
      currentEnd: null,
    };
  }

  // Paid plan states: exporter_monthly, exporter_annual, consultant_monthly, consultant_annual
  if (params.planStatus === "past_due") {
    const anchorStr = params.subUpdatedAt ?? params.subCurrentEnd ?? params.orgUpdatedAt ?? null;
    const anchorMs = anchorStr ? new Date(anchorStr).getTime() : nowMs;
    const graceEndMs = anchorMs + BILLING_GRACE_PERIOD_DAYS * MS_PER_DAY;
    const graceEndsAt = new Date(graceEndMs).toISOString();

    if (graceEndMs > nowMs) {
      return {
        plan: configured,
        billingState: "grace_period",
        graceEndsAt,
        currentEnd,
      };
    }

    return {
      plan: getPlanConfig("free"),
      billingState: "free_fallback",
      graceEndsAt,
      currentEnd,
    };
  }

  if (
    params.planStatus === "canceled" ||
    params.planStatus === "cancelled" ||
    params.planStatus === "halted" ||
    params.planStatus === "expired"
  ) {
    if (
      params.subCancelAtCycleEnd &&
      currentEndMs !== null &&
      Number.isFinite(currentEndMs) &&
      currentEndMs > nowMs
    ) {
      return {
        plan: configured,
        billingState: "active_subscription",
        graceEndsAt: null,
        currentEnd,
      };
    }
    return {
      plan: getPlanConfig("free"),
      billingState: "free_fallback",
      graceEndsAt: null,
      currentEnd,
    };
  }

  if (params.planStatus === "active") {
    return {
      plan: configured,
      billingState: "active_subscription",
      graceEndsAt: null,
      currentEnd,
    };
  }

  return {
    plan: getPlanConfig("free"),
    billingState: "free_fallback",
    graceEndsAt: null,
    currentEnd,
  };
}

async function fetchOrgEntitlementDbState(
  orgId: string,
  userId: string | undefined,
  now: Date
): Promise<OrgEntitlementDbState> {
  const periodStart = getCurrentKolkataPeriodStart(now);
  const nowIso = now.toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser, getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const runQuery = async (tx: {
      query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
    }): Promise<OrgEntitlementDbState> => {
      const [orgRes, subRes, counterRes, iecRes, memberRes, inviteRes] = await Promise.all([
        tx.query<{
          plan_key: string;
          plan_status: string;
          trial_ends_at: string | null;
          updated_at: string | null;
        }>(
          `select plan_key, plan_status, trial_ends_at::text, updated_at::text
           from public.organizations
           where id = $1`,
          [orgId]
        ),
        tx.query<{
          status: string;
          current_end: string | null;
          cancel_at_cycle_end: boolean;
          updated_at: string | null;
        }>(
          `select status, current_end::text, cancel_at_cycle_end, updated_at::text
           from public.subscriptions
           where org_id = $1
           order by updated_at desc, created_at desc
           limit 1`,
          [orgId]
        ),
        tx.query<{ shipping_bills_used: number }>(
          `select shipping_bills_used
           from public.usage_counters
           where org_id = $1 and period_start = $2`,
          [orgId, periodStart]
        ),
        tx.query<{ cnt: string }>(
          `select count(*)::text as cnt
           from public.iec_profiles
           where org_id = $1 and is_demo = false`,
          [orgId]
        ),
        tx.query<{ cnt: string }>(
          `select count(*)::text as cnt
           from public.memberships
           where org_id = $1`,
          [orgId]
        ),
        tx.query<{ cnt: string }>(
          `select count(*)::text as cnt
           from public.org_invites
           where org_id = $1
             and accepted_at is null
             and revoked_at is null
             and expires_at > $2::timestamptz`,
          [orgId, nowIso]
        ),
      ]);

      const orgRow = orgRes.rows[0];
      const subRow = subRes.rows[0];
      const iecsUsed = Number(iecRes.rows[0]?.cnt ?? 0);
      const membersCount = Number(memberRes.rows[0]?.cnt ?? 0);
      const pendingInvitesCount = Number(inviteRes.rows[0]?.cnt ?? 0);

      return {
        planKey: orgRow?.plan_key ?? "free",
        planStatus: orgRow?.plan_status ?? "active",
        trialEndsAt: orgRow?.trial_ends_at ?? null,
        orgUpdatedAt: orgRow?.updated_at ?? null,
        subStatus: subRow?.status ?? null,
        subCurrentEnd: subRow?.current_end ?? null,
        subCancelAtCycleEnd: Boolean(subRow?.cancel_at_cycle_end ?? false),
        subUpdatedAt: subRow?.updated_at ?? null,
        shippingBillsUsed: counterRes.rows[0]?.shipping_bills_used ?? 0,
        iecsUsed,
        seatsUsed: membersCount + pendingInvitesCount,
      };
    };

    return userId ? await asPgliteUser(userId, runQuery) : await runQuery(await getPgliteDb());
  }

  const supabase = await createSupabaseServerClient();
  const [
    { data: orgRow },
    { data: subRow },
    { data: counterRow },
    { count: iecsCount },
    { count: membersCount },
    { count: pendingInvitesCount },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("plan_key, plan_status, trial_ends_at, updated_at")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, current_end, cancel_at_cycle_end, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("usage_counters")
      .select("shipping_bills_used")
      .eq("org_id", orgId)
      .eq("period_start", periodStart)
      .maybeSingle(),
    supabase
      .from("iec_profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_demo", false),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase
      .from("org_invites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso),
  ]);

  return {
    planKey: orgRow?.plan_key ?? "free",
    planStatus: orgRow?.plan_status ?? "active",
    trialEndsAt: orgRow?.trial_ends_at ?? null,
    orgUpdatedAt: orgRow?.updated_at ?? null,
    subStatus: subRow?.status ?? null,
    subCurrentEnd: subRow?.current_end ?? null,
    subCancelAtCycleEnd: Boolean(subRow?.cancel_at_cycle_end ?? false),
    subUpdatedAt: subRow?.updated_at ?? null,
    shippingBillsUsed: counterRow?.shipping_bills_used ?? 0,
    iecsUsed: iecsCount ?? 0,
    seatsUsed: (membersCount ?? 0) + (pendingInvitesCount ?? 0),
  };
}

function buildResolvedEntitlements(
  orgId: string,
  state: OrgEntitlementDbState,
  now: Date
): ResolvedOrgEntitlements {
  const resolved = resolveEffectivePlanState({
    planKey: state.planKey,
    planStatus: state.planStatus,
    trialEndsAt: state.trialEndsAt,
    orgUpdatedAt: state.orgUpdatedAt,
    subStatus: state.subStatus,
    subCurrentEnd: state.subCurrentEnd,
    subCancelAtCycleEnd: state.subCancelAtCycleEnd,
    subUpdatedAt: state.subUpdatedAt,
    now,
  });

  const trialEligibleForAutoStart = resolved.plan.key === "free" && state.trialEndsAt === null;

  return {
    orgId,
    planKey: resolved.plan.key,
    planDisplayName: resolved.plan.displayName,
    planStatus: state.planStatus,
    billingState: resolved.billingState,
    trialEndsAt: state.trialEndsAt,
    graceEndsAt: resolved.graceEndsAt,
    currentEnd: resolved.currentEnd,
    trialEligibleForAutoStart,
    entitlements: resolved.plan.entitlements,
  };
}

export async function getEntitlements(
  orgId: string,
  userId?: string,
  now: Date = new Date()
): Promise<ResolvedOrgEntitlements> {
  const dbState = await fetchOrgEntitlementDbState(orgId, userId, now);
  return buildResolvedEntitlements(orgId, dbState, now);
}

export async function getOrgUsageSummary(orgId: string, userId?: string): Promise<OrgUsageSummary> {
  const now = new Date();
  const periodStart = getCurrentKolkataPeriodStart(now);
  const dbState = await fetchOrgEntitlementDbState(orgId, userId, now);
  const resolved = buildResolvedEntitlements(orgId, dbState, now);

  return {
    orgId,
    planKey: resolved.planKey,
    planDisplayName: resolved.planDisplayName,
    periodStart,
    shippingBillsUsed: dbState.shippingBillsUsed,
    shippingBillsLimit: resolved.entitlements.shippingBillsPerMonth,
    trialEligibleForAutoStart: resolved.trialEligibleForAutoStart,
  };
}

export async function getOrgUsageSnapshot(
  orgId: string,
  userId?: string
): Promise<OrgUsageSnapshot> {
  const now = new Date();
  const periodStart = getCurrentKolkataPeriodStart(now);
  const dbState = await fetchOrgEntitlementDbState(orgId, userId, now);
  const resolved = buildResolvedEntitlements(orgId, dbState, now);

  return {
    orgId,
    planKey: resolved.planKey,
    planDisplayName: resolved.planDisplayName,
    periodStart,
    shippingBillsUsed: dbState.shippingBillsUsed,
    shippingBillsLimit: resolved.entitlements.shippingBillsPerMonth,
    trialEligibleForAutoStart: resolved.trialEligibleForAutoStart,
    billingState: resolved.billingState,
    graceEndsAt: resolved.graceEndsAt,
    trialEndsAt: resolved.trialEndsAt,
    currentEnd: resolved.currentEnd,
    iecsUsed: dbState.iecsUsed,
    maxIecs: resolved.entitlements.maxIecs,
    seatsUsed: dbState.seatsUsed,
    teamSeatsLimit: resolved.entitlements.teamSeats,
    canGenerateEbrc: resolved.entitlements.canGenerateEbrc,
    canExportReports: resolved.entitlements.canExportReports,
  };
}

function throwLimitExceeded(params: {
  message: string;
  limitKey: PlanLimitKey;
  currentUsage: number;
  limit: number;
  currentPlanKey: PlanKey;
}): never {
  throw new PlanLimitError(params.message, {
    limitKey: params.limitKey,
    currentUsage: params.currentUsage,
    limit: params.limit,
    currentPlanKey: params.currentPlanKey,
    recommendedPlanKey: getRecommendedUpgradePlanKey(params.currentPlanKey, params.limitKey),
  });
}

export async function assertCan(
  orgId: string,
  action: GatedAction,
  amount = 1,
  options?: AssertCanOptions
): Promise<ResolvedOrgEntitlements> {
  const now = options?.now ?? new Date();
  const dbState = await fetchOrgEntitlementDbState(orgId, options?.userId, now);
  const resolved = buildResolvedEntitlements(orgId, dbState, now);
  const requestedAmount = Math.max(0, amount);

  switch (action) {
    case "upload": {
      if (requestedAmount <= 0) return resolved;
      const allowAutoTrial = options?.allowAutoTrial ?? true;
      const effectiveLimit =
        allowAutoTrial && resolved.trialEligibleForAutoStart
          ? getPlanConfig("trial_pro").entitlements.shippingBillsPerMonth
          : resolved.entitlements.shippingBillsPerMonth;

      if (dbState.shippingBillsUsed + requestedAmount > effectiveLimit) {
        throwLimitExceeded({
          message: `Monthly shipping bill allowance (${effectiveLimit}) reached (${dbState.shippingBillsUsed} used). Upgrade your plan to upload more shipping bills this month.`,
          limitKey: "shippingBillsPerMonth",
          currentUsage: dbState.shippingBillsUsed,
          limit: effectiveLimit,
          currentPlanKey: resolved.planKey,
        });
      }
      return resolved;
    }

    case "add_iec": {
      if (requestedAmount <= 0) return resolved;
      if (dbState.iecsUsed + requestedAmount > resolved.entitlements.maxIecs) {
        throwLimitExceeded({
          message: `IEC profile limit (${resolved.entitlements.maxIecs}) reached on your ${resolved.planDisplayName} plan (${dbState.iecsUsed} active). Upgrade to add more IEC profiles — existing IEC data stays readable.`,
          limitKey: "maxIecs",
          currentUsage: dbState.iecsUsed,
          limit: resolved.entitlements.maxIecs,
          currentPlanKey: resolved.planKey,
        });
      }
      return resolved;
    }

    case "invite_seat": {
      if (requestedAmount <= 0) return resolved;
      if (dbState.seatsUsed + requestedAmount > resolved.entitlements.teamSeats) {
        throwLimitExceeded({
          message: `Team seat limit (${resolved.entitlements.teamSeats}) reached on your ${resolved.planDisplayName} plan (${dbState.seatsUsed} active/pending). Upgrade your plan to invite additional team members.`,
          limitKey: "teamSeats",
          currentUsage: dbState.seatsUsed,
          limit: resolved.entitlements.teamSeats,
          currentPlanKey: resolved.planKey,
        });
      }
      return resolved;
    }

    case "generate_ebrc": {
      if (!resolved.entitlements.canGenerateEbrc) {
        throwLimitExceeded({
          message:
            "Bulk eBRC generation requires a 7-day Pro Trial, Exporter, or Consultant plan. Free accounts can preview and validate rows.",
          limitKey: "canGenerateEbrc",
          currentUsage: 1,
          limit: 0,
          currentPlanKey: resolved.planKey,
        });
      }
      return resolved;
    }

    case "export_report": {
      if (!resolved.entitlements.canExportReports && !options?.allowDemoExport) {
        throwLimitExceeded({
          message:
            "Leakage report export (PDF & Excel) requires a 7-day Pro Trial, Exporter, or Consultant plan. Existing documents remain downloadable.",
          limitKey: "canExportReports",
          currentUsage: 1,
          limit: 0,
          currentPlanKey: resolved.planKey,
        });
      }
      return resolved;
    }
  }
}

export async function assertCanUploadBatch(params: {
  orgId: string;
  userId: string;
  shippingBillCount: number;
  isDemo?: boolean;
}): Promise<OrgUsageSummary> {
  if (params.isDemo || params.shippingBillCount <= 0) {
    return getOrgUsageSummary(params.orgId, params.userId);
  }

  await assertCan(params.orgId, "upload", params.shippingBillCount, {
    userId: params.userId,
    allowAutoTrial: true,
  });

  return getOrgUsageSummary(params.orgId, params.userId);
}

export async function assertCanGenerateEbrc(
  orgId: string,
  userId?: string
): Promise<OrgUsageSummary> {
  await assertCan(orgId, "generate_ebrc", 1, { userId });
  return getOrgUsageSummary(orgId, userId);
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
