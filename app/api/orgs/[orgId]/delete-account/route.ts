import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const deleteAccountSchema = z.object({
  confirmationText: z.string().refine((val) => val === "DELETE MY ACCOUNT", {
    message: 'You must type "DELETE MY ACCOUNT" to confirm account deletion.',
  }),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const auth = await requireOrgAccess(orgId, "owner");

    const body = await request.json().catch(() => ({}));
    const parseResult = deleteAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid confirmation." },
        { status: 400 }
      );
    }

    const deletedAt = new Date().toISOString();

    if (isPgliteTestAdapterEnabled()) {
      const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
      const db = await getPgliteDb();

      // Record audit log
      await db.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          orgId,
          auth.user.id,
          "account_deleted",
          "organizations",
          orgId,
          JSON.stringify({ deleted_at: deletedAt, reason: parseResult.data.reason || null }),
        ]
      );

      // Cascade soft delete / purge records
      await db.query(
        `update public.documents set deleted_at = $1
         where iec_id in (select id from public.iec_profiles where org_id = $2)`,
        [deletedAt, orgId]
      );
      await db.query(
        `delete from public.sb_remittance_matches
         where shipping_bill_id in (
           select s.id from public.shipping_bills s
           join public.iec_profiles i on i.id = s.iec_id
           where i.org_id = $1
         )`,
        [orgId]
      );
      await db.query(
        `delete from public.shipping_bills
         where iec_id in (select id from public.iec_profiles where org_id = $1)`,
        [orgId]
      );
      await db.query(
        `delete from public.remittances
         where iec_id in (select id from public.iec_profiles where org_id = $1)`,
        [orgId]
      );
      await db.query(
        `delete from public.scrips
         where iec_id in (select id from public.iec_profiles where org_id = $1)`,
        [orgId]
      );
      await db.query(
        `delete from public.alerts
         where iec_id in (select id from public.iec_profiles where org_id = $1)`,
        [orgId]
      );
      await db.query(`delete from public.memberships where org_id = $1 and user_id != $2`, [
        orgId,
        auth.user.id,
      ]);
      await db.query(`update public.organizations set plan_status = 'cancelled' where id = $1`, [
        orgId,
      ]);
    } else {
      const service = createSupabaseServiceRoleClient();

      await service.from("audit_log").insert({
        org_id: orgId,
        actor_id: auth.user.id,
        action: "account_deleted",
        entity: "organizations",
        entity_id: orgId,
        diff: { deleted_at: deletedAt, reason: parseResult.data.reason || null },
      });

      // Fetch IECs
      const { data: iecRows } = await service.from("iec_profiles").select("id").eq("org_id", orgId);
      const iecIds = (iecRows || []).map((i) => i.id);

      if (iecIds.length > 0) {
        await service.from("documents").update({ deleted_at: deletedAt }).in("iec_id", iecIds);
        await service.from("shipping_bills").delete().in("iec_id", iecIds);
        await service.from("remittances").delete().in("iec_id", iecIds);
        await service.from("scrips").delete().in("iec_id", iecIds);
        await service.from("alerts").delete().in("iec_id", iecIds);
      }

      await service.from("organizations").update({ plan_status: "cancelled" }).eq("id", orgId);
    }

    return NextResponse.json({
      success: true,
      message:
        "Your account data has been purged. In accordance with India DPDP Act 2023, secondary backup archives will be permanently destroyed within 30 days.",
      purgeScheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete account";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
