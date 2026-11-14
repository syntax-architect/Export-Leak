import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AlertSeverity } from "@/lib/database.types";
import type { StoredAlertItem } from "@/lib/alerts/types";

interface SupabaseAlertRow {
  id: string;
  iec_id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  shipping_bill_id: string | null;
  due_on: string | null;
  resolved_at: string | null;
  snoozed_until: string | null;
  sent_channels: string[] | null;
  entity_type: string | null;
  entity_id: string | null;
  threshold: number | null;
  dedup_key: string | null;
  created_at: string;
  iec_profiles: { org_id: string; iec_code: string; legal_name: string } | null;
  shipping_bills: { sb_number: string } | null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "viewer");
    const { searchParams } = new URL(request.url);
    const filterIecId = searchParams.get("iecId");
    const filterStatus = searchParams.get("status") ?? "open";
    const filterSeverity = searchParams.get("severity");

    let alerts: StoredAlertItem[] = [];

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      let query = `
        select a.id, a.iec_id as "iecId", i.iec_code as "iecCode", i.legal_name as "legalName",
               a.kind, a.severity, a.title, a.message, a.shipping_bill_id as "shippingBillId",
               sb.sb_number as "sbNumber", a.due_on::text as "dueOn", a.resolved_at::text as "resolvedAt",
               a.snoozed_until::text as "snoozedUntil", a.sent_channels as "sentChannels",
               a.entity_type as "entityType", a.entity_id as "entityId", a.threshold, a.dedup_key as "dedupKey",
               a.created_at::text as "createdAt"
        from public.alerts a
        join public.iec_profiles i on i.id = a.iec_id
        left join public.shipping_bills sb on sb.id = a.shipping_bill_id
        where i.org_id = $1
      `;
      const params: unknown[] = [orgId];

      if (filterIecId) {
        params.push(filterIecId);
        query += ` and a.iec_id = $${params.length}`;
      }

      if (filterStatus === "open") {
        query += ` and a.resolved_at is null and (a.snoozed_until is null or a.snoozed_until <= now())`;
      } else if (filterStatus === "resolved") {
        query += ` and a.resolved_at is not null`;
      } else if (filterStatus === "snoozed") {
        query += ` and a.resolved_at is null and a.snoozed_until > now()`;
      }

      if (filterSeverity) {
        params.push(filterSeverity);
        query += ` and a.severity = $${params.length}`;
      }

      query += ` order by a.created_at desc limit 200`;

      const res = await db.query<StoredAlertItem>(query, params);
      alerts = res.rows;
    } else {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("alerts")
        .select(
          `id, iec_id, kind, severity, title, message, shipping_bill_id, due_on,
           resolved_at, snoozed_until, sent_channels, entity_type, entity_id, threshold, dedup_key, created_at,
           iec_profiles!inner(org_id, iec_code, legal_name),
           shipping_bills(sb_number)`
        )
        .eq("iec_profiles.org_id", orgId);

      if (filterIecId) {
        query = query.eq("iec_id", filterIecId);
      }

      if (filterStatus === "open") {
        query = query.is("resolved_at", null);
      } else if (filterStatus === "resolved") {
        query = query.not("resolved_at", "is", null);
      }

      if (filterSeverity) {
        query = query.eq("severity", filterSeverity as AlertSeverity);
      }

      query = query.order("created_at", { ascending: false }).limit(200);

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }

      alerts = ((data ?? []) as unknown as SupabaseAlertRow[]).map((r) => ({
        id: r.id,
        iecId: r.iec_id,
        iecCode: r.iec_profiles?.iec_code,
        legalName: r.iec_profiles?.legal_name,
        kind: r.kind,
        severity: r.severity,
        title: r.title,
        message: r.message,
        shippingBillId: r.shipping_bill_id,
        sbNumber: r.shipping_bills?.sb_number,
        dueOn: r.due_on,
        resolvedAt: r.resolved_at,
        snoozedUntil: r.snoozed_until,
        sentChannels: r.sent_channels ?? [],
        entityType: r.entity_type,
        entityId: r.entity_id,
        threshold: r.threshold,
        dedupKey: r.dedup_key,
        createdAt: r.created_at,
      }));
    }

    return NextResponse.json({ alerts });
  } catch (error) {
    return toErrorResponse(error);
  }
}
