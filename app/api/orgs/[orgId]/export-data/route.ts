import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const auth = await requireOrgAccess(orgId, "viewer");

    let exportPayload: Record<string, unknown>;

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      const [orgRes, iecRes, docRes, sbRes, irmRes, matchRes, scripRes, alertRes, subRes] =
        await Promise.all([
          db.query(`select * from public.organizations where id = $1`, [orgId]),
          db.query(`select * from public.iec_profiles where org_id = $1`, [orgId]),
          db.query(
            `select d.id, d.iec_id, d.kind, d.original_name, d.sha256, d.parse_status, d.created_at
             from public.documents d
             join public.iec_profiles i on i.id = d.iec_id
             where i.org_id = $1`,
            [orgId]
          ),
          db.query(
            `select s.*
             from public.shipping_bills s
             join public.iec_profiles i on i.id = s.iec_id
             where i.org_id = $1`,
            [orgId]
          ),
          db.query(
            `select r.*
             from public.remittances r
             join public.iec_profiles i on i.id = r.iec_id
             where i.org_id = $1`,
            [orgId]
          ),
          db.query(
            `select m.*
             from public.sb_remittance_matches m
             join public.shipping_bills s on s.id = m.shipping_bill_id
             join public.iec_profiles i on i.id = s.iec_id
             where i.org_id = $1`,
            [orgId]
          ),
          db.query(
            `select sc.*
             from public.scrips sc
             join public.iec_profiles i on i.id = sc.iec_id
             where i.org_id = $1`,
            [orgId]
          ),
          db.query(
            `select a.*
             from public.alerts a
             join public.iec_profiles i on i.id = a.iec_id
             where i.org_id = $1`,
            [orgId]
          ),
          db.query(`select * from public.subscriptions where org_id = $1`, [orgId]),
        ]);

      // Record export in audit_log
      await db.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'org_data_exported', 'organizations', $1, $3::jsonb)`,
        [orgId, auth.user.id, JSON.stringify({ exported_at: new Date().toISOString() })]
      );

      exportPayload = {
        exportedAt: new Date().toISOString(),
        formatVersion: "1.0",
        organization: orgRes.rows[0] ?? null,
        iecProfiles: iecRes.rows,
        documents: docRes.rows,
        shippingBills: sbRes.rows,
        remittances: irmRes.rows,
        matches: matchRes.rows,
        scrips: scripRes.rows,
        alerts: alertRes.rows,
        subscriptions: subRes.rows,
      };
    } else {
      const service = createSupabaseServiceRoleClient();

      const [orgRes, iecRes, subRes] = await Promise.all([
        service.from("organizations").select("*").eq("id", orgId).maybeSingle(),
        service.from("iec_profiles").select("*").eq("org_id", orgId),
        service.from("subscriptions").select("*").eq("org_id", orgId),
      ]);

      const iecIds = (iecRes.data ?? []).map((i) => i.id);

      let documents: unknown[] = [];
      let shippingBills: unknown[] = [];
      let remittances: unknown[] = [];
      let scrips: unknown[] = [];
      let alerts: unknown[] = [];

      if (iecIds.length > 0) {
        const [docData, sbData, remData, scripData, alertData] = await Promise.all([
          service
            .from("documents")
            .select("id, iec_id, kind, original_name, sha256, parse_status, created_at")
            .in("iec_id", iecIds),
          service.from("shipping_bills").select("*").in("iec_id", iecIds),
          service.from("remittances").select("*").in("iec_id", iecIds),
          service.from("scrips").select("*").in("iec_id", iecIds),
          service.from("alerts").select("*").in("iec_id", iecIds),
        ]);
        documents = docData.data ?? [];
        shippingBills = sbData.data ?? [];
        remittances = remData.data ?? [];
        scrips = scripData.data ?? [];
        alerts = alertData.data ?? [];
      }

      await service.from("audit_log").insert({
        org_id: orgId,
        actor_id: auth.user.id,
        action: "org_data_exported",
        entity: "organizations",
        entity_id: orgId,
        diff: { exported_at: new Date().toISOString() },
      });

      exportPayload = {
        exportedAt: new Date().toISOString(),
        formatVersion: "1.0",
        organization: orgRes.data ?? null,
        iecProfiles: iecRes.data ?? [],
        documents,
        shippingBills,
        remittances,
        matches: [],
        scrips,
        alerts,
        subscriptions: subRes.data ?? [],
      };
    }

    const jsonString = JSON.stringify(exportPayload, null, 2);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="exportleak-data-${orgId}.json"`,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Data export failed";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
