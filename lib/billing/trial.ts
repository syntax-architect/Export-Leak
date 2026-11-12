import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface StartTrialResult {
  started: boolean;
  alreadyTrialingOrPaid: boolean;
  reason?: string;
  trialEndsAt: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Starts the 7-day card-free Pro trial automatically after a user's first real
 * upload. Idempotent and limited to once per organization and once per real IEC.
 */
export async function startTrial(orgId: string, actorId: string | null): Promise<StartTrialResult> {
  const trialEndsIso = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    return db.transaction(async (tx) => {
      const orgRes = await tx.query<{
        id: string;
        plan_key: string;
        trial_ends_at: string | null;
      }>(`select id, plan_key, trial_ends_at from public.organizations where id = $1`, [orgId]);

      const org = orgRes.rows[0];
      if (!org) {
        return {
          started: false,
          alreadyTrialingOrPaid: false,
          reason: "Organization not found.",
          trialEndsAt: null,
        };
      }

      if (org.plan_key !== "free") {
        return {
          started: false,
          alreadyTrialingOrPaid: true,
          trialEndsAt: org.trial_ends_at,
        };
      }

      if (org.trial_ends_at) {
        return {
          started: false,
          alreadyTrialingOrPaid: true,
          reason: "This organization has already used its 7-day Pro trial.",
          trialEndsAt: org.trial_ends_at,
        };
      }

      const priorIecTrial = await tx.query<{ count: string }>(
        `select count(*)::text as count
         from public.iec_profiles p_curr
         join public.iec_profiles p_prev
           on upper(p_prev.iec_code) = upper(p_curr.iec_code)
          and p_prev.org_id <> p_curr.org_id
         join public.organizations o_prev
           on o_prev.id = p_prev.org_id
         where p_curr.org_id = $1
           and p_curr.is_demo = false
           and o_prev.trial_ends_at is not null`,
        [orgId]
      );

      if (Number(priorIecTrial.rows[0]?.count ?? 0) > 0) {
        return {
          started: false,
          alreadyTrialingOrPaid: false,
          reason: "A 7-day trial was already used for this IEC code.",
          trialEndsAt: null,
        };
      }

      await tx.query(
        `update public.organizations
         set plan_key = 'trial_pro', trial_ends_at = $2
         where id = $1`,
        [orgId, trialEndsIso]
      );

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'trial_started', 'organizations', $1, $3::jsonb)`,
        [orgId, actorId, JSON.stringify({ plan_key: "trial_pro", trial_ends_at: trialEndsIso })]
      );

      return {
        started: true,
        alreadyTrialingOrPaid: false,
        trialEndsAt: trialEndsIso,
      };
    });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: org } = await service
    .from("organizations")
    .select("id, plan_key, trial_ends_at")
    .eq("id", orgId)
    .single();

  if (!org) {
    return {
      started: false,
      alreadyTrialingOrPaid: false,
      reason: "Organization not found.",
      trialEndsAt: null,
    };
  }

  if (org.plan_key !== "free") {
    return {
      started: false,
      alreadyTrialingOrPaid: true,
      trialEndsAt: org.trial_ends_at,
    };
  }

  if (org.trial_ends_at) {
    return {
      started: false,
      alreadyTrialingOrPaid: true,
      reason: "This organization has already used its 7-day Pro trial.",
      trialEndsAt: org.trial_ends_at,
    };
  }

  const { data: orgIecs } = await service
    .from("iec_profiles")
    .select("iec_code")
    .eq("org_id", orgId)
    .eq("is_demo", false);

  const codes = (orgIecs ?? []).map((row) => row.iec_code);
  if (codes.length > 0) {
    const { data: matchingOther } = await service
      .from("iec_profiles")
      .select("org_id")
      .in("iec_code", codes)
      .neq("org_id", orgId);

    const otherOrgIds = [...new Set((matchingOther ?? []).map((row) => row.org_id))];
    if (otherOrgIds.length > 0) {
      const { count } = await service
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .in("id", otherOrgIds)
        .not("trial_ends_at", "is", null);

      if ((count ?? 0) > 0) {
        return {
          started: false,
          alreadyTrialingOrPaid: false,
          reason: "A 7-day trial was already used for this IEC code.",
          trialEndsAt: null,
        };
      }
    }
  }

  const { error: updateError } = await service
    .from("organizations")
    .update({ plan_key: "trial_pro", trial_ends_at: trialEndsIso })
    .eq("id", orgId);

  if (updateError) {
    return {
      started: false,
      alreadyTrialingOrPaid: false,
      reason: "Could not start trial.",
      trialEndsAt: null,
    };
  }

  await service.from("audit_log").insert({
    org_id: orgId,
    actor_id: actorId,
    action: "trial_started",
    entity: "organizations",
    entity_id: orgId,
    diff: { plan_key: "trial_pro", trial_ends_at: trialEndsIso },
  });

  return {
    started: true,
    alreadyTrialingOrPaid: false,
    trialEndsAt: trialEndsIso,
  };
}
