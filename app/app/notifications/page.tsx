import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getNotificationPreferences } from "@/lib/alerts/preferences";
import { AlertsCentre } from "@/components/notifications/alerts-centre";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { APP_CONFIG } from "@/config/app";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StoredAlertItem } from "@/lib/alerts/types";

interface SupabaseNotificationAlertRow {
  id: string;
  iec_id: string;
  kind: string;
  severity: StoredAlertItem["severity"];
  title: string;
  message: string;
  shipping_bill_id: string | null;
  due_on: string | null;
  resolved_at: string | null;
  snoozed_until: string | null;
  sent_channels: string[] | null;
  created_at: string;
  iec_profiles: { org_id: string; iec_code: string; legal_name: string } | null;
  shipping_bills: { sb_number: string } | null;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Alerts & Notification Settings | ${APP_CONFIG.name}`,
  description:
    "Monitor approaching realisation deadlines, expiring duty scrips, and manage notification preferences.",
};

export default async function NotificationsPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await props.searchParams;
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/app/notifications");
  }

  const organizations = await listUserOrganizations(user.id);
  if (organizations.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === requestedOrgId) ?? organizations[0];
  if (!activeOrg) {
    redirect("/onboarding");
  }

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);
  const entitlements = await getEntitlements(activeOrg.orgId);
  const planAllowsEmail = entitlements.entitlements.alertsChannels.includes("email");

  const preferences = await getNotificationPreferences(activeOrg.orgId, user.id);

  // Fetch initial open alerts
  let initialAlerts: StoredAlertItem[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<StoredAlertItem>(
      `select a.id, a.iec_id as "iecId", i.iec_code as "iecCode", i.legal_name as "legalName",
              a.kind, a.severity, a.title, a.message, a.shipping_bill_id as "shippingBillId",
              sb.sb_number as "sbNumber", a.due_on::text as "dueOn", a.resolved_at::text as "resolvedAt",
              a.snoozed_until::text as "snoozedUntil", a.sent_channels as "sentChannels",
              a.created_at::text as "createdAt"
       from public.alerts a
       join public.iec_profiles i on i.id = a.iec_id
       left join public.shipping_bills sb on sb.id = a.shipping_bill_id
       where i.org_id = $1 and a.resolved_at is null and (a.snoozed_until is null or a.snoozed_until <= now())
       order by a.created_at desc limit 100`,
      [activeOrg.orgId]
    );
    initialAlerts = res.rows;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("alerts")
      .select(
        `id, iec_id, kind, severity, title, message, shipping_bill_id, due_on,
         resolved_at, snoozed_until, sent_channels, created_at,
         iec_profiles!inner(org_id, iec_code, legal_name),
         shipping_bills(sb_number)`
      )
      .eq("iec_profiles.org_id", activeOrg.orgId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    initialAlerts = ((data ?? []) as unknown as SupabaseNotificationAlertRow[]).map((r) => ({
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
      createdAt: r.created_at,
    }));
  }

  const defaultTab = tab === "preferences" ? "preferences" : "alerts";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text">
            Alerts &amp; Notification Settings
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">
            Proactive compliance monitoring for FEMA realisation deadlines, duty scrip expiry, and
            export incentives.
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm mb-4">
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            <span>Open Alerts ({initialAlerts.length})</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings className="h-4 w-4" />
            <span>Preferences</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
          <AlertsCentre
            orgId={activeOrg.orgId}
            initialAlerts={initialAlerts}
            iecs={iecs.map((i: { id: string; iecCode: string; legalName: string }) => ({
              id: i.id,
              iecCode: i.iecCode,
              legalName: i.legalName,
            }))}
            isConsultant={activeOrg.type === "consultant"}
          />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          <NotificationPreferencesForm
            orgId={activeOrg.orgId}
            initialPreferences={preferences}
            iecs={iecs.map((i: { id: string; iecCode: string; legalName: string }) => ({
              id: i.id,
              iecCode: i.iecCode,
              legalName: i.legalName,
            }))}
            isConsultant={activeOrg.type === "consultant"}
            planAllowsEmail={planAllowsEmail}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
