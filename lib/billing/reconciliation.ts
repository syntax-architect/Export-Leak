import { fetchRazorpaySubscription } from "@/lib/billing/razorpay";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface ReconciliationResult {
  checkedCount: number;
  driftCount: number;
  drifts: Array<{
    orgId: string;
    subscriptionId: string;
    previousStatus: string;
    newStatus: string;
  }>;
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
 * Daily reconciliation job: fetches active/pending subscriptions directly from Razorpay's API
 * to detect and fix any state drift from dropped or missed webhooks.
 */
export async function runDailySubscriptionReconciliationJob(): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    checkedCount: 0,
    driftCount: 0,
    drifts: [],
  };

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const openSubs = await db.query<{
      id: string;
      org_id: string;
      razorpay_subscription_id: string;
      plan_key: string;
      status: string;
      current_start: string | null;
      current_end: string | null;
      paid_count: number;
    }>(
      `select id, org_id, razorpay_subscription_id, plan_key, status,
              current_start::text, current_end::text, paid_count
       from public.subscriptions
       where status in ('created', 'authenticated', 'pending', 'active', 'paused')`
    );

    result.checkedCount = openSubs.rows.length;

    for (const sub of openSubs.rows) {
      try {
        const liveSub = await fetchRazorpaySubscription(sub.razorpay_subscription_id);
        const liveStatus = String(liveSub.status || sub.status);
        const livePaidCount =
          typeof liveSub.paid_count === "number" ? liveSub.paid_count : sub.paid_count;
        const liveCurrentEnd =
          parseTimestampToIso(liveSub.current_end as number | undefined) || sub.current_end;

        if (liveStatus !== sub.status || livePaidCount !== sub.paid_count) {
          result.driftCount += 1;
          result.drifts.push({
            orgId: sub.org_id,
            subscriptionId: sub.razorpay_subscription_id,
            previousStatus: sub.status,
            newStatus: liveStatus,
          });

          const nowIso = new Date().toISOString();
          await db.transaction(async (tx) => {
            await tx.query(
              `update public.subscriptions
               set status = $2,
                   paid_count = $3,
                   current_end = $4,
                   updated_at = $5
               where id = $1`,
              [sub.id, liveStatus, livePaidCount, liveCurrentEnd, nowIso]
            );

            if (liveStatus === "active") {
              await tx.query(
                `update public.organizations
                 set plan_key = $2, plan_status = 'active', updated_at = $3
                 where id = $1`,
                [sub.org_id, sub.plan_key, nowIso]
              );
            } else if (liveStatus === "halted") {
              await tx.query(
                `update public.organizations
                 set plan_key = 'free', plan_status = 'halted', updated_at = $3
                 where id = $1`,
                [sub.org_id, nowIso]
              );
            }

            await tx.query(
              `insert into public.audit_log (org_id, action, entity, entity_id, diff)
               values ($1, 'subscription_reconciled', 'subscriptions', $2, $3::jsonb)`,
              [
                sub.org_id,
                sub.id,
                JSON.stringify({
                  previous_status: sub.status,
                  reconciled_status: liveStatus,
                  previous_paid_count: sub.paid_count,
                  new_paid_count: livePaidCount,
                }),
              ]
            );
          });
        }
      } catch {
        // Continue reconciling other subscriptions
      }
    }

    return result;
  }

  const service = createSupabaseServiceRoleClient();
  const { data: openSubs, error } = await service
    .from("subscriptions")
    .select(
      "id, org_id, razorpay_subscription_id, plan_key, status, current_start, current_end, paid_count"
    )
    .in("status", ["created", "authenticated", "pending", "active", "paused"]);

  if (error || !openSubs) return result;
  result.checkedCount = openSubs.length;

  for (const sub of openSubs) {
    try {
      const liveSub = await fetchRazorpaySubscription(sub.razorpay_subscription_id);
      const liveStatus = String(liveSub.status || sub.status);
      const livePaidCount =
        typeof liveSub.paid_count === "number" ? liveSub.paid_count : sub.paid_count;
      const liveCurrentEnd =
        parseTimestampToIso(liveSub.current_end as number | undefined) || sub.current_end;

      if (liveStatus !== sub.status || livePaidCount !== sub.paid_count) {
        result.driftCount += 1;
        result.drifts.push({
          orgId: sub.org_id,
          subscriptionId: sub.razorpay_subscription_id,
          previousStatus: sub.status,
          newStatus: liveStatus,
        });

        const nowIso = new Date().toISOString();
        await Promise.all([
          service
            .from("subscriptions")
            .update({
              status: liveStatus,
              paid_count: livePaidCount,
              current_end: liveCurrentEnd,
              updated_at: nowIso,
            })
            .eq("id", sub.id),
          liveStatus === "active"
            ? service
                .from("organizations")
                .update({ plan_key: sub.plan_key, plan_status: "active", updated_at: nowIso })
                .eq("id", sub.org_id)
            : liveStatus === "halted"
              ? service
                  .from("organizations")
                  .update({ plan_key: "free", plan_status: "halted", updated_at: nowIso })
                  .eq("id", sub.org_id)
              : Promise.resolve(),
          service.from("audit_log").insert({
            org_id: sub.org_id,
            action: "subscription_reconciled",
            entity: "subscriptions",
            entity_id: sub.id,
            diff: {
              previous_status: sub.status,
              reconciled_status: liveStatus,
              previous_paid_count: sub.paid_count,
              new_paid_count: livePaidCount,
            },
          }),
        ]);
      }
    } catch {
      // Continue reconciling
    }
  }

  return result;
}
