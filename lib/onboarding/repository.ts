import { ForbiddenError, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess, type AuthenticatedUser } from "@/lib/auth/org-access";
import { createOrganization, type UserOrganizationSummary } from "@/lib/auth/repository";
import type {
  AlertSeverity,
  Json,
  OnboardingEventType,
  OrganizationType,
  ShippingBillStatus,
} from "@/lib/database.types";
import { buildSanitisedDemoPack, DEMO_IEC_CODE } from "@/lib/onboarding/demo-pack";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapRoleChoiceToOrgType, type orgRoleChoiceSchema } from "@/lib/validation/auth";
import type { OnboardingPreferences } from "@/lib/validation/onboarding";
import type { z } from "zod";

export interface OnboardingProfileState {
  userId: string;
  orgId: string | null;
  currentStep: number;
  completedAt: string | null;
  skippedAt: string | null;
  preferences: OnboardingPreferences;
  tourCompletedAt: string | null;
  checklistDismissedAt: string | null;
}

export interface DashboardShipmentRow {
  id: string;
  iecId: string;
  iecCode: string;
  isDemo: boolean;
  sbNumber: string;
  sbDate: string;
  portCode: string;
  buyerName: string;
  currency: string;
  fobMinor: number;
  expectedIncentivePaise: number;
  creditedIncentivePaise: number;
  status: ShippingBillStatus;
  realisationDueDate: string | null;
}

export interface DashboardAlertRow {
  id: string;
  iecCode: string;
  isDemo: boolean;
  kind: string;
  severity: AlertSeverity;
  dueOn: string | null;
  sbNumber: string | null;
}

export interface OnboardingChecklistState {
  addIec: boolean;
  uploadShippingBills: boolean;
  uploadIrm: boolean;
  reviewMatches: boolean;
  downloadEbrc: boolean;
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
}

export interface DashboardSummary {
  orgId: string;
  hasDemoData: boolean;
  unclaimedIncentivePaise: number;
  atRiskCount: number;
  atRiskFobMinor: number;
  matchedAndClosedCount: number;
  expiringScripsPaise: number;
  expiringScripsCount: number;
  openAlertsCount: number;
  shipments: DashboardShipmentRow[];
  openAlerts: DashboardAlertRow[];
  checklist: OnboardingChecklistState;
  checklistDismissedAt: string | null;
  tourCompletedAt: string | null;
  planKey: string;
  trialEndsAt: string | null;
}

const DEFAULT_PREFERENCES: OnboardingPreferences = {
  checkRodtep: true,
  checkDeadlines: true,
  checkEbrc: true,
};

function normalizePreferences(raw: unknown): OnboardingPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    checkRodtep: typeof obj.checkRodtep === "boolean" ? obj.checkRodtep : true,
    checkDeadlines: typeof obj.checkDeadlines === "boolean" ? obj.checkDeadlines : true,
    checkEbrc: typeof obj.checkEbrc === "boolean" ? obj.checkEbrc : true,
  };
}

function daysUntilIsoDate(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((target.getTime() - todayUtc) / (24 * 60 * 60 * 1000));
}

function safeNonNegInt(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

interface SummaryInputs {
  orgId: string;
  planKey: string;
  trialEndsAt: string | null;
  checklistDismissedAt: string | null;
  tourCompletedAt: string | null;
  iecs: Array<{ id: string; iec_code: string; is_demo: boolean }>;
  documents: Array<{ iec_id: string; kind: string }>;
  shippingBills: Array<{
    id: string;
    iec_id: string;
    sb_number: string;
    sb_date: string;
    port_code: string;
    buyer_name: string | null;
    currency: string;
    fob_minor: number | string;
    status: ShippingBillStatus;
    realisation_due_date: string | null;
  }>;
  realRemittanceCount: number;
  realMatchesCount: number;
  expectations: Array<{ shipping_bill_id: string; expected_minor: number | string }>;
  credits: Array<{ shipping_bill_id: string; credited_minor: number | string }>;
  scrips: Array<{ face_minor: number | string; expires_on: string | null; status: string }>;
  alerts: Array<{
    id: string;
    iec_id: string;
    kind: string;
    severity: AlertSeverity;
    due_on: string | null;
    shipping_bill_id: string | null;
  }>;
}

function computeDashboardSummary(input: SummaryInputs): DashboardSummary {
  const iecMap = new Map(input.iecs.map((i) => [i.id, i]));
  const sbMap = new Map(input.shippingBills.map((sb) => [sb.id, sb]));

  const expectedBySb = new Map<string, number>();
  for (const row of input.expectations) {
    const prev = expectedBySb.get(row.shipping_bill_id) ?? 0;
    expectedBySb.set(row.shipping_bill_id, prev + Number(row.expected_minor ?? 0));
  }

  const creditedBySb = new Map<string, number>();
  for (const row of input.credits) {
    const prev = creditedBySb.get(row.shipping_bill_id) ?? 0;
    creditedBySb.set(row.shipping_bill_id, prev + Number(row.credited_minor ?? 0));
  }

  let unclaimedIncentivePaise = 0;
  let atRiskCount = 0;
  let atRiskFobMinor = 0;
  let matchedAndClosedCount = 0;

  const shipments: DashboardShipmentRow[] = input.shippingBills.map((sb) => {
    const iec = iecMap.get(sb.iec_id);
    const expected = safeNonNegInt(expectedBySb.get(sb.id) ?? 0);
    const credited = safeNonNegInt(creditedBySb.get(sb.id) ?? 0);
    const gap = Math.max(0, expected - credited);
    unclaimedIncentivePaise += gap;

    if (sb.status === "matched" || sb.status === "ebrc_ready" || sb.status === "closed") {
      matchedAndClosedCount += 1;
    }

    const daysLeft = daysUntilIsoDate(sb.realisation_due_date);
    if (
      daysLeft !== null &&
      daysLeft <= 60 &&
      sb.status !== "matched" &&
      sb.status !== "ebrc_ready" &&
      sb.status !== "closed"
    ) {
      atRiskCount += 1;
      atRiskFobMinor += safeNonNegInt(Number(sb.fob_minor ?? 0));
    }

    return {
      id: sb.id,
      iecId: sb.iec_id,
      iecCode: iec?.iec_code ?? "",
      isDemo: iec?.is_demo ?? false,
      sbNumber: sb.sb_number,
      sbDate: sb.sb_date,
      portCode: sb.port_code,
      buyerName: sb.buyer_name ?? "Export buyer",
      currency: sb.currency,
      fobMinor: safeNonNegInt(Number(sb.fob_minor ?? 0)),
      expectedIncentivePaise: expected,
      creditedIncentivePaise: credited,
      status: sb.status,
      realisationDueDate: sb.realisation_due_date,
    };
  });

  let expiringScripsPaise = 0;
  let expiringScripsCount = 0;
  for (const scrip of input.scrips) {
    if (scrip.status !== "active") continue;
    const daysLeft = daysUntilIsoDate(scrip.expires_on);
    if (daysLeft !== null && daysLeft <= 90) {
      expiringScripsCount += 1;
      expiringScripsPaise += safeNonNegInt(Number(scrip.face_minor ?? 0));
    }
  }

  const openAlerts: DashboardAlertRow[] = input.alerts.map((a) => {
    const iec = iecMap.get(a.iec_id);
    const sb = a.shipping_bill_id ? sbMap.get(a.shipping_bill_id) : undefined;
    return {
      id: a.id,
      iecCode: iec?.iec_code ?? "",
      isDemo: iec?.is_demo ?? false,
      kind: a.kind,
      severity: a.severity,
      dueOn: a.due_on,
      sbNumber: sb?.sb_number ?? null,
    };
  });

  const realIecIdSet = new Set(input.iecs.filter((i) => !i.is_demo).map((i) => i.id));
  const realDocuments = input.documents.filter((d) => realIecIdSet.has(d.iec_id));
  const realShippingBills = input.shippingBills.filter((sb) => realIecIdSet.has(sb.iec_id));

  const checklistItems = {
    addIec: realIecIdSet.size > 0,
    uploadShippingBills:
      realShippingBills.length > 0 || realDocuments.some((d) => d.kind === "shipping_bill"),
    uploadIrm: input.realRemittanceCount > 0 || realDocuments.some((d) => d.kind === "irm_export"),
    reviewMatches: input.realMatchesCount > 0,
    downloadEbrc: realShippingBills.some((sb) => sb.status === "closed"),
  };

  const completedCount = Object.values(checklistItems).filter(Boolean).length;

  return {
    orgId: input.orgId,
    hasDemoData: input.iecs.some((i) => i.is_demo),
    unclaimedIncentivePaise: safeNonNegInt(unclaimedIncentivePaise),
    atRiskCount,
    atRiskFobMinor: safeNonNegInt(atRiskFobMinor),
    matchedAndClosedCount,
    expiringScripsPaise: safeNonNegInt(expiringScripsPaise),
    expiringScripsCount,
    openAlertsCount: openAlerts.length,
    shipments: shipments.slice(0, 10),
    openAlerts,
    checklist: {
      ...checklistItems,
      completedCount,
      totalCount: 5,
      allComplete: completedCount === 5,
    },
    checklistDismissedAt: input.checklistDismissedAt,
    tourCompletedAt: input.tourCompletedAt,
    planKey: input.planKey,
    trialEndsAt: input.trialEndsAt,
  };
}

export async function getOrCreateOnboardingProfile(
  userId: string
): Promise<OnboardingProfileState> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(userId, async (tx) => {
      const existing = await tx.query<{
        user_id: string;
        org_id: string | null;
        current_step: number;
        completed_at: string | null;
        skipped_at: string | null;
        preferences: unknown;
        tour_completed_at: string | null;
        checklist_dismissed_at: string | null;
      }>(
        `select user_id, org_id, current_step, completed_at::text, skipped_at::text,
                preferences, tour_completed_at::text, checklist_dismissed_at::text
         from public.onboarding_profiles
         where user_id = $1`,
        [userId]
      );

      let row = existing.rows[0];
      if (!row) {
        const inserted = await tx.query<{
          user_id: string;
          org_id: string | null;
          current_step: number;
          completed_at: string | null;
          skipped_at: string | null;
          preferences: unknown;
          tour_completed_at: string | null;
          checklist_dismissed_at: string | null;
        }>(
          `insert into public.onboarding_profiles (user_id, current_step)
           values ($1, 1)
           on conflict (user_id) do update set user_id = excluded.user_id
           returning user_id, org_id, current_step, completed_at::text, skipped_at::text,
                     preferences, tour_completed_at::text, checklist_dismissed_at::text`,
          [userId]
        );
        row = inserted.rows[0];
      }

      return {
        userId: row?.user_id ?? userId,
        orgId: row?.org_id ?? null,
        currentStep: row?.current_step ?? 1,
        completedAt: row?.completed_at ?? null,
        skippedAt: row?.skipped_at ?? null,
        preferences: normalizePreferences(row?.preferences),
        tourCompletedAt: row?.tour_completed_at ?? null,
        checklistDismissedAt: row?.checklist_dismissed_at ?? null,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("onboarding_profiles")
    .select(
      "user_id, org_id, current_step, completed_at, skipped_at, preferences, tour_completed_at, checklist_dismissed_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  let row = existing;
  if (!row) {
    const { data: inserted } = await supabase
      .from("onboarding_profiles")
      .upsert({ user_id: userId, current_step: 1 }, { onConflict: "user_id" })
      .select(
        "user_id, org_id, current_step, completed_at, skipped_at, preferences, tour_completed_at, checklist_dismissed_at"
      )
      .single();
    row = inserted;
  }

  return {
    userId: row?.user_id ?? userId,
    orgId: row?.org_id ?? null,
    currentStep: row?.current_step ?? 1,
    completedAt: row?.completed_at ?? null,
    skippedAt: row?.skipped_at ?? null,
    preferences: normalizePreferences(row?.preferences),
    tourCompletedAt: row?.tour_completed_at ?? null,
    checklistDismissedAt: row?.checklist_dismissed_at ?? null,
  };
}

export async function recordOnboardingEvent(params: {
  userId: string;
  orgId?: string | null;
  eventType: OnboardingEventType;
  stepNumber?: number | null;
  metadata?: Record<string, Json>;
}): Promise<void> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(params.userId, async (tx) => {
      await tx.query(
        `insert into public.onboarding_events (user_id, org_id, event_type, step_number, metadata)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          params.userId,
          params.orgId ?? null,
          params.eventType,
          params.stepNumber ?? null,
          JSON.stringify(params.metadata ?? {}),
        ]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("onboarding_events").insert({
    user_id: params.userId,
    org_id: params.orgId ?? null,
    event_type: params.eventType,
    step_number: params.stepNumber ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function saveOnboardingStepOne(params: {
  user: AuthenticatedUser;
  roleChoice: z.infer<typeof orgRoleChoiceSchema>;
  name: string;
  iecCode: string | null;
  gstin: string | null;
}): Promise<{ organization: UserOrganizationSummary; profile: OnboardingProfileState }> {
  const orgType: OrganizationType = mapRoleChoiceToOrgType(params.roleChoice);
  const profileBefore = await getOrCreateOnboardingProfile(params.user.id);

  let organization: UserOrganizationSummary | null = null;

  if (profileBefore.orgId) {
    if (isPgliteTestAdapterEnabled()) {
      const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
      organization = await asPgliteUser(params.user.id, async (tx) => {
        const res = await tx.query<{
          id: string;
          name: string;
          type: OrganizationType;
          plan_key: string;
          plan_status: string;
          role: "owner" | "admin" | "member" | "viewer";
        }>(
          `select o.id, o.name, o.type, o.plan_key, o.plan_status, m.role
           from public.organizations o
           join public.memberships m on m.org_id = o.id and m.user_id = $2
           where o.id = $1`,
          [profileBefore.orgId, params.user.id]
        );
        const existing = res.rows[0];
        if (!existing) return null;

        await tx.query(`update public.organizations set name = $2, type = $3 where id = $1`, [
          existing.id,
          params.name,
          orgType,
        ]);

        return {
          orgId: existing.id,
          name: params.name,
          type: orgType,
          role: existing.role,
          planKey: existing.plan_key,
          planStatus: existing.plan_status,
        };
      });
    } else {
      const supabase = await createSupabaseServerClient();
      const { data: membership } = await supabase
        .from("memberships")
        .select("role, organizations!inner(id, name, type, plan_key, plan_status)")
        .eq("org_id", profileBefore.orgId)
        .eq("user_id", params.user.id)
        .maybeSingle();

      if (membership) {
        const orgRow = Array.isArray(membership.organizations)
          ? membership.organizations[0]
          : membership.organizations;
        if (orgRow) {
          await supabase
            .from("organizations")
            .update({ name: params.name, type: orgType })
            .eq("id", orgRow.id);

          organization = {
            orgId: orgRow.id,
            name: params.name,
            type: orgType,
            role: membership.role,
            planKey: orgRow.plan_key,
            planStatus: orgRow.plan_status,
          };
        }
      }
    }
  }

  if (!organization) {
    organization = await createOrganization({
      user: params.user,
      name: params.name,
      type: orgType,
    });
  }

  // Auto-create single IEC profile if entered on Step 1
  if (params.iecCode) {
    if (isPgliteTestAdapterEnabled()) {
      const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
      await asPgliteUser(params.user.id, async (tx) => {
        const dup = await tx.query<{ id: string }>(
          `select id from public.iec_profiles where org_id = $1 and iec_code = $2`,
          [organization.orgId, params.iecCode]
        );
        if (!dup.rows[0]) {
          const inserted = await tx.query<{ id: string }>(
            `insert into public.iec_profiles (org_id, iec_code, legal_name, gstin, is_demo)
             values ($1, $2, $3, $4, false)
             returning id`,
            [organization.orgId, params.iecCode, params.name, params.gstin]
          );
          if (inserted.rows[0]) {
            await tx.query(
              `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
               values ($1, $2, 'create', 'iec_profiles', $3, $4::jsonb)`,
              [
                organization.orgId,
                params.user.id,
                inserted.rows[0].id,
                JSON.stringify({ iec_code: params.iecCode }),
              ]
            );
          }
        }
      });
    } else {
      const supabase = await createSupabaseServerClient();
      const { data: dup } = await supabase
        .from("iec_profiles")
        .select("id")
        .eq("org_id", organization.orgId)
        .eq("iec_code", params.iecCode)
        .maybeSingle();

      if (!dup) {
        const { data: iecRow } = await supabase
          .from("iec_profiles")
          .insert({
            org_id: organization.orgId,
            iec_code: params.iecCode,
            legal_name: params.name,
            gstin: params.gstin,
            is_demo: false,
          })
          .select("id")
          .single();

        if (iecRow) {
          await supabase.from("audit_log").insert({
            org_id: organization.orgId,
            actor_id: params.user.id,
            action: "create",
            entity: "iec_profiles",
            entity_id: iecRow.id,
            diff: { iec_code: params.iecCode },
          });
        }
      }
    }
  }

  const nextStep = Math.max(2, profileBefore.currentStep);
  const profile = await updateOnboardingProgress({
    userId: params.user.id,
    orgId: organization.orgId,
    currentStep: nextStep,
  });

  await recordOnboardingEvent({
    userId: params.user.id,
    orgId: organization.orgId,
    eventType: "step_completed",
    stepNumber: 1,
    metadata: { roleChoice: params.roleChoice, hasIec: Boolean(params.iecCode) },
  });
  await recordOnboardingEvent({
    userId: params.user.id,
    orgId: organization.orgId,
    eventType: "step_viewed",
    stepNumber: nextStep,
  });

  return { organization, profile };
}

export async function updateOnboardingProgress(params: {
  userId: string;
  orgId?: string | null;
  currentStep?: number;
  preferences?: OnboardingPreferences;
  markCompleted?: boolean;
  markSkipped?: boolean;
  markTourCompleted?: boolean;
  replayTour?: boolean;
  dismissChecklist?: boolean;
}): Promise<OnboardingProfileState> {
  await getOrCreateOnboardingProfile(params.userId);
  const nowIso = new Date().toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      const currRes = await tx.query<{
        org_id: string | null;
        current_step: number;
        completed_at: string | null;
        skipped_at: string | null;
        preferences: unknown;
        tour_completed_at: string | null;
        checklist_dismissed_at: string | null;
      }>(
        `select org_id, current_step, completed_at::text, skipped_at::text,
                preferences, tour_completed_at::text, checklist_dismissed_at::text
         from public.onboarding_profiles
         where user_id = $1`,
        [params.userId]
      );
      const curr = currRes.rows[0];

      const nextOrgId = params.orgId !== undefined ? params.orgId : (curr?.org_id ?? null);
      const nextStep = params.currentStep ?? curr?.current_step ?? 1;
      const nextPrefs = params.preferences ?? normalizePreferences(curr?.preferences);
      const nextCompletedAt = params.markCompleted ? nowIso : (curr?.completed_at ?? null);
      const nextSkippedAt = params.markSkipped ? nowIso : (curr?.skipped_at ?? null);
      const nextTourCompletedAt = params.replayTour
        ? null
        : params.markTourCompleted
          ? nowIso
          : (curr?.tour_completed_at ?? null);
      const nextChecklistDismissedAt = params.dismissChecklist
        ? nowIso
        : (curr?.checklist_dismissed_at ?? null);

      await tx.query(
        `update public.onboarding_profiles
         set org_id = $2,
             current_step = $3,
             preferences = $4::jsonb,
             completed_at = $5,
             skipped_at = $6,
             tour_completed_at = $7,
             checklist_dismissed_at = $8
         where user_id = $1`,
        [
          params.userId,
          nextOrgId,
          nextStep,
          JSON.stringify(nextPrefs),
          nextCompletedAt,
          nextSkippedAt,
          nextTourCompletedAt,
          nextChecklistDismissedAt,
        ]
      );

      return {
        userId: params.userId,
        orgId: nextOrgId,
        currentStep: nextStep,
        completedAt: nextCompletedAt,
        skippedAt: nextSkippedAt,
        preferences: nextPrefs,
        tourCompletedAt: nextTourCompletedAt,
        checklistDismissedAt: nextChecklistDismissedAt,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: curr } = await supabase
    .from("onboarding_profiles")
    .select(
      "org_id, current_step, completed_at, skipped_at, preferences, tour_completed_at, checklist_dismissed_at"
    )
    .eq("user_id", params.userId)
    .single();

  const updatePayload = {
    org_id: params.orgId !== undefined ? params.orgId : (curr?.org_id ?? null),
    current_step: params.currentStep ?? curr?.current_step ?? 1,
    preferences: params.preferences ?? normalizePreferences(curr?.preferences),
    completed_at: params.markCompleted ? nowIso : (curr?.completed_at ?? null),
    skipped_at: params.markSkipped ? nowIso : (curr?.skipped_at ?? null),
    tour_completed_at: params.replayTour
      ? null
      : params.markTourCompleted
        ? nowIso
        : (curr?.tour_completed_at ?? null),
    checklist_dismissed_at: params.dismissChecklist
      ? nowIso
      : (curr?.checklist_dismissed_at ?? null),
  };

  await supabase.from("onboarding_profiles").update(updatePayload).eq("user_id", params.userId);

  return {
    userId: params.userId,
    orgId: updatePayload.org_id,
    currentStep: updatePayload.current_step,
    completedAt: updatePayload.completed_at,
    skippedAt: updatePayload.skipped_at,
    preferences: updatePayload.preferences,
    tourCompletedAt: updatePayload.tour_completed_at,
    checklistDismissedAt: updatePayload.checklist_dismissed_at,
  };
}

export async function createDemoWorkspaceForOrg(orgId: string): Promise<{
  iecId: string;
  alreadyExists: boolean;
}> {
  const access = await requireOrgAccess(orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const result = await asPgliteUser(access.user.id, async (tx) => {
      const existing = await tx.query<{ id: string }>(
        `select id from public.iec_profiles where org_id = $1 and is_demo = true limit 1`,
        [access.orgId]
      );
      if (existing.rows[0]) {
        return { iecId: existing.rows[0].id, alreadyExists: true };
      }

      const pack = buildSanitisedDemoPack(access.orgId, access.user.id);

      await tx.query(
        `insert into public.iec_profiles
           (id, org_id, iec_code, legal_name, gstin, ad_bank_name, default_currency, is_demo)
         values ($1, $2, $3, $4, $5, $6, $7, true)`,
        [
          pack.iec.id,
          pack.iec.orgId,
          pack.iec.iecCode,
          pack.iec.legalName,
          pack.iec.gstin,
          pack.iec.adBankName,
          pack.iec.defaultCurrency,
        ]
      );

      for (const doc of pack.documents) {
        await tx.query(
          `insert into public.documents
             (id, iec_id, kind, storage_path, sha256, original_name, parse_status, uploaded_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            doc.id,
            doc.iecId,
            doc.kind,
            doc.storagePath,
            doc.sha256,
            doc.originalName,
            doc.parseStatus,
            doc.uploadedBy,
          ]
        );
      }

      for (const sb of pack.shippingBills) {
        await tx.query(
          `insert into public.shipping_bills
             (id, iec_id, document_id, sb_number, sb_date, port_code, leo_date, invoice_no,
              buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, realisation_due_date)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            sb.id,
            sb.iecId,
            sb.documentId,
            sb.sbNumber,
            sb.sbDate,
            sb.portCode,
            sb.leoDate,
            sb.invoiceNo,
            sb.buyerName,
            sb.currency,
            sb.fobMinor,
            sb.exchangeRate,
            sb.schemesClaimed,
            sb.status,
            sb.realisationDueDate,
          ]
        );
      }

      for (const item of pack.items) {
        await tx.query(
          `insert into public.shipping_bill_items
             (id, shipping_bill_id, hs_code, description, quantity, uqc, fob_minor, field_confidence)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            item.id,
            item.shippingBillId,
            item.hsCode,
            item.description,
            item.quantity,
            item.uqc,
            item.fobMinor,
            JSON.stringify(item.fieldConfidence),
          ]
        );
      }

      for (const irm of pack.remittances) {
        await tx.query(
          `insert into public.remittances
             (id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor, utilised_minor, raw)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            irm.id,
            irm.iecId,
            irm.irmNumber,
            irm.bankName,
            irm.remittanceDate,
            irm.currency,
            irm.amountMinor,
            irm.utilisedMinor,
            JSON.stringify(irm.raw),
          ]
        );
      }

      for (const match of pack.matches) {
        await tx.query(
          `insert into public.sb_remittance_matches
             (id, shipping_bill_id, remittance_id, matched_minor, method, confidence, confirmed_by)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            match.id,
            match.shippingBillId,
            match.remittanceId,
            match.matchedMinor,
            match.method,
            match.confidence,
            match.confirmedBy,
          ]
        );
      }

      for (const exp of pack.expectations) {
        await tx.query(
          `insert into public.incentive_expectations
             (id, shipping_bill_id, scheme, expected_minor, rate_id, calc_detail)
           values ($1, $2, $3, $4, null, $5::jsonb)`,
          [
            exp.id,
            exp.shippingBillId,
            exp.scheme,
            exp.expectedMinor,
            JSON.stringify(exp.calcDetail),
          ]
        );
      }

      for (const cred of pack.credits) {
        await tx.query(
          `insert into public.incentive_credits
             (id, shipping_bill_id, scheme, credited_minor, credited_on, source_document_id)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            cred.id,
            cred.shippingBillId,
            cred.scheme,
            cred.creditedMinor,
            cred.creditedOn,
            cred.sourceDocumentId,
          ]
        );
      }

      for (const scrip of pack.scrips) {
        await tx.query(
          `insert into public.scrips
             (id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            scrip.id,
            scrip.iecId,
            scrip.scripNumber,
            scrip.scheme,
            scrip.faceMinor,
            scrip.generatedOn,
            scrip.expiresOn,
            scrip.status,
          ]
        );
      }

      for (const alert of pack.alerts) {
        await tx.query(
          `insert into public.alerts
             (id, iec_id, kind, severity, shipping_bill_id, due_on)
           values ($1, $2, $3, $4, $5, $6)`,
          [alert.id, alert.iecId, alert.kind, alert.severity, alert.shippingBillId, alert.dueOn]
        );
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create_demo_workspace', 'iec_profiles', $3, $4::jsonb)`,
        [access.orgId, access.user.id, pack.iec.id, JSON.stringify({ iec_code: DEMO_IEC_CODE })]
      );

      await tx.query(
        `insert into public.onboarding_events (user_id, org_id, event_type, step_number, metadata)
         values ($1, $2, 'demo_created', 3, $3::jsonb)`,
        [access.user.id, access.orgId, JSON.stringify({ iec_id: pack.iec.id })]
      );

      return { iecId: pack.iec.id, alreadyExists: false };
    });

    await updateOnboardingProgress({
      userId: access.user.id,
      orgId: access.orgId,
      currentStep: 4,
    });
    return result;
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("iec_profiles")
    .select("id")
    .eq("org_id", access.orgId)
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await updateOnboardingProgress({
      userId: access.user.id,
      orgId: access.orgId,
      currentStep: 4,
    });
    return { iecId: existing.id, alreadyExists: true };
  }

  const pack = buildSanitisedDemoPack(access.orgId, access.user.id);

  const { error: iecErr } = await supabase.from("iec_profiles").insert({
    id: pack.iec.id,
    org_id: pack.iec.orgId,
    iec_code: pack.iec.iecCode,
    legal_name: pack.iec.legalName,
    gstin: pack.iec.gstin,
    ad_bank_name: pack.iec.adBankName,
    default_currency: pack.iec.defaultCurrency,
    is_demo: true,
  });

  if (iecErr) {
    throw new ValidationError("Could not create sample demo workspace.");
  }

  await supabase.from("documents").insert(
    pack.documents.map((doc) => ({
      id: doc.id,
      iec_id: doc.iecId,
      kind: doc.kind,
      storage_path: doc.storagePath,
      sha256: doc.sha256,
      original_name: doc.originalName,
      parse_status: doc.parseStatus,
      uploaded_by: doc.uploadedBy,
    }))
  );

  await supabase.from("shipping_bills").insert(
    pack.shippingBills.map((sb) => ({
      id: sb.id,
      iec_id: sb.iecId,
      document_id: sb.documentId,
      sb_number: sb.sbNumber,
      sb_date: sb.sbDate,
      port_code: sb.portCode,
      leo_date: sb.leoDate,
      invoice_no: sb.invoiceNo,
      buyer_name: sb.buyerName,
      currency: sb.currency,
      fob_minor: sb.fobMinor,
      exchange_rate: String(sb.exchangeRate),
      schemes_claimed: sb.schemesClaimed,
      status: sb.status,
      realisation_due_date: sb.realisationDueDate,
    }))
  );

  await supabase.from("shipping_bill_items").insert(
    pack.items.map((item) => ({
      id: item.id,
      shipping_bill_id: item.shippingBillId,
      hs_code: item.hsCode,
      description: item.description,
      quantity: String(item.quantity),
      uqc: item.uqc,
      fob_minor: item.fobMinor,
      field_confidence: item.fieldConfidence as Json,
    }))
  );

  await supabase.from("remittances").insert(
    pack.remittances.map((irm) => ({
      id: irm.id,
      iec_id: irm.iecId,
      irm_number: irm.irmNumber,
      bank_name: irm.bankName,
      remittance_date: irm.remittanceDate,
      currency: irm.currency,
      amount_minor: irm.amountMinor,
      utilised_minor: irm.utilisedMinor,
      raw: irm.raw as Json,
    }))
  );

  await supabase.from("sb_remittance_matches").insert(
    pack.matches.map((match) => ({
      id: match.id,
      shipping_bill_id: match.shippingBillId,
      remittance_id: match.remittanceId,
      matched_minor: match.matchedMinor,
      method: match.method,
      confidence: String(match.confidence),
      confirmed_by: match.confirmedBy,
    }))
  );

  await supabase.from("incentive_expectations").insert(
    pack.expectations.map((exp) => ({
      id: exp.id,
      shipping_bill_id: exp.shippingBillId,
      scheme: exp.scheme,
      expected_minor: exp.expectedMinor,
      rate_id: null,
      calc_detail: exp.calcDetail as Json,
    }))
  );

  await supabase.from("incentive_credits").insert(
    pack.credits.map((cred) => ({
      id: cred.id,
      shipping_bill_id: cred.shippingBillId,
      scheme: cred.scheme,
      credited_minor: cred.creditedMinor,
      credited_on: cred.creditedOn,
      source_document_id: cred.sourceDocumentId,
    }))
  );

  await supabase.from("scrips").insert(
    pack.scrips.map((scrip) => ({
      id: scrip.id,
      iec_id: scrip.iecId,
      scrip_number: scrip.scripNumber,
      scheme: scrip.scheme,
      face_minor: scrip.faceMinor,
      generated_on: scrip.generatedOn,
      expires_on: scrip.expiresOn,
      status: scrip.status,
    }))
  );

  await supabase.from("alerts").insert(
    pack.alerts.map((alert) => ({
      id: alert.id,
      iec_id: alert.iecId,
      kind: alert.kind,
      severity: alert.severity,
      shipping_bill_id: alert.shippingBillId,
      due_on: alert.dueOn,
    }))
  );

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "create_demo_workspace",
    entity: "iec_profiles",
    entity_id: pack.iec.id,
    diff: { iec_code: DEMO_IEC_CODE },
  });

  await recordOnboardingEvent({
    userId: access.user.id,
    orgId: access.orgId,
    eventType: "demo_created",
    stepNumber: 3,
    metadata: { iec_id: pack.iec.id },
  });

  await updateOnboardingProgress({
    userId: access.user.id,
    orgId: access.orgId,
    currentStep: 4,
  });

  return { iecId: pack.iec.id, alreadyExists: false };
}

export async function deleteDemoWorkspaceForOrg(orgId: string): Promise<{ deletedCount: number }> {
  const access = await requireOrgAccess(orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const deleted = await tx.query<{ id: string }>(
        `delete from public.iec_profiles
         where org_id = $1 and is_demo = true
         returning id`,
        [access.orgId]
      );

      if (deleted.rows.length > 0) {
        await tx.query(
          `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
           values ($1, $2, 'delete_demo_workspace', 'iec_profiles', $3, $4::jsonb)`,
          [
            access.orgId,
            access.user.id,
            deleted.rows[0]!.id,
            JSON.stringify({ count: deleted.rows.length }),
          ]
        );
        await tx.query(
          `insert into public.onboarding_events (user_id, org_id, event_type, metadata)
           values ($1, $2, 'demo_deleted', $3::jsonb)`,
          [access.user.id, access.orgId, JSON.stringify({ count: deleted.rows.length })]
        );
      }

      return { deletedCount: deleted.rows.length };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: deleted, error } = await supabase
    .from("iec_profiles")
    .delete()
    .eq("org_id", access.orgId)
    .eq("is_demo", true)
    .select("id");

  if (error) {
    throw new ForbiddenError("Could not delete sample demo workspace.");
  }

  const deletedCount = deleted?.length ?? 0;
  if (deletedCount > 0) {
    await supabase.from("audit_log").insert({
      org_id: access.orgId,
      actor_id: access.user.id,
      action: "delete_demo_workspace",
      entity: "iec_profiles",
      entity_id: deleted![0]!.id,
      diff: { count: deletedCount },
    });
    await recordOnboardingEvent({
      userId: access.user.id,
      orgId: access.orgId,
      eventType: "demo_deleted",
      metadata: { count: deletedCount },
    });
  }

  return { deletedCount };
}

export async function getDashboardSummary(
  orgId: string,
  activeIecId?: string | null
): Promise<DashboardSummary> {
  const access = await requireOrgAccess(orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const [orgRes, obRes, iecsRes] = await Promise.all([
        tx.query<{ plan_key: string; trial_ends_at: string | null }>(
          `select plan_key, trial_ends_at::text from public.organizations where id = $1`,
          [access.orgId]
        ),
        tx.query<{ tour_completed_at: string | null; checklist_dismissed_at: string | null }>(
          `select tour_completed_at::text, checklist_dismissed_at::text
           from public.onboarding_profiles
           where user_id = $1`,
          [access.user.id]
        ),
        tx.query<{ id: string; iec_code: string; is_demo: boolean }>(
          `select id, iec_code, is_demo
           from public.iec_profiles
           where org_id = $1
           order by created_at asc`,
          [access.orgId]
        ),
      ]);

      const scopedIecIds = activeIecId
        ? iecsRes.rows.filter((i) => i.id === activeIecId).map((i) => i.id)
        : iecsRes.rows.map((i) => i.id);
      const effectiveIecIds =
        scopedIecIds.length > 0 ? scopedIecIds : iecsRes.rows.map((i) => i.id);

      const realIecIds = iecsRes.rows.filter((i) => !i.is_demo).map((i) => i.id);

      if (effectiveIecIds.length === 0) {
        return computeDashboardSummary({
          orgId: access.orgId,
          planKey: orgRes.rows[0]?.plan_key ?? "free",
          trialEndsAt: orgRes.rows[0]?.trial_ends_at ?? null,
          checklistDismissedAt: obRes.rows[0]?.checklist_dismissed_at ?? null,
          tourCompletedAt: obRes.rows[0]?.tour_completed_at ?? null,
          iecs: iecsRes.rows,
          documents: [],
          shippingBills: [],
          realRemittanceCount: 0,
          realMatchesCount: 0,
          expectations: [],
          credits: [],
          scrips: [],
          alerts: [],
        });
      }

      const [docsRes, sbsRes, remRes, matchesRes, expRes, credRes, scripsRes, alertsRes] =
        await Promise.all([
          tx.query<{ iec_id: string; kind: string }>(
            `select iec_id, kind from public.documents
             where iec_id = any($1::uuid[]) and deleted_at is null`,
            [effectiveIecIds]
          ),
          tx.query<{
            id: string;
            iec_id: string;
            sb_number: string;
            sb_date: string;
            port_code: string;
            buyer_name: string | null;
            currency: string;
            fob_minor: string;
            status: ShippingBillStatus;
            realisation_due_date: string | null;
          }>(
            `select id, iec_id, sb_number, sb_date::text, port_code, buyer_name, currency,
                    fob_minor::text, status, realisation_due_date::text
             from public.shipping_bills
             where iec_id = any($1::uuid[])
             order by sb_date desc, created_at desc`,
            [effectiveIecIds]
          ),
          realIecIds.length > 0
            ? tx.query<{ count: string }>(
                `select count(*)::text as count from public.remittances where iec_id = any($1::uuid[])`,
                [realIecIds]
              )
            : Promise.resolve({ rows: [{ count: "0" }] }),
          realIecIds.length > 0
            ? tx.query<{ count: string }>(
                `select count(*)::text as count
                 from public.sb_remittance_matches m
                 join public.shipping_bills sb on sb.id = m.shipping_bill_id
                 where sb.iec_id = any($1::uuid[])`,
                [realIecIds]
              )
            : Promise.resolve({ rows: [{ count: "0" }] }),
          tx.query<{ shipping_bill_id: string; expected_minor: string }>(
            `select e.shipping_bill_id, e.expected_minor::text
             from public.incentive_expectations e
             join public.shipping_bills sb on sb.id = e.shipping_bill_id
             where sb.iec_id = any($1::uuid[])`,
            [effectiveIecIds]
          ),
          tx.query<{ shipping_bill_id: string; credited_minor: string }>(
            `select c.shipping_bill_id, c.credited_minor::text
             from public.incentive_credits c
             join public.shipping_bills sb on sb.id = c.shipping_bill_id
             where sb.iec_id = any($1::uuid[])`,
            [effectiveIecIds]
          ),
          tx.query<{ face_minor: string; expires_on: string | null; status: string }>(
            `select face_minor::text, expires_on::text, status
             from public.scrips
             where iec_id = any($1::uuid[])`,
            [effectiveIecIds]
          ),
          tx.query<{
            id: string;
            iec_id: string;
            kind: string;
            severity: AlertSeverity;
            due_on: string | null;
            shipping_bill_id: string | null;
          }>(
            `select id, iec_id, kind, severity, due_on::text, shipping_bill_id
             from public.alerts
             where iec_id = any($1::uuid[]) and resolved_at is null
             order by due_on asc nulls last`,
            [effectiveIecIds]
          ),
        ]);

      return computeDashboardSummary({
        orgId: access.orgId,
        planKey: orgRes.rows[0]?.plan_key ?? "free",
        trialEndsAt: orgRes.rows[0]?.trial_ends_at ?? null,
        checklistDismissedAt: obRes.rows[0]?.checklist_dismissed_at ?? null,
        tourCompletedAt: obRes.rows[0]?.tour_completed_at ?? null,
        iecs: iecsRes.rows,
        documents: docsRes.rows,
        shippingBills: sbsRes.rows,
        realRemittanceCount: Number(remRes.rows[0]?.count ?? 0),
        realMatchesCount: Number(matchesRes.rows[0]?.count ?? 0),
        expectations: expRes.rows,
        credits: credRes.rows,
        scrips: scripsRes.rows,
        alerts: alertsRes.rows,
      });
    });
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: orgRow }, { data: obRow }, { data: iecRows }] = await Promise.all([
    supabase
      .from("organizations")
      .select("plan_key, trial_ends_at")
      .eq("id", access.orgId)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("tour_completed_at, checklist_dismissed_at")
      .eq("user_id", access.user.id)
      .maybeSingle(),
    supabase
      .from("iec_profiles")
      .select("id, iec_code, is_demo")
      .eq("org_id", access.orgId)
      .order("created_at", { ascending: true }),
  ]);

  const iecs = iecRows ?? [];
  const realIecIds = iecs.filter((i) => !i.is_demo).map((i) => i.id);
  const scopedIds = activeIecId ? iecs.filter((i) => i.id === activeIecId).map((i) => i.id) : [];
  const effectiveIecIds = scopedIds.length > 0 ? scopedIds : iecs.map((i) => i.id);

  if (effectiveIecIds.length === 0) {
    return computeDashboardSummary({
      orgId: access.orgId,
      planKey: orgRow?.plan_key ?? "free",
      trialEndsAt: orgRow?.trial_ends_at ?? null,
      checklistDismissedAt: obRow?.checklist_dismissed_at ?? null,
      tourCompletedAt: obRow?.tour_completed_at ?? null,
      iecs,
      documents: [],
      shippingBills: [],
      realRemittanceCount: 0,
      realMatchesCount: 0,
      expectations: [],
      credits: [],
      scrips: [],
      alerts: [],
    });
  }

  const [docsRes, sbsRes, remRes, scripsRes, alertsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("iec_id, kind")
      .in("iec_id", effectiveIecIds)
      .is("deleted_at", null),
    supabase
      .from("shipping_bills")
      .select(
        "id, iec_id, sb_number, sb_date, port_code, buyer_name, currency, fob_minor, status, realisation_due_date"
      )
      .in("iec_id", effectiveIecIds)
      .order("sb_date", { ascending: false }),
    realIecIds.length > 0
      ? supabase
          .from("remittances")
          .select("id", { count: "exact", head: true })
          .in("iec_id", realIecIds)
      : Promise.resolve({ count: 0 }),
    supabase.from("scrips").select("face_minor, expires_on, status").in("iec_id", effectiveIecIds),
    supabase
      .from("alerts")
      .select("id, iec_id, kind, severity, due_on, shipping_bill_id")
      .in("iec_id", effectiveIecIds)
      .is("resolved_at", null)
      .order("due_on", { ascending: true }),
  ]);

  const sbRows = sbsRes.data ?? [];
  const sbIds = sbRows.map((sb) => sb.id);
  const realSbIds = sbRows.filter((sb) => realIecIds.includes(sb.iec_id)).map((sb) => sb.id);
  let realMatchesCount = 0;
  let expectations: Array<{ shipping_bill_id: string; expected_minor: number }> = [];
  let credits: Array<{ shipping_bill_id: string; credited_minor: number }> = [];

  if (sbIds.length > 0) {
    const [mRes, eRes, cRes] = await Promise.all([
      realSbIds.length > 0
        ? supabase
            .from("sb_remittance_matches")
            .select("id", { count: "exact", head: true })
            .in("shipping_bill_id", realSbIds)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("incentive_expectations")
        .select("shipping_bill_id, expected_minor")
        .in("shipping_bill_id", sbIds),
      supabase
        .from("incentive_credits")
        .select("shipping_bill_id, credited_minor")
        .in("shipping_bill_id", sbIds),
    ]);
    realMatchesCount = mRes.count ?? 0;
    expectations = eRes.data ?? [];
    credits = cRes.data ?? [];
  }

  return computeDashboardSummary({
    orgId: access.orgId,
    planKey: orgRow?.plan_key ?? "free",
    trialEndsAt: orgRow?.trial_ends_at ?? null,
    checklistDismissedAt: obRow?.checklist_dismissed_at ?? null,
    tourCompletedAt: obRow?.tour_completed_at ?? null,
    iecs,
    documents: docsRes.data ?? [],
    shippingBills: sbRows,
    realRemittanceCount: remRes.count ?? 0,
    realMatchesCount,
    expectations,
    credits,
    scrips: scripsRes.data ?? [],
    alerts: alertsRes.data ?? [],
  });
}
