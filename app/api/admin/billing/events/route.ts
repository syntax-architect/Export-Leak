import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requirePlatformAdmin } from "@/lib/auth/org-access";
import { maskPayloadSecrets } from "@/lib/billing/webhook-processor";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "50", 10))
    );

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      let query = `
        select id, provider, provider_event_id, event_type, org_id,
               payload, processed_at::text, error, created_at::text
        from public.payment_events
      `;
      const params: unknown[] = [];

      if (search) {
        query += ` where provider_event_id ilike $1 or event_type ilike $1 or payload::text ilike $1`;
        params.push(`%${search}%`);
      }

      query += ` order by created_at desc limit ${limit}`;
      const res = await db.query<{
        id: string;
        provider: string;
        provider_event_id: string;
        event_type: string;
        org_id: string | null;
        payload: unknown;
        processed_at: string | null;
        error: string | null;
        created_at: string;
      }>(query, params);

      const events = res.rows.map((row) => ({
        ...row,
        payload: maskPayloadSecrets(row.payload),
      }));

      return NextResponse.json({ events });
    }

    const service = createSupabaseServiceRoleClient();
    let query = service
      .from("payment_events")
      .select(
        "id, provider, provider_event_id, event_type, org_id, payload, processed_at, error, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`provider_event_id.ilike.%${search}%,event_type.ilike.%${search}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const events = (rows ?? []).map((row) => ({
      ...row,
      payload: maskPayloadSecrets(row.payload),
    }));

    return NextResponse.json({ events });
  } catch (error) {
    return toErrorResponse(error);
  }
}
