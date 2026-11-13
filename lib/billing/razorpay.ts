import crypto from "crypto";
import { PLANS, getRazorpayPlanId, type PlanKey } from "@/config/plans";
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  isConfigured: boolean;
  isTestPlaceholder: boolean;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  keyId: string;
  planKey: PlanKey;
  isPlanChange: boolean;
  previousSubscriptionId: string | null;
}

export interface CancelSubscriptionResult {
  success: boolean;
  subscriptionId: string;
  cancelAtCycleEnd: boolean;
  currentEnd: string | null;
}

export interface OrgBillingStatusResult {
  orgId: string;
  planKey: PlanKey;
  planStatus: string;
  isPaidPlanActive: boolean;
  trialEndsAt: string | null;
  subscription: {
    id: string;
    razorpaySubscriptionId: string;
    planKey: PlanKey;
    status: string;
    currentStart: string | null;
    currentEnd: string | null;
    cancelAtCycleEnd: boolean;
  } | null;
}

export function getRazorpayCredentials(): RazorpayCredentials {
  const keyId =
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_KEY_ID ||
    "rzp_test_placeholder";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "your-razorpay-key-secret";

  const isTestPlaceholder =
    keyId.includes("placeholder") || keySecret.includes("your-razorpay-key-secret");
  const isConfigured = Boolean(keyId && keySecret && !isTestPlaceholder);

  return {
    keyId,
    keySecret,
    isConfigured,
    isTestPlaceholder,
  };
}

/**
 * Verifies the cryptographic HMAC-SHA256 signature sent by the browser Razorpay checkout handler.
 * Note: for subscriptions, the payload order is "payment_id|subscription_id" with the key secret.
 * This verification is used strictly for UI messaging/validation. It NEVER activates the plan.
 */
export function verifySubscriptionPaymentSignature(params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
  secret?: string;
}): boolean {
  const secret = params.secret ?? getRazorpayCredentials().keySecret;
  if (!secret) return false;
  if (!params.paymentId || !params.subscriptionId || !params.signature) return false;

  const payload = `${params.paymentId}|${params.subscriptionId}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (expected.length !== params.signature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(params.signature, "utf-8"),
      Buffer.from(expected, "utf-8")
    );
  } catch {
    return false;
  }
}

/**
 * Low-level API caller to Razorpay REST endpoints.
 * In test mode or when using placeholder credentials, provides deterministic simulated responses
 * so unit tests and offline testing work predictably without live card credentials.
 */
async function callRazorpayApi<T = Record<string, unknown>>(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const creds = getRazorpayCredentials();

  // Simulated fallback when running with placeholder keys or test adapter
  if (creds.isTestPlaceholder || isPgliteTestAdapterEnabled()) {
    if (endpoint.startsWith("/customers")) {
      const custId = `cust_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return { id: custId, entity: "customer", ...options.body } as unknown as T;
    }
    if (
      endpoint.startsWith("/subscriptions") &&
      options.method === "POST" &&
      !endpoint.includes("/cancel")
    ) {
      const subId = `sub_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        id: subId,
        entity: "subscription",
        status: "created",
        total_count: options.body?.total_count ?? 120,
        paid_count: 0,
        current_start: null,
        current_end: null,
        ...options.body,
      } as unknown as T;
    }
    if (endpoint.startsWith("/subscriptions/") && (!options.method || options.method === "GET")) {
      const subIdMatch = endpoint.match(/\/subscriptions\/([^/?]+)/);
      const subId = subIdMatch ? subIdMatch[1] : "sub_sim_reconcile";
      return {
        id: subId,
        entity: "subscription",
        status: "active",
        plan_id: "plan_mock_exporter_monthly",
        paid_count: 1,
        total_count: 120,
        current_start: Math.floor(Date.now() / 1000),
        current_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        charge_at: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        cancel_at_cycle_end: 0,
      } as unknown as T;
    }
    if (endpoint.includes("/cancel")) {
      const subIdMatch = endpoint.match(/\/subscriptions\/([^/]+)\/cancel/);
      const subId = subIdMatch ? subIdMatch[1] : "sub_cancelled";
      return {
        id: subId,
        entity: "subscription",
        status: "cancelled",
        cancel_at_cycle_end: 1,
      } as unknown as T;
    }
  }

  const method = options.method ?? "GET";
  const authHeader = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${authHeader}`,
    "Content-Type": "application/json",
  };

  const url = `https://api.razorpay.com/v1${endpoint}`;
  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Razorpay API ${method} ${endpoint} failed (${res.status}): ${errorText}`);
  }

  return (await res.json()) as T;
}

/**
 * Fetches subscription record directly from Razorpay for reconciliation and drift correction.
 */
export async function fetchRazorpaySubscription(
  subscriptionId: string
): Promise<Record<string, unknown>> {
  return callRazorpayApi(`/subscriptions/${subscriptionId}`, { method: "GET" });
}

/**
 * Creates or reuses the Razorpay customer record for an organization.
 */
export async function getOrCreateRazorpayCustomer(params: {
  orgId: string;
  actorId?: string | null;
  name: string;
  email?: string | null;
}): Promise<string> {
  const { orgId, actorId, name, email } = params;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const orgRes = await db.query<{ razorpay_customer_id: string | null }>(
      `select razorpay_customer_id from public.organizations where id = $1`,
      [orgId]
    );

    if (orgRes.rows[0]?.razorpay_customer_id) {
      return orgRes.rows[0].razorpay_customer_id;
    }

    const customer = await callRazorpayApi<{ id: string }>("/customers", {
      method: "POST",
      body: {
        name,
        email: email || undefined,
        notes: { org_id: orgId },
      },
    });

    await db.transaction(async (tx) => {
      await tx.query(`update public.organizations set razorpay_customer_id = $2 where id = $1`, [
        orgId,
        customer.id,
      ]);
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'razorpay_customer_created', 'organizations', $1, $3::jsonb)`,
        [orgId, actorId, JSON.stringify({ razorpay_customer_id: customer.id })]
      );
    });

    return customer.id;
  }

  const service = createSupabaseServiceRoleClient();
  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("razorpay_customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) throw orgError;
  if (org?.razorpay_customer_id) {
    return org.razorpay_customer_id;
  }

  const customer = await callRazorpayApi<{ id: string }>("/customers", {
    method: "POST",
    body: {
      name,
      email: email || undefined,
      notes: { org_id: orgId },
    },
  });

  await Promise.all([
    service.from("organizations").update({ razorpay_customer_id: customer.id }).eq("id", orgId),
    service.from("audit_log").insert({
      org_id: orgId,
      actor_id: actorId ?? null,
      action: "razorpay_customer_created",
      entity: "organizations",
      entity_id: orgId,
      diff: { razorpay_customer_id: customer.id },
    }),
  ]);

  return customer.id;
}

/**
 * Creates a new Razorpay subscription for the organization, handling:
 * 1. Plan validation (must be a valid paid plan: exporter_monthly, exporter_annual, consultant_monthly, consultant_annual).
 * 2. Already subscribed validation (if active on the same plan -> ConflictError).
 * 3. Plan change detection (if active on another paid plan -> creates new subscription and marks previous for cancellation).
 * 4. Inserting a `subscriptions` row with status "created".
 * 5. Audit logging.
 */
export async function createOrganizationSubscription(params: {
  orgId: string;
  actorId?: string | null;
  planKey: PlanKey;
  customerName?: string | null;
  customerEmail?: string | null;
}): Promise<CreateSubscriptionResult> {
  const { orgId, actorId, planKey, customerName, customerEmail } = params;

  if (planKey === "free" || planKey === "trial_pro") {
    throw new BadRequestError(
      "Cannot create a paid Razorpay subscription for free or trial plans."
    );
  }

  const plan = PLANS[planKey];
  if (!plan) {
    throw new ValidationError(`Unknown plan: ${planKey}`);
  }

  const creds = getRazorpayCredentials();
  const razorpayPlanId =
    getRazorpayPlanId(planKey) ||
    (creds.isTestPlaceholder || isPgliteTestAdapterEnabled() ? `plan_mock_${planKey}` : null);

  if (!razorpayPlanId) {
    throw new BadRequestError(
      `Razorpay plan ID for ${planKey} is not configured in environment variables.`
    );
  }

  // Determine total_count: 120 for monthly (10 years), 10 for annual (10 years)
  const totalCount = plan.billingPeriod === "annual" ? 10 : 120;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    // Check organization and current subscription
    const orgRes = await db.query<{
      id: string;
      name: string;
      plan_key: string;
      plan_status: string;
      razorpay_customer_id: string | null;
    }>(
      `select id, name, plan_key, plan_status, razorpay_customer_id
       from public.organizations
       where id = $1`,
      [orgId]
    );

    const org = orgRes.rows[0];
    if (!org) {
      throw new NotFoundError("Organization not found.");
    }

    // Check recent active subscriptions
    const activeSubRes = await db.query<{
      id: string;
      razorpay_subscription_id: string;
      plan_key: string;
      status: string;
    }>(
      `select id, razorpay_subscription_id, plan_key, status
       from public.subscriptions
       where org_id = $1
         and status in ('active', 'authenticated', 'pending')
       order by created_at desc
       limit 1`,
      [orgId]
    );

    const existingSub = activeSubRes.rows[0];
    if (existingSub) {
      if (existingSub.plan_key === planKey && org.plan_status === "active") {
        throw new ConflictError("Your organization is already subscribed to this plan.");
      }
    }

    const isPlanChange = Boolean(existingSub && existingSub.plan_key !== planKey);
    const previousSubscriptionId = existingSub ? existingSub.razorpay_subscription_id : null;

    // Get or create customer
    const customerId = await getOrCreateRazorpayCustomer({
      orgId,
      actorId,
      name: customerName || org.name,
      email: customerEmail,
    });

    // Create subscription on Razorpay
    const subResponse = await callRazorpayApi<{ id: string; status: string }>("/subscriptions", {
      method: "POST",
      body: {
        plan_id: razorpayPlanId,
        total_count: totalCount,
        customer_notify: 1,
        customer_id: customerId,
        notes: {
          org_id: orgId,
          plan_key: planKey,
        },
      },
    });

    const nowIso = new Date().toISOString();

    await db.transaction(async (tx) => {
      const insertedSub = await tx.query<{ id: string }>(
        `insert into public.subscriptions (
           org_id, razorpay_subscription_id, plan_key, status,
           paid_count, cancel_at_cycle_end, raw, created_at, updated_at
         )
         values ($1, $2, $3, 'created', 0, false, $4::jsonb, $5, $5)
         returning id`,
        [orgId, subResponse.id, planKey, JSON.stringify(subResponse), nowIso]
      );
      const subInternalId = insertedSub.rows[0]?.id;
      if (!subInternalId) throw new Error("Failed to insert subscription record.");

      const diffMeta = JSON.stringify({
        subscription_id: subResponse.id,
        plan_key: planKey,
        plan_id: razorpayPlanId,
        is_plan_change: isPlanChange,
        previous_subscription_id: previousSubscriptionId,
      });

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'subscription_created', 'subscriptions', $3, $4::jsonb)`,
        [orgId, actorId, subInternalId, diffMeta]
      );
    });

    return {
      subscriptionId: subResponse.id,
      keyId: creds.keyId,
      planKey,
      isPlanChange,
      previousSubscriptionId,
    };
  }

  // Supabase service role mode
  const service = createSupabaseServiceRoleClient();
  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id, name, plan_key, plan_status, razorpay_customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) throw orgError;
  if (!org) throw new NotFoundError("Organization not found.");

  const { data: existingSub } = await service
    .from("subscriptions")
    .select("id, razorpay_subscription_id, plan_key, status")
    .eq("org_id", orgId)
    .in("status", ["active", "authenticated", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSub) {
    if (existingSub.plan_key === planKey && org.plan_status === "active") {
      throw new ConflictError("Your organization is already subscribed to this plan.");
    }
  }

  const isPlanChange = Boolean(existingSub && existingSub.plan_key !== planKey);
  const previousSubscriptionId = existingSub ? existingSub.razorpay_subscription_id : null;

  const customerId = await getOrCreateRazorpayCustomer({
    orgId,
    actorId,
    name: customerName || org.name,
    email: customerEmail,
  });

  const subResponse = await callRazorpayApi<{ id: string; status: string }>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: razorpayPlanId,
      total_count: totalCount,
      customer_notify: 1,
      customer_id: customerId,
      notes: {
        org_id: orgId,
        plan_key: planKey,
      },
    },
  });

  const diffMeta = {
    subscription_id: subResponse.id,
    plan_key: planKey,
    plan_id: razorpayPlanId,
    is_plan_change: isPlanChange,
    previous_subscription_id: previousSubscriptionId,
  };

  const { data: insertedSub, error: insertError } = await service
    .from("subscriptions")
    .insert({
      org_id: orgId,
      razorpay_subscription_id: subResponse.id,
      plan_key: planKey,
      status: "created",
      paid_count: 0,
      cancel_at_cycle_end: false,
      raw: subResponse,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

  await service.from("audit_log").insert({
    org_id: orgId,
    actor_id: actorId ?? null,
    action: "subscription_created",
    entity: "subscriptions",
    entity_id: insertedSub.id,
    diff: diffMeta,
  });

  return {
    subscriptionId: subResponse.id,
    keyId: creds.keyId,
    planKey,
    isPlanChange,
    previousSubscriptionId,
  };
}

/**
 * Cancels a subscription at cycle end:
 * User retains access until `current_end`.
 */
export async function cancelOrganizationSubscription(params: {
  orgId: string;
  actorId?: string | null;
}): Promise<CancelSubscriptionResult> {
  const { orgId, actorId } = params;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const subRes = await db.query<{
      id: string;
      razorpay_subscription_id: string;
      status: string;
      current_end: string | null;
      cancel_at_cycle_end: boolean;
    }>(
      `select id, razorpay_subscription_id, status, current_end::text, cancel_at_cycle_end
       from public.subscriptions
       where org_id = $1
         and status in ('active', 'authenticated', 'pending', 'created')
       order by created_at desc
       limit 1`,
      [orgId]
    );

    const sub = subRes.rows[0];
    if (!sub) {
      throw new NotFoundError("No active subscription found to cancel.");
    }

    if (sub.cancel_at_cycle_end) {
      return {
        success: true,
        subscriptionId: sub.razorpay_subscription_id,
        cancelAtCycleEnd: true,
        currentEnd: sub.current_end,
      };
    }

    // Call Razorpay API to set cancel_at_cycle_end = 1
    await callRazorpayApi(`/subscriptions/${sub.razorpay_subscription_id}/cancel`, {
      method: "POST",
      body: { cancel_at_cycle_end: 1 },
    });

    const nowIso = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.query(
        `update public.subscriptions
         set cancel_at_cycle_end = true,
             updated_at = $2
         where id = $1`,
        [sub.id, nowIso]
      );

      const diffMeta = JSON.stringify({
        subscription_id: sub.razorpay_subscription_id,
        cancel_at_cycle_end: true,
        current_end: sub.current_end,
      });

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'subscription_cancelled_at_cycle_end', 'subscriptions', $3, $4::jsonb)`,
        [orgId, actorId, sub.id, diffMeta]
      );
    });

    return {
      success: true,
      subscriptionId: sub.razorpay_subscription_id,
      cancelAtCycleEnd: true,
      currentEnd: sub.current_end,
    };
  }

  const service = createSupabaseServiceRoleClient();
  const { data: sub, error: subError } = await service
    .from("subscriptions")
    .select("id, razorpay_subscription_id, status, current_end, cancel_at_cycle_end")
    .eq("org_id", orgId)
    .in("status", ["active", "authenticated", "pending", "created"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) throw subError;
  if (!sub) {
    throw new NotFoundError("No active subscription found to cancel.");
  }

  if (sub.cancel_at_cycle_end) {
    return {
      success: true,
      subscriptionId: sub.razorpay_subscription_id,
      cancelAtCycleEnd: true,
      currentEnd: sub.current_end,
    };
  }

  await callRazorpayApi(`/subscriptions/${sub.razorpay_subscription_id}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: 1 },
  });

  const diffMeta = {
    subscription_id: sub.razorpay_subscription_id,
    cancel_at_cycle_end: true,
    current_end: sub.current_end,
  };

  await Promise.all([
    service.from("subscriptions").update({ cancel_at_cycle_end: true }).eq("id", sub.id),
    service.from("audit_log").insert({
      org_id: orgId,
      actor_id: actorId ?? null,
      action: "subscription_cancelled_at_cycle_end",
      entity: "subscriptions",
      entity_id: sub.id,
      diff: diffMeta,
    }),
  ]);

  return {
    success: true,
    subscriptionId: sub.razorpay_subscription_id,
    cancelAtCycleEnd: true,
    currentEnd: sub.current_end,
  };
}

/**
 * Resolves current billing status for an organization for polling after checkout.
 */
export async function getOrganizationBillingStatus(orgId: string): Promise<OrgBillingStatusResult> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const [orgRes, subRes] = await Promise.all([
      db.query<{
        id: string;
        plan_key: string;
        plan_status: string;
        trial_ends_at: string | null;
      }>(
        `select id, plan_key, plan_status, trial_ends_at::text
         from public.organizations
         where id = $1`,
        [orgId]
      ),
      db.query<{
        id: string;
        razorpay_subscription_id: string;
        plan_key: string;
        status: string;
        current_start: string | null;
        current_end: string | null;
        cancel_at_cycle_end: boolean;
      }>(
        `select id, razorpay_subscription_id, plan_key, status,
                current_start::text, current_end::text, cancel_at_cycle_end
         from public.subscriptions
         where org_id = $1
         order by updated_at desc, created_at desc
         limit 1`,
        [orgId]
      ),
    ]);

    const org = orgRes.rows[0];
    if (!org) {
      throw new NotFoundError("Organization not found.");
    }

    const sub = subRes.rows[0] ?? null;
    const planKey = (org.plan_key as PlanKey) || "free";
    const isPaidPlanActive =
      org.plan_status === "active" && planKey !== "free" && planKey !== "trial_pro";

    return {
      orgId,
      planKey,
      planStatus: org.plan_status,
      isPaidPlanActive,
      trialEndsAt: org.trial_ends_at,
      subscription: sub
        ? {
            id: sub.id,
            razorpaySubscriptionId: sub.razorpay_subscription_id,
            planKey: sub.plan_key as PlanKey,
            status: sub.status,
            currentStart: sub.current_start,
            currentEnd: sub.current_end,
            cancelAtCycleEnd: sub.cancel_at_cycle_end,
          }
        : null,
    };
  }

  const service = createSupabaseServiceRoleClient();
  const [{ data: org, error: orgError }, { data: sub, error: subError }] = await Promise.all([
    service
      .from("organizations")
      .select("id, plan_key, plan_status, trial_ends_at")
      .eq("id", orgId)
      .maybeSingle(),
    service
      .from("subscriptions")
      .select(
        "id, razorpay_subscription_id, plan_key, status, current_start, current_end, cancel_at_cycle_end"
      )
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (orgError) throw orgError;
  if (!org) throw new NotFoundError("Organization not found.");
  if (subError) throw subError;

  const planKey = (org.plan_key as PlanKey) || "free";
  const isPaidPlanActive =
    org.plan_status === "active" && planKey !== "free" && planKey !== "trial_pro";

  return {
    orgId,
    planKey,
    planStatus: org.plan_status,
    isPaidPlanActive,
    trialEndsAt: org.trial_ends_at,
    subscription: sub
      ? {
          id: sub.id,
          razorpaySubscriptionId: sub.razorpay_subscription_id,
          planKey: sub.plan_key as PlanKey,
          status: sub.status,
          currentStart: sub.current_start,
          currentEnd: sub.current_end,
          cancelAtCycleEnd: sub.cancel_at_cycle_end,
        }
      : null,
  };
}
