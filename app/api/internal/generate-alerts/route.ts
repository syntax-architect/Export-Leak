import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateAlertsForIec } from "@/lib/alerts/engine";
import { dispatchCandidateAlerts } from "@/lib/alerts/notifier";

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.EXPORTLEAK_INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  const actualBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(secret, "utf8");
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      throw new UnauthorizedError("Invalid cron authorization.");
    }

    let targetIecId: string | null = null;
    let clockIso: string | undefined = undefined;

    try {
      const body = await request.json();
      if (body?.iecId && typeof body.iecId === "string") {
        targetIecId = body.iecId;
      }
      if (body?.clockIso && typeof body.clockIso === "string") {
        clockIso = body.clockIso;
      }
    } catch {
      // Body is optional
    }

    let iecIds: string[] = [];

    if (targetIecId) {
      iecIds = [targetIecId];
    } else if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();
      const res = await db.query<{ id: string }>(`select id from public.iec_profiles`);
      iecIds = res.rows.map((r: { id: string }) => r.id);
    } else {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("iec_profiles").select("id");
      iecIds = (data ?? []).map((r) => r.id);
    }

    let totalGenerated = 0;
    let totalAutoResolved = 0;
    let totalEmailsSent = 0;

    for (const iecId of iecIds) {
      const result = await generateAlertsForIec(iecId, { clockIso });
      totalGenerated += result.generatedCount;
      totalAutoResolved += result.autoResolvedCount;

      if (result.alerts.length > 0) {
        const dispatch = await dispatchCandidateAlerts(iecId, result.alerts);
        totalEmailsSent += dispatch.emailsSent;
      }
    }

    return NextResponse.json({
      success: true,
      processedIecs: iecIds.length,
      generatedCount: totalGenerated,
      autoResolvedCount: totalAutoResolved,
      emailsSent: totalEmailsSent,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
