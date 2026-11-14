import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface BillingHistoryItem {
  id: string;
  providerEventId: string;
  eventType: string;
  amountPaise: number;
  planKey: string;
  status: "paid" | "failed" | "refunded" | "processing";
  createdAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId parameter" }, { status: 400 });
    }

    await requireOrgAccess(orgId, "viewer");

    let historyItems: BillingHistoryItem[] = [];

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      const res = await db.query<{
        id: string;
        provider_event_id: string;
        event_type: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>(
        `select id, provider_event_id, event_type, payload, created_at::text
         from public.payment_events
         where org_id = $1
         order by created_at desc
         limit 50`,
        [orgId]
      );

      historyItems = res.rows.map((row) => {
        const payload = (row.payload ?? {}) as {
          payload?: {
            payment?: { entity?: { amount?: number } };
            subscription?: { entity?: { notes?: { plan_key?: string } } };
          };
        };

        const amountPaise = Number(payload.payload?.payment?.entity?.amount ?? 99900);
        const planKey =
          payload.payload?.subscription?.entity?.notes?.plan_key || "exporter_monthly";

        let status: BillingHistoryItem["status"] = "paid";
        if (row.event_type.includes("failed")) {
          status = "failed";
        } else if (row.event_type.includes("refund")) {
          status = "refunded";
        }

        return {
          id: row.id,
          providerEventId: row.provider_event_id,
          eventType: row.event_type,
          amountPaise,
          planKey,
          status,
          createdAt: row.created_at,
        };
      });
    } else {
      const service = createSupabaseServiceRoleClient();
      const { data } = await service
        .from("payment_events")
        .select("id, provider_event_id, event_type, payload, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);

      historyItems = (data ?? []).map((row) => {
        const payload = (row.payload ?? {}) as {
          payload?: {
            payment?: { entity?: { amount?: number } };
            subscription?: { entity?: { notes?: { plan_key?: string } } };
          };
        };
        const amountPaise = Number(payload.payload?.payment?.entity?.amount ?? 99900);
        const planKey =
          payload.payload?.subscription?.entity?.notes?.plan_key || "exporter_monthly";

        let status: BillingHistoryItem["status"] = "paid";
        if (row.event_type.includes("failed")) {
          status = "failed";
        } else if (row.event_type.includes("refund")) {
          status = "refunded";
        }

        return {
          id: row.id,
          providerEventId: row.provider_event_id,
          eventType: row.event_type,
          amountPaise,
          planKey,
          status,
          createdAt: row.created_at,
        };
      });
    }

    return NextResponse.json({ events: historyItems }, { status: 200 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load billing history";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}