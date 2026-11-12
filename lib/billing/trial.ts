import type { PlanKey } from "@/config/plans";
import { NotFoundError, ValidationError } from "@/lib/auth/errors";
import {
  getTrialCountdown,
  TRIAL_DURATION_DAYS,
  type TrialCountdown,
} from "@/lib/billing/trial-countdown";
import type { BillingEventType, Json, TrialNotificationKind } from "@/lib/database.types";
import { formatMoney } from "@/lib/format";
import { getAppBaseUrl, sendTransactionalEmail } from "@/lib/notifications/email";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export { getTrialCountdown, TRIAL_DURATION_DAYS, type TrialCountdown };

export interface StartTrialResult {
  started: boolean;
  alreadyTrialingOrPaid: boolean;
  reason?: string;
  trialEndsAt: string | null;
}

export interface ExtendTrialResult {
  orgId: string;
  planKey: PlanKey;
  daysAdded: number;
  previousTrialEndsAt: string | null;
  trialEndsAt: string;
}

export interface ConvertTrialResult {
  orgId: string;
  planKey: PlanKey;
  wasTrial: boolean;
  convertedAt: string;
}

export interface DailyTrialJobResult {
  checkedCount: number;
  day5RemindersProcessed: number;
  expiredCount: number;
  downgradedOrgIds: string[];
  errors: Array<{ orgId: string; message: string }>;
}

interface OrgTrialRow {
  id: string;
  name: string;
  plan_key: string;
  plan_status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_converted_at: string | null;
}

interface NotificationTemplateRow {
  key: string;
  channel: "email" | "whatsapp";
  subject: string | null;
  body_template: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = TRIAL_DURATION_DAYS * MS_PER_DAY;
const DAY_5_REMAINING_THRESHOLD_MS = 2 * MS_PER_DAY;

const FALLBACK_TEMPLATES: Record<string, NotificationTemplateRow> = {
  trial_day_5_email: {
    key: "trial_day_5_email",
    channel: "email",
    subject: "Your 7-day Pro trial ends soon — see what you found",
    body_template:
      "Hi {{orgName}}, you have {{unclaimedFormatted}} in unclaimed incentives flagged during your ExportLeak Pro trial. Choose a plan to keep Bulk eBRC export and reports unlocked: {{upgradeUrl}}",
  },
  trial_day_7_email: {
    key: "trial_day_7_email",
    channel: "email",
    subject: "Your 7-day Pro trial has ended — your data stays safe",
    body_template:
      "Hi {{orgName}}, your 7-day Pro trial ended today and your workspace moved gently to the Free plan. All existing files and {{unclaimedFormatted}} in unclaimed incentives flagged remain readable. Upgrade anytime here: {{upgradeUrl}}",
  },
  trial_day_5_whatsapp: {
    key: "trial_day_5_whatsapp",
    channel: "whatsapp",
    subject: null,
    body_template:
      "ExportLeak reminder for {{orgName}}: {{daysLeftText}} on your Pro trial. You have {{unclaimedFormatted}} in unclaimed incentives flagged. Choose a plan: {{upgradeUrl}}",
  },
  trial_day_7_whatsapp: {
    key: "trial_day_7_whatsapp",
    channel: "whatsapp",
    subject: null,
    body_template:
      "ExportLeak update for {{orgName}}: Your 7-day Pro trial has ended and your workspace moved to Free (all data kept readable). You have {{unclaimedFormatted}} in unclaimed incentives flagged. Upgrade: {{upgradeUrl}}",
  },
};

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

function buildUpgradeUrl(): string {
  return `${getAppBaseUrl()}/app/billing?highlight=exporter_monthly`;
}

function sumUnclaimedFromExpectationsAndCredits(
  expectations: Array<{ shipping_bill_id: string; scheme: string; expected_minor: number }>,
  credits: Array<{ shipping_bill_id: string; scheme: string; credited_minor: number }>
): number {
  const creditByKey = new Map<string, number>();
  for (const row of credits) {
    const key = `${row.shipping_bill_id}:${row.scheme}`;
    creditByKey.set(key, (creditByKey.get(key) ?? 0) + Number(row.credited_minor || 0));
  }

  let unclaimed = 0;
  const seenKeys = new Set<string>();
  const expectedByKey = new Map<string, number>();
  for (const row of expectations) {
    const key = `${row.shipping_bill_id}:${row.scheme}`;
    seenKeys.add(key);
    expectedByKey.set(key, (expectedByKey.get(key) ?? 0) + Number(row.expected_minor || 0));
  }

  for (const key of seenKeys) {
    const expected = expectedByKey.get(key) ?? 0;
    const credited = creditByKey.get(key) ?? 0;
    if (expected > credited) {
      unclaimed += expected - credited;
    }
  }
  return Math.max(0, Math.trunc(unclaimed));
}

function buildRenderedMessages(params: {
  kind: TrialNotificationKind;
  orgName: string;
  unclaimedPaise: number;
  trialEndsAt: string;
  now: Date;
  templates: Map<string, NotificationTemplateRow>;
}): {
  upgradeUrl: string;
  emailSubject: string;
  emailBody: string;
  whatsappBody: string;
} {
  const upgradeUrl = buildUpgradeUrl();
  const unclaimedFormatted = formatMoney(params.unclaimedPaise, "INR", {
    showCode: false,
    showDecimals: "never",
  });
  const countdown = getTrialCountdown(params.trialEndsAt, params.now);
  const daysLeftText = countdown.isActive
    ? `${countdown.daysLeft} ${countdown.daysLeft === 1 ? "day" : "days"} left`
    : "0 days left";

  const vars: Record<string, string> = {
    orgName: params.orgName,
    unclaimedFormatted,
    daysLeftText,
    upgradeUrl,
  };

  const emailKey = params.kind === "trial_day_5" ? "trial_day_5_email" : "trial_day_7_email";
  const waKey = params.kind === "trial_day_5" ? "trial_day_5_whatsapp" : "trial_day_7_whatsapp";

  const emailTpl = params.templates.get(emailKey) ?? FALLBACK_TEMPLATES[emailKey]!;
  const waTpl = params.templates.get(waKey) ?? FALLBACK_TEMPLATES[waKey]!;

  return {
    upgradeUrl,
    emailSubject: renderTemplate(emailTpl.subject ?? "ExportLeak Pro Trial Update", vars),
    emailBody: renderTemplate(emailTpl.body_template, vars),
    whatsappBody: renderTemplate(waTpl.body_template, vars),
  };
}

/**
 * Starts the 7-day card-free Pro trial automatically after a user's first real
 * upload. Idempotent and limited to once per organization and once per real IEC.
 */
export async function startTrial(
  orgId: string,
  actorId: string | null,
  options?: { now?: Date }
): Promise<StartTrialResult> {
  const now = options?.now ?? new Date();
  const trialStartedIso = now.toISOString();
  const trialEndsIso = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    return db.transaction(async (tx) => {
      const orgRes = await tx.query<{
        id: string;
        plan_key: string;
        trial_started_at: string | null;
        trial_ends_at: string | null;
      }>(
        `select id, plan_key, trial_started_at::text, trial_ends_at::text
         from public.organizations
         where id = $1`,
        [orgId]
      );

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
          reason:
            org.plan_key === "trial_pro"
              ? "Your 7-day Pro trial is already active."
              : "This organization is already on a paid plan.",
          trialEndsAt: org.trial_ends_at,
        };
      }

      if (org.trial_ends_at || org.trial_started_at) {
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
           and p_prev.is_demo = false
           and (o_prev.trial_ends_at is not null or o_prev.trial_started_at is not null)`,
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
         set plan_key = 'trial_pro',
             plan_status = 'active',
             trial_started_at = $2,
             trial_ends_at = $3
         where id = $1`,
        [orgId, trialStartedIso, trialEndsIso]
      );

      const eventMeta = JSON.stringify({
        plan_key: "trial_pro",
        trial_started_at: trialStartedIso,
        trial_ends_at: trialEndsIso,
      });

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'trial_started', 'organizations', $1, $3::jsonb)`,
        [orgId, actorId, eventMeta]
      );

      await tx.query(
        `insert into public.billing_events (org_id, actor_id, event_type, metadata)
         values ($1, $2, 'trial_started', $3::jsonb)`,
        [orgId, actorId, eventMeta]
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
    .select("id, plan_key, trial_started_at, trial_ends_at")
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
      reason:
        org.plan_key === "trial_pro"
          ? "Your 7-day Pro trial is already active."
          : "This organization is already on a paid plan.",
      trialEndsAt: org.trial_ends_at,
    };
  }

  if (org.trial_ends_at || org.trial_started_at) {
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

  const codes = [...new Set((orgIecs ?? []).map((row) => row.iec_code.trim().toUpperCase()))];
  if (codes.length > 0) {
    const { data: matchingOther } = await service
      .from("iec_profiles")
      .select("org_id")
      .in("iec_code", codes)
      .eq("is_demo", false)
      .neq("org_id", orgId);

    const otherOrgIds = [...new Set((matchingOther ?? []).map((row) => row.org_id))];
    if (otherOrgIds.length > 0) {
      const { count } = await service
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .in("id", otherOrgIds)
        .or("trial_ends_at.not.is.null,trial_started_at.not.is.null");

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
    .update({
      plan_key: "trial_pro",
      plan_status: "active",
      trial_started_at: trialStartedIso,
      trial_ends_at: trialEndsIso,
    })
    .eq("id", orgId);

  if (updateError) {
    return {
      started: false,
      alreadyTrialingOrPaid: false,
      reason: "Could not start trial.",
      trialEndsAt: null,
    };
  }

  const diffPayload = {
    plan_key: "trial_pro",
    trial_started_at: trialStartedIso,
    trial_ends_at: trialEndsIso,
  };

  await Promise.all([
    service.from("audit_log").insert({
      org_id: orgId,
      actor_id: actorId,
      action: "trial_started",
      entity: "organizations",
      entity_id: orgId,
      diff: diffPayload,
    }),
    service.from("billing_events").insert({
      org_id: orgId,
      actor_id: actorId,
      event_type: "trial_started",
      metadata: diffPayload,
    }),
  ]);

  return {
    started: true,
    alreadyTrialingOrPaid: false,
    trialEndsAt: trialEndsIso,
  };
}

async function resolveOwnerRecipientPglite(
  db: { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  orgId: string
): Promise<{ userId: string | null; email: string | null }> {
  const res = await db.query<{ user_id: string; email: string | null }>(
    `select m.user_id, u.email
     from public.memberships m
     left join auth.users u on u.id = m.user_id
     where m.org_id = $1
     order by case m.role
       when 'owner' then 1
       when 'admin' then 2
       when 'member' then 3
       else 4
     end asc, m.created_at asc
     limit 1`,
    [orgId]
  );
  return {
    userId: res.rows[0]?.user_id ?? null,
    email: res.rows[0]?.email ?? null,
  };
}

async function computeUnclaimedPaisePglite(
  db: { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  orgId: string
): Promise<number> {
  const [expRes, credRes] = await Promise.all([
    db.query<{ shipping_bill_id: string; scheme: string; expected_minor: string | number }>(
      `select ie.shipping_bill_id, ie.scheme, ie.expected_minor
       from public.incentive_expectations ie
       join public.shipping_bills sb on sb.id = ie.shipping_bill_id
       join public.iec_profiles p on p.id = sb.iec_id
       where p.org_id = $1 and p.is_demo = false`,
      [orgId]
    ),
    db.query<{ shipping_bill_id: string; scheme: string; credited_minor: string | number }>(
      `select ic.shipping_bill_id, ic.scheme, ic.credited_minor
       from public.incentive_credits ic
       join public.shipping_bills sb on sb.id = ic.shipping_bill_id
       join public.iec_profiles p on p.id = sb.iec_id
       where p.org_id = $1 and p.is_demo = false`,
      [orgId]
    ),
  ]);

  return sumUnclaimedFromExpectationsAndCredits(
    expRes.rows.map((r) => ({
      shipping_bill_id: r.shipping_bill_id,
      scheme: r.scheme,
      expected_minor: Number(r.expected_minor),
    })),
    credRes.rows.map((r) => ({
      shipping_bill_id: r.shipping_bill_id,
      scheme: r.scheme,
      credited_minor: Number(r.credited_minor),
    }))
  );
}

async function computeUnclaimedPaiseSupabase(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  orgId: string
): Promise<number> {
  const { data: iecRows } = await service
    .from("iec_profiles")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_demo", false);

  const iecIds = (iecRows ?? []).map((row) => row.id);
  if (iecIds.length === 0) return 0;

  const { data: sbRows } = await service.from("shipping_bills").select("id").in("iec_id", iecIds);

  const sbIds = (sbRows ?? []).map((row) => row.id);
  if (sbIds.length === 0) return 0;

  const [{ data: expRows }, { data: credRows }] = await Promise.all([
    service
      .from("incentive_expectations")
      .select("shipping_bill_id, scheme, expected_minor")
      .in("shipping_bill_id", sbIds),
    service
      .from("incentive_credits")
      .select("shipping_bill_id, scheme, credited_minor")
      .in("shipping_bill_id", sbIds),
  ]);

  return sumUnclaimedFromExpectationsAndCredits(expRows ?? [], credRows ?? []);
}

async function dispatchTrialNotificationsPglite(params: {
  org: OrgTrialRow;
  kind: TrialNotificationKind;
  now: Date;
  templates: Map<string, NotificationTemplateRow>;
}): Promise<boolean> {
  const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
  const db = await getPgliteDb();
  const trialEndsAt = params.org.trial_ends_at!;
  const trialWindowKey = new Date(trialEndsAt).toISOString();

  const existing = await db.query<{ id: string }>(
    `select id from public.trial_notifications
     where org_id = $1 and kind = $2 and channel = 'email' and trial_window_key = $3
     limit 1`,
    [params.org.id, params.kind, trialWindowKey]
  );

  if (existing.rows.length > 0) {
    return false;
  }

  const [recipient, unclaimedPaise] = await Promise.all([
    resolveOwnerRecipientPglite(db, params.org.id),
    computeUnclaimedPaisePglite(db, params.org.id),
  ]);

  const rendered = buildRenderedMessages({
    kind: params.kind,
    orgName: params.org.name,
    unclaimedPaise,
    trialEndsAt,
    now: params.now,
    templates: params.templates,
  });

  const emailDelivery = recipient.email
    ? await sendTransactionalEmail({
        to: recipient.email,
        subject: rendered.emailSubject,
        text: rendered.emailBody,
      })
    : { status: "queued" as const, providerMessageId: null, error: null };

  const sentAt = emailDelivery.status === "sent" ? params.now.toISOString() : null;

  await db.transaction(async (tx) => {
    await tx.query(
      `insert into public.trial_notifications (
         org_id, recipient_user_id, recipient_email, kind, channel, status,
         subject, body_text, unclaimed_incentive_paise, upgrade_url,
         trial_ends_at, trial_window_key, provider_message_id, sent_at, error
       )
       values ($1, $2, $3, $4, 'email', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (org_id, kind, channel, trial_window_key) do nothing`,
      [
        params.org.id,
        recipient.userId,
        recipient.email,
        params.kind,
        emailDelivery.status,
        rendered.emailSubject,
        rendered.emailBody,
        unclaimedPaise,
        rendered.upgradeUrl,
        trialEndsAt,
        trialWindowKey,
        emailDelivery.providerMessageId,
        sentAt,
        emailDelivery.error,
      ]
    );

    await tx.query(
      `insert into public.trial_notifications (
         org_id, recipient_user_id, recipient_email, kind, channel, status,
         subject, body_text, unclaimed_incentive_paise, upgrade_url,
         trial_ends_at, trial_window_key
       )
       values ($1, $2, $3, $4, 'whatsapp_template', 'stored_template', null, $5, $6, $7, $8, $9)
       on conflict (org_id, kind, channel, trial_window_key) do nothing`,
      [
        params.org.id,
        recipient.userId,
        recipient.email,
        params.kind,
        rendered.whatsappBody,
        unclaimedPaise,
        rendered.upgradeUrl,
        trialEndsAt,
        trialWindowKey,
      ]
    );

    if (params.kind === "trial_day_5") {
      await tx.query(
        `insert into public.billing_events (org_id, actor_id, event_type, metadata)
         values ($1, null, 'trial_day_5_email', $2::jsonb)`,
        [
          params.org.id,
          JSON.stringify({
            unclaimed_incentive_paise: unclaimedPaise,
            upgrade_url: rendered.upgradeUrl,
            trial_ends_at: trialEndsAt,
            delivery_status: emailDelivery.status,
          }),
        ]
      );
    }
  });

  return true;
}

async function dispatchTrialNotificationsSupabase(params: {
  service: ReturnType<typeof createSupabaseServiceRoleClient>;
  org: OrgTrialRow;
  kind: TrialNotificationKind;
  now: Date;
  templates: Map<string, NotificationTemplateRow>;
}): Promise<boolean> {
  const { service } = params;
  const trialEndsAt = params.org.trial_ends_at!;
  const trialWindowKey = new Date(trialEndsAt).toISOString();

  const { data: existing } = await service
    .from("trial_notifications")
    .select("id")
    .eq("org_id", params.org.id)
    .eq("kind", params.kind)
    .eq("channel", "email")
    .eq("trial_window_key", trialWindowKey)
    .maybeSingle();

  if (existing) {
    return false;
  }

  const { data: memberRows } = await service
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", params.org.id);

  const rolePriority: Record<string, number> = { owner: 1, admin: 2, member: 3, viewer: 4 };
  const primaryMember = [...(memberRows ?? [])].sort(
    (a, b) => (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9)
  )[0];

  let recipientEmail: string | null = null;
  if (primaryMember?.user_id) {
    const userRes = await service.auth.admin.getUserById(primaryMember.user_id).catch(() => null);
    recipientEmail = userRes?.data?.user?.email ?? null;
  }

  const unclaimedPaise = await computeUnclaimedPaiseSupabase(service, params.org.id);
  const rendered = buildRenderedMessages({
    kind: params.kind,
    orgName: params.org.name,
    unclaimedPaise,
    trialEndsAt,
    now: params.now,
    templates: params.templates,
  });

  const emailDelivery = recipientEmail
    ? await sendTransactionalEmail({
        to: recipientEmail,
        subject: rendered.emailSubject,
        text: rendered.emailBody,
      })
    : { status: "queued" as const, providerMessageId: null, error: null };

  const sentAt = emailDelivery.status === "sent" ? params.now.toISOString() : null;

  await service.from("trial_notifications").upsert(
    [
      {
        org_id: params.org.id,
        recipient_user_id: primaryMember?.user_id ?? null,
        recipient_email: recipientEmail,
        kind: params.kind,
        channel: "email",
        status: emailDelivery.status,
        subject: rendered.emailSubject,
        body_text: rendered.emailBody,
        unclaimed_incentive_paise: unclaimedPaise,
        upgrade_url: rendered.upgradeUrl,
        trial_ends_at: trialEndsAt,
        trial_window_key: trialWindowKey,
        provider_message_id: emailDelivery.providerMessageId,
        sent_at: sentAt,
        error: emailDelivery.error,
      },
      {
        org_id: params.org.id,
        recipient_user_id: primaryMember?.user_id ?? null,
        recipient_email: recipientEmail,
        kind: params.kind,
        channel: "whatsapp_template",
        status: "stored_template",
        subject: null,
        body_text: rendered.whatsappBody,
        unclaimed_incentive_paise: unclaimedPaise,
        upgrade_url: rendered.upgradeUrl,
        trial_ends_at: trialEndsAt,
        trial_window_key: trialWindowKey,
      },
    ],
    {
      onConflict: "org_id,kind,channel,trial_window_key",
      ignoreDuplicates: true,
    }
  );

  if (params.kind === "trial_day_5") {
    await service.from("billing_events").insert({
      org_id: params.org.id,
      actor_id: null,
      event_type: "trial_day_5_email",
      metadata: {
        unclaimed_incentive_paise: unclaimedPaise,
        upgrade_url: rendered.upgradeUrl,
        trial_ends_at: trialEndsAt,
        delivery_status: emailDelivery.status,
      },
    });
  }

  return true;
}

/**
 * Daily scheduled trial job:
 * - Queues/sends Day 5 reminder emails + stores WhatsApp reminder templates when <= 2 days remain.
 * - Downgrades expired `trial_pro` orgs gently back to `free` without deleting any data.
 */
export async function runDailyTrialLifecycleJob(options?: {
  now?: Date;
}): Promise<DailyTrialJobResult> {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const summary: DailyTrialJobResult = {
    checkedCount: 0,
    day5RemindersProcessed: 0,
    expiredCount: 0,
    downgradedOrgIds: [],
    errors: [],
  };

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const [orgsRes, tplRes] = await Promise.all([
      db.query<OrgTrialRow>(
        `select id, name, plan_key, plan_status,
                trial_started_at::text, trial_ends_at::text, trial_converted_at::text
         from public.organizations
         where plan_key = 'trial_pro' and trial_ends_at is not null`
      ),
      db.query<NotificationTemplateRow>(
        `select key, channel, subject, body_template
         from public.notification_templates
         where active = true`
      ),
    ]);

    const templates = new Map<string, NotificationTemplateRow>();
    for (const tpl of tplRes.rows) {
      templates.set(tpl.key, tpl);
    }

    summary.checkedCount = orgsRes.rows.length;

    for (const org of orgsRes.rows) {
      try {
        const endMs = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : NaN;
        if (!Number.isFinite(endMs)) continue;

        if (endMs <= nowMs) {
          await db.transaction(async (tx) => {
            await tx.query(
              `update public.organizations
               set plan_key = 'free', plan_status = 'active'
               where id = $1 and plan_key = 'trial_pro'`,
              [org.id]
            );

            const diffMeta = JSON.stringify({
              previous_plan: "trial_pro",
              new_plan: "free",
              trial_ends_at: org.trial_ends_at,
              expired_at: nowIso,
            });

            await tx.query(
              `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
               values ($1, null, 'trial_expired', 'organizations', $1, $2::jsonb)`,
              [org.id, diffMeta]
            );

            await tx.query(
              `insert into public.billing_events (org_id, actor_id, event_type, metadata)
               values ($1, null, 'trial_expired', $2::jsonb)`,
              [org.id, diffMeta]
            );
          });

          await dispatchTrialNotificationsPglite({
            org,
            kind: "trial_day_7",
            now,
            templates,
          });

          summary.expiredCount += 1;
          summary.downgradedOrgIds.push(org.id);
          continue;
        }

        if (endMs - nowMs <= DAY_5_REMAINING_THRESHOLD_MS) {
          const sent = await dispatchTrialNotificationsPglite({
            org,
            kind: "trial_day_5",
            now,
            templates,
          });
          if (sent) {
            summary.day5RemindersProcessed += 1;
          }
        }
      } catch (error) {
        summary.errors.push({
          orgId: org.id,
          message: error instanceof Error ? error.message : "Trial processing failed.",
        });
      }
    }

    return summary;
  }

  const service = createSupabaseServiceRoleClient();
  const [{ data: orgRows }, { data: tplRows }] = await Promise.all([
    service
      .from("organizations")
      .select(
        "id, name, plan_key, plan_status, trial_started_at, trial_ends_at, trial_converted_at"
      )
      .eq("plan_key", "trial_pro")
      .not("trial_ends_at", "is", null),
    service
      .from("notification_templates")
      .select("key, channel, subject, body_template")
      .eq("active", true),
  ]);

  const templates = new Map<string, NotificationTemplateRow>();
  for (const tpl of tplRows ?? []) {
    templates.set(tpl.key, tpl);
  }

  const orgs = orgRows ?? [];
  summary.checkedCount = orgs.length;

  for (const org of orgs) {
    try {
      const endMs = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : NaN;
      if (!Number.isFinite(endMs)) continue;

      if (endMs <= nowMs) {
        await service
          .from("organizations")
          .update({ plan_key: "free", plan_status: "active" })
          .eq("id", org.id)
          .eq("plan_key", "trial_pro");

        const diffMeta = {
          previous_plan: "trial_pro",
          new_plan: "free",
          trial_ends_at: org.trial_ends_at,
          expired_at: nowIso,
        };

        await Promise.all([
          service.from("audit_log").insert({
            org_id: org.id,
            actor_id: null,
            action: "trial_expired",
            entity: "organizations",
            entity_id: org.id,
            diff: diffMeta,
          }),
          service.from("billing_events").insert({
            org_id: org.id,
            actor_id: null,
            event_type: "trial_expired",
            metadata: diffMeta,
          }),
        ]);

        await dispatchTrialNotificationsSupabase({
          service,
          org,
          kind: "trial_day_7",
          now,
          templates,
        });

        summary.expiredCount += 1;
        summary.downgradedOrgIds.push(org.id);
        continue;
      }

      if (endMs - nowMs <= DAY_5_REMAINING_THRESHOLD_MS) {
        const sent = await dispatchTrialNotificationsSupabase({
          service,
          org,
          kind: "trial_day_5",
          now,
          templates,
        });
        if (sent) {
          summary.day5RemindersProcessed += 1;
        }
      }
    } catch (error) {
      summary.errors.push({
        orgId: org.id,
        message: error instanceof Error ? error.message : "Trial processing failed.",
      });
    }
  }

  return summary;
}

/**
 * Platform admin override: extend an organization's Pro trial by N days (1-90),
 * audit-logged for consultant pilots.
 */
export async function extendOrganizationTrial(params: {
  orgId: string;
  days: number;
  adminUserId: string;
  reason?: string;
  now?: Date;
}): Promise<ExtendTrialResult> {
  if (!Number.isInteger(params.days) || params.days < 1 || params.days > 90) {
    throw new ValidationError("Trial extension days must be a whole number between 1 and 90.");
  }

  const now = params.now ?? new Date();
  const nowIso = now.toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    return db.transaction(async (tx) => {
      const res = await tx.query<{
        id: string;
        plan_key: string;
        trial_started_at: string | null;
        trial_ends_at: string | null;
      }>(
        `select id, plan_key, trial_started_at::text, trial_ends_at::text
         from public.organizations
         where id = $1`,
        [params.orgId]
      );

      const org = res.rows[0];
      if (!org) {
        throw new NotFoundError("Organization not found.");
      }

      const existingEndMs = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0;
      const baseMs = Math.max(now.getTime(), Number.isFinite(existingEndMs) ? existingEndMs : 0);
      const newEndIso = new Date(baseMs + params.days * MS_PER_DAY).toISOString();

      await tx.query(
        `update public.organizations
         set plan_key = 'trial_pro',
             plan_status = 'active',
             trial_started_at = coalesce(trial_started_at, $2),
             trial_ends_at = $3
         where id = $1`,
        [params.orgId, nowIso, newEndIso]
      );

      const diffMeta = JSON.stringify({
        daysAdded: params.days,
        previousPlanKey: org.plan_key,
        previousTrialEndsAt: org.trial_ends_at,
        newTrialEndsAt: newEndIso,
        reason: params.reason ?? null,
      });

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'trial_extended', 'organizations', $1, $3::jsonb)`,
        [params.orgId, params.adminUserId, diffMeta]
      );

      await tx.query(
        `insert into public.billing_events (org_id, actor_id, event_type, metadata)
         values ($1, $2, 'trial_extended', $3::jsonb)`,
        [params.orgId, params.adminUserId, diffMeta]
      );

      return {
        orgId: params.orgId,
        planKey: "trial_pro",
        daysAdded: params.days,
        previousTrialEndsAt: org.trial_ends_at,
        trialEndsAt: newEndIso,
      };
    });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: org } = await service
    .from("organizations")
    .select("id, plan_key, trial_started_at, trial_ends_at")
    .eq("id", params.orgId)
    .maybeSingle();

  if (!org) {
    throw new NotFoundError("Organization not found.");
  }

  const existingEndMs = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0;
  const baseMs = Math.max(now.getTime(), Number.isFinite(existingEndMs) ? existingEndMs : 0);
  const newEndIso = new Date(baseMs + params.days * MS_PER_DAY).toISOString();

  await service
    .from("organizations")
    .update({
      plan_key: "trial_pro",
      plan_status: "active",
      trial_started_at: org.trial_started_at ?? nowIso,
      trial_ends_at: newEndIso,
    })
    .eq("id", params.orgId);

  const diffMeta = {
    daysAdded: params.days,
    previousPlanKey: org.plan_key,
    previousTrialEndsAt: org.trial_ends_at,
    newTrialEndsAt: newEndIso,
    reason: params.reason ?? null,
  };

  await Promise.all([
    service.from("audit_log").insert({
      org_id: params.orgId,
      actor_id: params.adminUserId,
      action: "trial_extended",
      entity: "organizations",
      entity_id: params.orgId,
      diff: diffMeta,
    }),
    service.from("billing_events").insert({
      org_id: params.orgId,
      actor_id: params.adminUserId,
      event_type: "trial_extended",
      metadata: diffMeta,
    }),
  ]);

  return {
    orgId: params.orgId,
    planKey: "trial_pro",
    daysAdded: params.days,
    previousTrialEndsAt: org.trial_ends_at,
    trialEndsAt: newEndIso,
  };
}

/**
 * Transitions a trialing (or free) organization to a verified paid subscription plan.
 * Ends any remaining trial immediately while preserving `trial_ends_at` so a repeat
 * trial cannot be claimed later. Called by subscription activation webhooks (Prompt 14).
 */
export async function convertTrialToPaidPlan(params: {
  orgId: string;
  paidPlanKey: Exclude<PlanKey, "free" | "trial_pro">;
  actorId?: string | null;
  now?: Date;
}): Promise<ConvertTrialResult> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    return db.transaction(async (tx) => {
      const res = await tx.query<{
        id: string;
        plan_key: string;
        trial_ends_at: string | null;
      }>(
        `select id, plan_key, trial_ends_at::text
         from public.organizations
         where id = $1`,
        [params.orgId]
      );

      const org = res.rows[0];
      if (!org) {
        throw new NotFoundError("Organization not found.");
      }

      const wasTrial = org.plan_key === "trial_pro";
      const endedTrialIso =
        org.trial_ends_at && new Date(org.trial_ends_at).getTime() <= now.getTime()
          ? org.trial_ends_at
          : nowIso;

      await tx.query(
        `update public.organizations
         set plan_key = $2,
             plan_status = 'active',
             trial_ends_at = $3,
             trial_converted_at = case when $4 then $5 else trial_converted_at end
         where id = $1`,
        [params.orgId, params.paidPlanKey, endedTrialIso, wasTrial, nowIso]
      );

      const meta = JSON.stringify({
        previous_plan: org.plan_key,
        new_plan: params.paidPlanKey,
        was_trial: wasTrial,
        converted_at: nowIso,
      });

      if (wasTrial) {
        await tx.query(
          `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
           values ($1, $2, 'trial_converted', 'organizations', $1, $3::jsonb)`,
          [params.orgId, params.actorId ?? null, meta]
        );
        await tx.query(
          `insert into public.billing_events (org_id, actor_id, event_type, metadata)
           values ($1, $2, 'trial_converted', $3::jsonb)`,
          [params.orgId, params.actorId ?? null, meta]
        );
      }

      return {
        orgId: params.orgId,
        planKey: params.paidPlanKey,
        wasTrial,
        convertedAt: nowIso,
      };
    });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: org } = await service
    .from("organizations")
    .select("id, plan_key, trial_ends_at, trial_converted_at")
    .eq("id", params.orgId)
    .maybeSingle();

  if (!org) {
    throw new NotFoundError("Organization not found.");
  }

  const wasTrial = org.plan_key === "trial_pro";
  const endedTrialIso =
    org.trial_ends_at && new Date(org.trial_ends_at).getTime() <= now.getTime()
      ? org.trial_ends_at
      : nowIso;

  await service
    .from("organizations")
    .update({
      plan_key: params.paidPlanKey,
      plan_status: "active",
      trial_ends_at: endedTrialIso,
      ...(wasTrial ? { trial_converted_at: nowIso } : {}),
    })
    .eq("id", params.orgId);

  if (wasTrial) {
    const meta = {
      previous_plan: org.plan_key,
      new_plan: params.paidPlanKey,
      was_trial: true,
      converted_at: nowIso,
    };

    await Promise.all([
      service.from("audit_log").insert({
        org_id: params.orgId,
        actor_id: params.actorId ?? null,
        action: "trial_converted",
        entity: "organizations",
        entity_id: params.orgId,
        diff: meta,
      }),
      service.from("billing_events").insert({
        org_id: params.orgId,
        actor_id: params.actorId ?? null,
        event_type: "trial_converted",
        metadata: meta,
      }),
    ]);
  }

  return {
    orgId: params.orgId,
    planKey: params.paidPlanKey,
    wasTrial,
    convertedAt: nowIso,
  };
}

export async function recordBillingEvent(params: {
  orgId: string;
  actorId?: string | null;
  eventType: BillingEventType;
  metadata?: Record<string, Json>;
}): Promise<void> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    await db.query(
      `insert into public.billing_events (org_id, actor_id, event_type, metadata)
       values ($1, $2, $3, $4::jsonb)`,
      [
        params.orgId,
        params.actorId ?? null,
        params.eventType,
        JSON.stringify(params.metadata ?? {}),
      ]
    );
    return;
  }

  const service = createSupabaseServiceRoleClient();
  await service.from("billing_events").insert({
    org_id: params.orgId,
    actor_id: params.actorId ?? null,
    event_type: params.eventType,
    metadata: params.metadata ?? {},
  });
}
