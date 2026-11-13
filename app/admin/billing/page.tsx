import { redirect } from "next/navigation";
import {
  BillingEventsManager,
  type StoredPaymentEvent,
} from "@/components/admin/billing-events-manager";
import { getAuthenticatedUser } from "@/lib/auth/org-access";
import { maskPayloadSecrets } from "@/lib/billing/webhook-processor";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Billing & Webhooks",
};

export default async function AdminBillingPage() {
  const user = await getAuthenticatedUser();
  if (!user || !user.isPlatformAdmin) {
    redirect("/app");
  }

  let events: StoredPaymentEvent[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
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
    }>(
      `select id, provider, provider_event_id, event_type, org_id,
              payload, processed_at::text, error, created_at::text
       from public.payment_events
       order by created_at desc
       limit 50`
    );

    events = res.rows.map((row) => ({
      ...row,
      payload: maskPayloadSecrets(row.payload),
    }));
  } else {
    const service = createSupabaseServiceRoleClient();
    const { data: rows } = await service
      .from("payment_events")
      .select(
        "id, provider, provider_event_id, event_type, org_id, payload, processed_at, error, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    events = (rows ?? []).map((row) => ({
      ...row,
      payload: maskPayloadSecrets(row.payload),
    }));
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <BillingEventsManager initialEvents={events} />
    </div>
  );
}
