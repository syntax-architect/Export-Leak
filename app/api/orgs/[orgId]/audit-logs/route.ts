import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "admin");

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    let logs: unknown[] = [];
    let totalCount = 0;

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      const countRes = await db.query<{ count: string }>(
        `select count(*) as count from public.audit_log where org_id = $1`,
        [orgId]
      );
      totalCount = Number(countRes.rows[0]?.count || 0);

      const rowsRes = await db.query(
        `select id, org_id, actor_id, action, entity, entity_id, diff, created_at
         from public.audit_log
         where org_id = $1
         order by created_at desc
         limit $2 offset $3`,
        [orgId, limit, offset]
      );
      logs = rowsRes.rows;
    } else {
      const supabase = await createSupabaseServerClient();
      const { data, count, error } = await supabase
        .from("audit_log")
        .select("id, org_id, actor_id, action, entity, entity_id, diff, created_at", {
          count: "exact",
        })
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      logs = data || [];
      totalCount = count || 0;
    }

    return NextResponse.json({
      logs,
      totalCount,
      limit,
      offset,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch audit logs";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
