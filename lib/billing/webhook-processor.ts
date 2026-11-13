import crypto from "crypto";
import { PLANS, type PlanKey } from "@/config/plans";
import { formatMoney } from "@/lib/format";
import { getAppBaseUrl, sendTransactionalEmail } from "@/lib/notifications/email";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

export interface WebhookProcessingResult {
  status: "processed" | "duplicate" | "ignored";
  eventId: string;
  eventType: string;
  orgId: string | null;
  subscriptionId: string | null;
}

export const SUBSCRIPTION_STATUS_RANK: Record<string, number> = {
  created: 1,
  authenticated: 2,
  pending: 3,
  resumed: 4,
  active: 4,
  paused: 4,
  halted: 5,
  completed: 6,
  cancelled: 6,
  canceled: 6,
};

/**
 * Validates the raw request body HMAC-SHA256 against RAZORPAY_WEBHOOK_SECRET.
 * Uses timingSafeEqual to prevent timing attacks. Fails closed if secret or signature is missing.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined
): boolean {
  const secret =
    process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "your-razorpay-webhook-secret" : "");
  if (!secret || !signature || !rawBody) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf-8"), Buffer.from(expected, "utf-8"));
  } catch {
    return false;
  }
}

/**
 * Recursively masks sensitive fields (credit cards, CVVs, passwords, tokens) in payload objects
 * so personal financial data is never exposed in logs or admin viewers.
 */
export function maskPayloadSecrets(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(maskPayloadSecrets);

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("card") ||
      lowerKey.includes("cvv") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password") ||
      lowerKey.includes("auth")
    ) {
      masked[key] = "****";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskPayloadSecrets(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function parseTimestampToIso(val: number | string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    const ms = val < 1e11 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  const date = new Date(val);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Resolves organization ID from webhook payload or database records.
 */
async function resolveOrgIdFromEvent(
  subEntity?: Record<string, unknown> | null,
  paymentEntity?: Record<string, unknown> | null
): Promise<{ orgId: string | null; planKey: PlanKey | null }> {
  const subNotes = (subEntity?.notes ?? {}) as Record<string, unknown>;
  const payNotes = (paymentEntity?.notes ?? {}) as Record<string, unknown>;

  const candidateOrgId = (subNotes.org_id || payNotes.org_id) as string | undefined;
  const candidatePlanKey = (subNotes.plan_key || payNotes.plan_key) as PlanKey | undefined;

  const subId = (subEntity?.id ?? null) as string | null;

  if (candidateOrgId && candidateOrgId in PLANS) {
    // If it's a planKey instead of UUID
    return { orgId: null, planKey: candidatePlanKey ?? null };
  }

  if (candidateOrgId) {
    return { orgId: candidateOrgId, planKey: candidatePlanKey ?? null };
  }

  // Lookup in database via subscription ID
  if (subId) {
    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();
      const res = await db.query<{ org_id: string; plan_key: string }>(
        `select org_id, plan_key from public.subscriptions where razorpay_subscription_id = $1 limit 1`,
        [subId]
      );
      if (res.rows[0]) {
        return {
          orgId: res.rows[0].org_id,
          planKey: candidatePlanKey || (res.rows[0].plan_key as PlanKey) || null,
        };
      }
    } else {
      const service = createSupabaseServiceRoleClient();
      const { data } = await service
        .from("subscriptions")
        .select("org_id, plan_key")
        .eq("razorpay_subscription_id", subId)
        .maybeSingle();

      if (data) {
        return {
          orgId: data.org_id,
          planKey: candidatePlanKey || (data.plan_key as PlanKey) || null,
        };
      }
    }
  }

  return { orgId: null, planKey: candidatePlanKey ?? null };
}

/**
 * Resolves the primary owner email for an organization to dispatch billing notifications.
 */
async function resolveOrgOwnerEmail(orgId: string): Promise<string | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{ email: string }>(
      `select u.email
       from public.memberships m
       join auth.users u on u.id = m.user_id
       where m.org_id = $1 and m.role = 'owner'
       order by m.created_at asc
       limit 1`,
      [orgId]
    );
    return res.rows[0]?.email ?? null;
  }

  const service = createSupabaseServiceRoleClient();
  const { data } = await service
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.user_id) return null;

  const { data: userData } = await service.auth.admin.getUserById(data.user_id);
  return userData?.user?.email ?? null;
}

/**
 * Main webhook processing engine.
 * Ensures idempotency via `payment_events`, transactional execution, out-of-order safety,
 * plan activations, trial conversions, and customer receipts.
 */
export async function processRazorpayWebhook(params: {
  rawBody: string;
  signature?: string | null;
  eventIdHeader?: string | null;
  skipSignatureVerification?: boolean;
}): Promise<WebhookProcessingResult> {
  const { rawBody, signature, eventIdHeader, skipSignatureVerification = false } = params;

  if (!skipSignatureVerification) {
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new Error("Invalid or missing webhook signature.");
    }
  }

  let eventPayload: {
    id?: string;
    event?: string;
    payload?: {
      subscription?: { entity?: Record<string, unknown> };
      payment?: { entity?: Record<string, unknown> };
      refund?: { entity?: Record<string, unknown> };
    };
    created_at?: number;
  };

  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON body in webhook payload.");
  }

  const eventType = eventPayload.event || "unknown";
  const eventId =
    eventIdHeader?.trim() ||
    eventPayload.id ||
    crypto.createHash("sha256").update(rawBody).digest("hex");

  const subEntity = eventPayload.payload?.subscription?.entity ?? null;
  const payEntity = eventPayload.payload?.payment?.entity ?? null;
  const subId = (subEntity?.id ?? null) as string | null;

  const { orgId, planKey: resolvedPlanKey } = await resolveOrgIdFromEvent(subEntity, payEntity);

  const eventTimestamp = parseTimestampToIso(eventPayload.created_at) || new Date().toISOString();

  // Deduplication & Payment Event insertion
  let paymentEventRowId: string;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    // Check if event already processed
    const existing = await db.query<{ id: string; processed_at: string | null }>(
      `select id, processed_at::text from public.payment_events where provider_event_id = $1`,
      [eventId]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].processed_at) {
        return {
          status: "duplicate",
          eventId,
          eventType,
          orgId,
          subscriptionId: subId,
        };
      }
      paymentEventRowId = existing.rows[0].id;
    } else {
      const inserted = await db.query<{ id: string }>(
        `insert into public.payment_events (
           provider, provider_event_id, event_type, payload, org_id
         )
         values ('razorpay', $1, $2, $3::jsonb, $4)
         on conflict (provider_event_id) do nothing
         returning id`,
        [eventId, eventType, rawBody, orgId]
      );

      if (!inserted.rows[0]) {
        return {
          status: "duplicate",
          eventId,
          eventType,
          orgId,
          subscriptionId: subId,
        };
      }
      paymentEventRowId = inserted.rows[0].id;
    }
  } else {
    const service = createSupabaseServiceRoleClient();
    const { data: existing } = await service
      .from("payment_events")
      .select("id, processed_at")
      .eq("provider_event_id", eventId)
      .maybeSingle();

    if (existing) {
      if (existing.processed_at) {
        return {
          status: "duplicate",
          eventId,
          eventType,
          orgId,
          subscriptionId: subId,
        };
      }
      paymentEventRowId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await service
        .from("payment_events")
        .insert({
          provider: "razorpay",
          provider_event_id: eventId,
          event_type: eventType,
          payload: JSON.parse(rawBody),
          org_id: orgId,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505") {
          return {
            status: "duplicate",
            eventId,
            eventType,
            orgId,
            subscriptionId: subId,
          };
        }
        throw insertError;
      }

      if (!inserted) {
        return {
          status: "duplicate",
          eventId,
          eventType,
          orgId,
          subscriptionId: subId,
        };
      }
      paymentEventRowId = inserted.id;
    }
  }

  // State Machine Execution
  try {
    await executeWebhookStateMachine({
      eventType,
      subEntity,
      payEntity,
      refundEntity: eventPayload.payload?.refund?.entity ?? null,
      orgId,
      planKey: resolvedPlanKey,
      eventTimestamp,
    });

    // Mark processed_at
    const processedAt = new Date().toISOString();
    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();
      await db.query(
        `update public.payment_events set processed_at = $2, error = null where id = $1`,
        [paymentEventRowId, processedAt]
      );
    } else {
      const service = createSupabaseServiceRoleClient();
      await service
        .from("payment_events")
        .update({ processed_at: processedAt, error: null })
        .eq("id", paymentEventRowId);
    }

    return {
      status: "processed",
      eventId,
      eventType,
      orgId,
      subscriptionId: subId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();
      await db.query(`update public.payment_events set error = $2 where id = $1`, [
        paymentEventRowId,
        errorMsg,
      ]);
    } else {
      const service = createSupabaseServiceRoleClient();
      await service.from("payment_events").update({ error: errorMsg }).eq("id", paymentEventRowId);
    }
    throw err;
  }
}

/**
 * Handles subscription and payment state transitions.
 */
async function executeWebhookStateMachine(params: {
  eventType: string;
  subEntity?: Record<string, unknown> | null;
  payEntity?: Record<string, unknown> | null;
  refundEntity?: Record<string, unknown> | null;
  orgId: string | null;
  planKey: PlanKey | null;
  eventTimestamp: string;
}): Promise<void> {
  const { eventType, subEntity, payEntity, orgId, planKey, eventTimestamp } = params;

  const subId = (subEntity?.id ?? null) as string | null;
  const currentStart = parseTimestampToIso(subEntity?.current_start as number | undefined);
  const currentEnd = parseTimestampToIso(subEntity?.current_end as number | undefined);
  const chargeAt = parseTimestampToIso(subEntity?.charge_at as number | undefined);
  const paidCount = typeof subEntity?.paid_count === "number" ? subEntity.paid_count : 0;
  const cancelAtCycleEnd = Boolean(subEntity?.cancel_at_cycle_end);

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    type PostActionEmail = { type: "receipt"; targetPlanKey: PlanKey } | { type: "payment_failed" };

    let postActionEmail: PostActionEmail | null = null;

    await db.transaction(async (tx) => {
      // 1. Out-of-order check: fetch current subscription status in DB
      let currentDbSubStatus: string | null = null;
      let existingSubInternalId: string | null = null;

      if (subId) {
        const subRes = await tx.query<{
          id: string;
          status: string;
        }>(
          `select id, status from public.subscriptions where razorpay_subscription_id = $1 limit 1`,
          [subId]
        );
        if (subRes.rows[0]) {
          existingSubInternalId = subRes.rows[0].id;
          currentDbSubStatus = subRes.rows[0].status;
        }
      }

      // Handle subscription.activated / subscription.charged
      if (eventType === "subscription.activated" || eventType === "subscription.charged") {
        const targetPlanKey: PlanKey =
          planKey && planKey in PLANS && planKey !== "free" && planKey !== "trial_pro"
            ? planKey
            : "exporter_monthly";

        if (orgId) {
          // End any trial, convert to active paid plan
          await tx.query(
            `update public.organizations
             set plan_key = $2,
                 plan_status = 'active',
                 trial_ends_at = coalesce(trial_ends_at, $3),
                 trial_converted_at = coalesce(trial_converted_at, $3),
                 updated_at = $3
             where id = $1`,
            [orgId, targetPlanKey, eventTimestamp]
          );

          // Clear any payment problem alerts
          await tx.query(
            `update public.alerts
             set resolved_at = $2
             where iec_id in (select id from public.iec_profiles where org_id = $1)
               and kind in ('payment_problem', 'payment_failed')
               and resolved_at is null`,
            [orgId, eventTimestamp]
          );
        }

        if (subId && existingSubInternalId) {
          await tx.query(
            `update public.subscriptions
             set status = 'active',
                 plan_key = $2,
                 current_start = coalesce($3, current_start),
                 current_end = coalesce($4, current_end),
                 charge_at = coalesce($5, charge_at),
                 paid_count = greatest(paid_count, $6),
                 cancel_at_cycle_end = $7,
                 raw = $8::jsonb,
                 updated_at = $9
             where id = $1`,
            [
              existingSubInternalId,
              targetPlanKey,
              currentStart,
              currentEnd,
              chargeAt,
              paidCount,
              cancelAtCycleEnd,
              JSON.stringify(subEntity ?? {}),
              eventTimestamp,
            ]
          );

          await tx.query(
            `insert into public.audit_log (org_id, action, entity, entity_id, diff)
             values ($1, $2, 'subscriptions', $3, $4::jsonb)`,
            [
              orgId,
              eventType === "subscription.activated"
                ? "subscription_activated"
                : "subscription_charged",
              existingSubInternalId,
              JSON.stringify({
                plan_key: targetPlanKey,
                subscription_id: subId,
                paid_count: paidCount,
                current_end: currentEnd,
              }),
            ]
          );
        }

        postActionEmail = { type: "receipt", targetPlanKey };
        return;
      }

      // Handle subscription.authenticated
      if (eventType === "subscription.authenticated") {
        // Out-of-order check: do not regress if already active
        if (
          currentDbSubStatus &&
          (SUBSCRIPTION_STATUS_RANK[currentDbSubStatus] ?? 0) >=
            (SUBSCRIPTION_STATUS_RANK.active ?? 4)
        ) {
          return;
        }

        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'authenticated', updated_at = $2 where id = $1`,
            [existingSubInternalId, eventTimestamp]
          );
        }
        return;
      }

      // Handle subscription.pending (payment retry in progress -> past_due 3-day grace period)
      if (eventType === "subscription.pending") {
        if (orgId) {
          await tx.query(
            `update public.organizations set plan_status = 'past_due', updated_at = $2 where id = $1`,
            [orgId, eventTimestamp]
          );
        }
        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'pending', updated_at = $2 where id = $1`,
            [existingSubInternalId, eventTimestamp]
          );
        }
        return;
      }

      // Handle subscription.halted (downgrade to free)
      if (eventType === "subscription.halted") {
        if (orgId) {
          await tx.query(
            `update public.organizations set plan_key = 'free', plan_status = 'halted', updated_at = $2 where id = $1`,
            [orgId, eventTimestamp]
          );
        }
        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'halted', updated_at = $2 where id = $1`,
            [existingSubInternalId, eventTimestamp]
          );
        }
        return;
      }

      // Handle subscription.cancelled
      if (eventType === "subscription.cancelled") {
        const isFutureEnd = currentEnd && new Date(currentEnd).getTime() > Date.now();
        const keepAccess = cancelAtCycleEnd && isFutureEnd;

        if (orgId) {
          if (!keepAccess) {
            await tx.query(
              `update public.organizations set plan_key = 'free', plan_status = 'cancelled', updated_at = $2 where id = $1`,
              [orgId, eventTimestamp]
            );
          }
        }

        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'cancelled', cancel_at_cycle_end = $2, updated_at = $3 where id = $1`,
            [existingSubInternalId, cancelAtCycleEnd, eventTimestamp]
          );
        }
        return;
      }

      // Handle subscription.paused
      if (eventType === "subscription.paused") {
        if (orgId) {
          await tx.query(
            `update public.organizations set plan_status = 'paused', updated_at = $2 where id = $1`,
            [orgId, eventTimestamp]
          );
        }
        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'paused', updated_at = $2 where id = $1`,
            [existingSubInternalId, eventTimestamp]
          );
        }
        return;
      }

      // Handle subscription.resumed
      if (eventType === "subscription.resumed") {
        if (orgId) {
          await tx.query(
            `update public.organizations set plan_status = 'active', updated_at = $2 where id = $1`,
            [orgId, eventTimestamp]
          );
        }
        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'active', updated_at = $2 where id = $1`,
            [existingSubInternalId, eventTimestamp]
          );
        }
        return;
      }

      // Handle subscription.completed
      if (eventType === "subscription.completed") {
        if (orgId) {
          await tx.query(
            `update public.organizations set plan_status = 'completed', updated_at = $2 where id = $1`,
            [orgId, eventTimestamp]
          );
        }
        if (existingSubInternalId) {
          await tx.query(
            `update public.subscriptions set status = 'completed', updated_at = $2 where id = $1`,
            [existingSubInternalId, eventTimestamp]
          );
        }
        return;
      }

      // Handle payment.failed
      if (eventType === "payment.failed") {
        postActionEmail = { type: "payment_failed" };
        return;
      }

      // Handle refund.processed
      if (eventType === "refund.processed") {
        if (orgId) {
          await tx.query(
            `update public.organizations set plan_key = 'free', plan_status = 'refunded', updated_at = $2 where id = $1`,
            [orgId, eventTimestamp]
          );
        }
        return;
      }
    });

    // Execute post-transaction emails OUTSIDE the transaction
    if (postActionEmail && orgId) {
      const ownerEmail = await resolveOrgOwnerEmail(orgId);
      if (ownerEmail) {
        const action = postActionEmail as
          { type: "receipt"; targetPlanKey: PlanKey } | { type: "payment_failed" };

        if (action.type === "receipt") {
          const targetPlanKey = action.targetPlanKey;
          const planConfig = PLANS[targetPlanKey];
          const amountPaise = Number(payEntity?.amount ?? planConfig?.pricePaise ?? 99900);
          const formattedAmount = formatMoney(amountPaise, "INR");
          await sendTransactionalEmail({
            to: ownerEmail,
            subject: `Receipt: ExportLeak ${planConfig.displayName} Subscription`,
            text: `Thank you for subscribing to ExportLeak ${planConfig.displayName}. Payment of ${formattedAmount} was confirmed. Your entitlements are fully unlocked. Manage your billing anytime at: ${getAppBaseUrl()}/app/billing`,
          });
        } else if (action.type === "payment_failed") {
          await sendTransactionalEmail({
            to: ownerEmail,
            subject: "Action Required: Subscription Payment Failed",
            text: `Your ExportLeak recurring subscription payment failed. Please update your payment method to prevent plan disruption: ${getAppBaseUrl()}/app/billing`,
          });
        }
      }
    }

    return;
  }

  // Supabase Service Role mode
  const service = createSupabaseServiceRoleClient();

  let existingSub: { id: string; status: string; updated_at: string } | null = null;
  if (subId) {
    const { data } = await service
      .from("subscriptions")
      .select("id, status, updated_at")
      .eq("razorpay_subscription_id", subId)
      .maybeSingle();
    existingSub = data;
  }

  if (eventType === "subscription.activated" || eventType === "subscription.charged") {
    const targetPlanKey: PlanKey =
      planKey && planKey in PLANS && planKey !== "free" && planKey !== "trial_pro"
        ? planKey
        : "exporter_monthly";

    if (orgId) {
      await service
        .from("organizations")
        .update({
          plan_key: targetPlanKey,
          plan_status: "active",
          trial_converted_at: eventTimestamp,
          trial_ends_at: eventTimestamp,
          updated_at: eventTimestamp,
        })
        .eq("id", orgId);
    }

    if (existingSub) {
      await service
        .from("subscriptions")
        .update({
          status: "active",
          plan_key: targetPlanKey,
          current_start: currentStart || undefined,
          current_end: currentEnd || undefined,
          charge_at: chargeAt || undefined,
          paid_count: paidCount,
          cancel_at_cycle_end: cancelAtCycleEnd,
          raw: (subEntity ?? {}) as unknown as Json,
          updated_at: eventTimestamp,
        })
        .eq("id", existingSub.id);

      if (orgId) {
        await service.from("audit_log").insert({
          org_id: orgId,
          action:
            eventType === "subscription.activated"
              ? "subscription_activated"
              : "subscription_charged",
          entity: "subscriptions",
          entity_id: existingSub.id,
          diff: {
            plan_key: targetPlanKey,
            subscription_id: subId,
            paid_count: paidCount,
            current_end: currentEnd,
          },
        });
      }
    }

    if (orgId) {
      const ownerEmail = await resolveOrgOwnerEmail(orgId);
      if (ownerEmail) {
        const amountPaise = Number(payEntity?.amount ?? PLANS[targetPlanKey].pricePaise ?? 99900);
        const formattedAmount = formatMoney(amountPaise, "INR");
        await sendTransactionalEmail({
          to: ownerEmail,
          subject: `Receipt: ExportLeak ${PLANS[targetPlanKey].displayName} Subscription`,
          text: `Thank you for subscribing to ExportLeak ${PLANS[targetPlanKey].displayName}. Payment of ${formattedAmount} was confirmed. Your entitlements are fully unlocked. Manage your billing anytime at: ${getAppBaseUrl()}/app/billing`,
        });
      }
    }
    return;
  }

  if (eventType === "subscription.authenticated") {
    if (
      existingSub &&
      (SUBSCRIPTION_STATUS_RANK[existingSub.status] ?? 0) >= (SUBSCRIPTION_STATUS_RANK.active ?? 4)
    ) {
      return;
    }
    if (existingSub) {
      await service
        .from("subscriptions")
        .update({ status: "authenticated", updated_at: eventTimestamp })
        .eq("id", existingSub.id);
    }
    return;
  }

  if (eventType === "subscription.pending") {
    if (orgId) {
      await service
        .from("organizations")
        .update({ plan_status: "past_due", updated_at: eventTimestamp })
        .eq("id", orgId);
    }
    if (existingSub) {
      await service
        .from("subscriptions")
        .update({ status: "pending", updated_at: eventTimestamp })
        .eq("id", existingSub.id);
    }
    return;
  }

  if (eventType === "subscription.halted") {
    if (orgId) {
      await service
        .from("organizations")
        .update({ plan_key: "free", plan_status: "halted", updated_at: eventTimestamp })
        .eq("id", orgId);
    }
    if (existingSub) {
      await service
        .from("subscriptions")
        .update({ status: "halted", updated_at: eventTimestamp })
        .eq("id", existingSub.id);
    }
    return;
  }

  if (eventType === "subscription.cancelled") {
    const isFutureEnd = currentEnd && new Date(currentEnd).getTime() > Date.now();
    const keepAccess = cancelAtCycleEnd && isFutureEnd;

    if (orgId && !keepAccess) {
      await service
        .from("organizations")
        .update({ plan_key: "free", plan_status: "cancelled", updated_at: eventTimestamp })
        .eq("id", orgId);
    }

    if (existingSub) {
      await service
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancel_at_cycle_end: cancelAtCycleEnd,
          updated_at: eventTimestamp,
        })
        .eq("id", existingSub.id);
    }
    return;
  }

  if (eventType === "payment.failed" && orgId) {
    const ownerEmail = await resolveOrgOwnerEmail(orgId);
    if (ownerEmail) {
      await sendTransactionalEmail({
        to: ownerEmail,
        subject: "Action Required: Subscription Payment Failed",
        text: `Your ExportLeak recurring subscription payment failed. Please update your payment method: ${getAppBaseUrl()}/app/billing`,
      });
    }
    return;
  }

  if (eventType === "refund.processed" && orgId) {
    await service
      .from("organizations")
      .update({ plan_key: "free", plan_status: "refunded", updated_at: eventTimestamp })
      .eq("id", orgId);
    return;
  }
}
