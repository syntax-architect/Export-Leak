import { NextResponse, type NextRequest } from "next/server";
import { BadRequestError, NotFoundError, toErrorResponse } from "@/lib/auth/errors";
import { requirePlatformAdmin } from "@/lib/auth/org-access";
import { processRazorpayWebhook } from "@/lib/billing/webhook-processor";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      eventId?: string;
    };

    const eventId = body.eventId?.trim();
    if (!eventId) {
      throw new BadRequestError("Valid event ID is required.");
    }

    let rawPayloadText: string | null = null;
    let providerEventId: string = eventId;

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();
      const res = await db.query<{ payload: unknown; provider_event_id: string }>(
        `select payload, provider_event_id from public.payment_events
         where id::text = $1 or provider_event_id = $1 limit 1`,
        [eventId]
      );

      if (!res.rows[0]) {
        throw new NotFoundError("Payment event not found.");
      }

      rawPayloadText =
        typeof res.rows[0].payload === "string"
          ? res.rows[0].payload
          : JSON.stringify(res.rows[0].payload);
      providerEventId = res.rows[0].provider_event_id;
    } else {
      const service = createSupabaseServiceRoleClient();
      const { data, error } = await service
        .from("payment_events")
        .select("payload, provider_event_id")
        .or(`id.eq.${eventId},provider_event_id.eq.${eventId}`)
        .maybeSingle();

      if (error || !data) {
        throw new NotFoundError("Payment event not found.");
      }

      rawPayloadText =
        typeof data.payload === "string" ? data.payload : JSON.stringify(data.payload);
      providerEventId = data.provider_event_id;
    }

    // Reprocess using webhook engine (signature already verified originally)
    const result = await processRazorpayWebhook({
      rawBody: rawPayloadText,
      skipSignatureVerification: true,
      eventIdHeader: providerEventId,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
