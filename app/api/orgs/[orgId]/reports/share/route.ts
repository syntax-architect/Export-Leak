import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface CreateSharedReportInput {
  title?: string;
  iecId?: string | null;
  totals: {
    totalShipments: number;
    totalFobMinor: number;
    totalExpectedMinor: number;
    totalCreditedMinor: number;
    totalUnclaimedMinor: number;
    overdueCount?: number;
    expiringScripsCount?: number;
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "viewer");
    const body: CreateSharedReportInput = await request.json().catch(() => ({}));

    if (!body || !body.totals) {
      return NextResponse.json(
        { error: "Summary totals are required to generate a shared report." },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const title = body.title?.trim() || "Export Reconciliation Summary";
    const iecId = body.iecId && body.iecId.trim() ? body.iecId.trim() : null;

    let savedReport: {
      id: string;
      token: string;
      expires_at: string;
    };

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      const res = await db.query<{ id: string; token: string; expires_at: string }>(
        `insert into public.shared_reports
           (org_id, iec_id, token, title, totals, expires_at)
         values ($1, $2, $3, $4, $5, now() + interval '30 days')
         returning id, token, expires_at::text`,
        [orgId, iecId, token, title, JSON.stringify(body.totals)]
      );

      const first = res.rows[0];
      if (!first) throw new Error("Failed to insert shared report");
      savedReport = first;

      await db.query(
        `insert into public.audit_log
           (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'shared_report_created', 'shared_reports', $3, $4)`,
        [orgId, access.user.id, savedReport.id, JSON.stringify({ token, title, iecId })]
      );
    } else {
      const supabase = await createSupabaseServerClient();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("shared_reports")
        .insert({
          org_id: orgId,
          iec_id: iecId,
          token,
          title,
          totals: body.totals,
          expires_at: expiresAt,
        })
        .select("id, token, expires_at")
        .single();

      if (error || !data) {
        throw new Error(`Failed to create shared report: ${error?.message}`);
      }

      savedReport = data;

      await supabase.from("audit_log").insert({
        org_id: orgId,
        actor_id: access.user.id,
        action: "shared_report_created",
        entity: "shared_reports",
        entity_id: savedReport.id,
        diff: { token, title, iecId },
      });
    }

    return NextResponse.json({
      success: true,
      id: savedReport.id,
      token: savedReport.token,
      sharePath: `/share/${savedReport.token}`,
      expiresAt: savedReport.expires_at,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
