import { APP_CONFIG } from "@/config/app";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/billing/entitlements";
import { sendEmail } from "@/lib/email/resend";
import {
  buildDeadlineEmail,
  buildScripEmail,
  buildPaymentProblemEmail,
  formatWhatsAppMessage,
} from "@/lib/alerts/templates";
import { getNotificationPreferences } from "@/lib/alerts/preferences";
import type { CandidateAlert } from "@/lib/alerts/types";

interface OrgMemberUser {
  userId: string;
  email: string;
  role: string;
}

interface RawIecProfile {
  id: string;
  org_id: string;
  iec_code: string;
  legal_name: string;
}

interface RawShippingBillForEmail {
  id: string;
  sb_number: string;
  port_code: string;
  currency: string;
  fob_minor: number;
}

interface RawScripForEmail {
  id: string;
  scrip_number: string;
  scheme: string;
  face_minor: number;
  expires_on: string;
}

interface RawTemplate {
  key: string;
  body_template: string;
}

function isQuietHours(start: string, end: string, now: Date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_CONFIG.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const currentMins = hh * 60 + mm;

    const [sH, sM] = start.split(":").map(Number);
    const [eH, eM] = end.split(":").map(Number);
    const startMins = (sH || 0) * 60 + (sM || 0);
    const endMins = (eH || 0) * 60 + (eM || 0);

    if (startMins <= endMins) {
      return currentMins >= startMins && currentMins < endMins;
    }
    return currentMins >= startMins || currentMins < endMins;
  } catch {
    return false;
  }
}

export async function dispatchCandidateAlerts(
  iecId: string,
  alerts: CandidateAlert[],
  options?: {
    fakeNow?: Date;
    baseUrl?: string;
  }
): Promise<{
  emailsSent: number;
  inAppDispatched: number;
  queuedDigests: number;
  skippedCount: number;
}> {
  if (alerts.length === 0) {
    return { emailsSent: 0, inAppDispatched: 0, queuedDigests: 0, skippedCount: 0 };
  }

  const now = options?.fakeNow ?? new Date();
  const baseUrl = options?.baseUrl ?? "https://app.exportleak.example";

  let iec: RawIecProfile | null = null;
  let members: OrgMemberUser[] = [];
  const shippingBills = new Map<string, RawShippingBillForEmail>();
  const scrips = new Map<string, RawScripForEmail>();
  const whatsappTemplates = new Map<string, string>();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const iecRes = await db.query<RawIecProfile>(
      `select id, org_id, iec_code, legal_name from public.iec_profiles where id = $1`,
      [iecId]
    );
    iec = iecRes.rows[0] ?? null;

    if (iec) {
      const memRes = await db.query<{ userId: string; email: string | null; role: string }>(
        `select m.user_id as "userId", u.email as "email", m.role as "role"
         from public.memberships m
         left join auth.users u on u.id = m.user_id
         where m.org_id = $1`,
        [iec.org_id]
      );
      members = memRes.rows.map((r) => ({
        userId: r.userId,
        email: r.email || `user_${r.userId.slice(0, 8)}@example.com`,
        role: r.role,
      }));

      const sbRes = await db.query<RawShippingBillForEmail>(
        `select id, sb_number, port_code, currency, fob_minor
         from public.shipping_bills where iec_id = $1`,
        [iecId]
      );
      for (const sb of sbRes.rows) {
        shippingBills.set(sb.id, sb);
      }

      const scRes = await db.query<RawScripForEmail>(
        `select id, scrip_number, scheme, face_minor, expires_on::text
         from public.scrips where iec_id = $1`,
        [iecId]
      );
      for (const sc of scRes.rows) {
        scrips.set(sc.id, sc);
      }

      const tRes = await db.query<RawTemplate>(
        `select key, body_template from public.notification_templates where channel = 'whatsapp' and active = true`
      );
      for (const t of tRes.rows) {
        whatsappTemplates.set(t.key, t.body_template);
      }
    }
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: iecData } = await supabase
      .from("iec_profiles")
      .select("id, org_id, iec_code, legal_name")
      .eq("id", iecId)
      .maybeSingle();
    iec = (iecData as RawIecProfile) ?? null;

    if (iec) {
      const { data: memData } = await supabase
        .from("memberships")
        .select("user_id, role")
        .eq("org_id", iec.org_id);

      members = (memData ?? []).map((m) => ({
        userId: m.user_id,
        email: `member_${m.user_id.slice(0, 8)}@example.com`,
        role: m.role,
      }));

      const { data: sbData } = await supabase
        .from("shipping_bills")
        .select("id, sb_number, port_code, currency, fob_minor")
        .eq("iec_id", iecId);
      for (const sb of (sbData ?? []) as RawShippingBillForEmail[]) {
        shippingBills.set(sb.id, sb);
      }

      const { data: scData } = await supabase
        .from("scrips")
        .select("id, scrip_number, scheme, face_minor, expires_on")
        .eq("iec_id", iecId);
      for (const sc of (scData ?? []) as RawScripForEmail[]) {
        scrips.set(sc.id, sc);
      }

      const { data: tData } = await supabase
        .from("notification_templates")
        .select("key, body_template")
        .eq("channel", "whatsapp")
        .eq("active", true);
      for (const t of (tData ?? []) as RawTemplate[]) {
        whatsappTemplates.set(t.key, t.body_template);
      }
    }
  }

  if (!iec) {
    return { emailsSent: 0, inAppDispatched: 0, queuedDigests: 0, skippedCount: 0 };
  }

  // Check Plan Entitlements
  const entitlements = await getEntitlements(iec.org_id);
  const planAllowsEmail = entitlements.entitlements.alertsChannels.includes("email");

  let emailsSent = 0;
  const inAppDispatched = alerts.length;
  let queuedDigests = 0;
  let skippedCount = 0;

  for (const member of members) {
    const prefs = await getNotificationPreferences(iec.org_id, member.userId, iecId);
    const isUnsubscribed = Boolean(prefs.unsubscribedAt);
    const quiet =
      prefs.quietHours.enabled && isQuietHours(prefs.quietHours.start, prefs.quietHours.end, now);

    for (const alert of alerts) {
      const isEssentialBilling =
        alert.kind === "payment_problem" || alert.entityType === "organization";

      // Acceptance Criteria Rule: Unsubscribed users receive nothing except essential billing messages.
      if (isUnsubscribed && !isEssentialBilling) {
        skippedCount++;
        continue;
      }

      // If plan does not allow email and not essential billing, skip email
      if (!planAllowsEmail && !isEssentialBilling) {
        continue;
      }

      // Check category preferences
      let categoryAllowed = true;
      if (alert.kind.startsWith("realisation_")) {
        categoryAllowed = prefs.alertTypes.realisation_deadlines;
      } else if (alert.kind.startsWith("scrip_")) {
        categoryAllowed = prefs.alertTypes.scrip_expiry;
      } else if (alert.kind === "missing_payment") {
        categoryAllowed = prefs.alertTypes.missing_payments;
      } else if (alert.kind === "unclaimed_incentive") {
        categoryAllowed = prefs.alertTypes.unclaimed_incentives;
      }

      if (!categoryAllowed && !isEssentialBilling) {
        skippedCount++;
        continue;
      }

      // Check channel toggle
      if (!prefs.channels.email && !isEssentialBilling) {
        continue;
      }

      // Check frequency & quiet hours
      const isCritical = alert.severity === "critical";
      if ((prefs.digestFrequency === "weekly" || quiet) && !isCritical && !isEssentialBilling) {
        queuedDigests++;
        continue;
      }

      // Prepare email
      const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${prefs.unsubscribeToken}`;
      let emailPayload: { subject: string; text: string; html: string } | null = null;

      if (alert.kind.startsWith("realisation_")) {
        const sb = alert.shippingBillId ? shippingBills.get(alert.shippingBillId) : null;
        if (sb) {
          emailPayload = buildDeadlineEmail({
            name: member.email.split("@")[0] || "Exporter",
            sbNumber: sb.sb_number,
            portCode: sb.port_code,
            fobPaise: sb.fob_minor,
            fobCurrency: sb.currency,
            dueDate: alert.dueOn ?? "Immediate",
            daysRemaining: alert.threshold ?? 0,
            appUrl: `${baseUrl}/app/shipping-bills/${sb.id}`,
            unsubscribeUrl,
          });
        }
      } else if (alert.kind.startsWith("scrip_")) {
        const sc = alert.entityId ? scrips.get(alert.entityId) : null;
        if (sc) {
          emailPayload = buildScripEmail({
            name: member.email.split("@")[0] || "Exporter",
            scripNumber: sc.scrip_number,
            scheme: sc.scheme,
            faceValuePaise: sc.face_minor,
            expiresOn: sc.expires_on,
            daysRemaining: alert.threshold ?? 0,
            appUrl: `${baseUrl}/app/incentives`,
            unsubscribeUrl,
          });
        }
      } else if (alert.kind === "payment_problem") {
        emailPayload = buildPaymentProblemEmail({
          name: member.email.split("@")[0] || "Subscriber",
          planName: entitlements.planDisplayName,
          billingUrl: `${baseUrl}/app/billing`,
        });
      }

      if (emailPayload) {
        const sendRes = await sendEmail({
          to: member.email,
          subject: emailPayload.subject,
          text: emailPayload.text,
          html: emailPayload.html,
          unsubscribeUrl,
        });

        if (sendRes.success) {
          emailsSent++;
        }
      }
    }
  }

  // Format WhatsApp templates (ready in DB, mock integration)
  for (const alert of alerts) {
    if (alert.kind.startsWith("realisation_")) {
      const tpl = whatsappTemplates.get("whatsapp_deadline_alert");
      const sb = alert.shippingBillId ? shippingBills.get(alert.shippingBillId) : null;
      if (tpl && sb) {
        formatWhatsAppMessage(tpl, [
          sb.sb_number,
          `${sb.currency} ${(sb.fob_minor / 100).toFixed(2)}`,
          String(alert.threshold ?? 0),
          alert.dueOn ?? "Immediate",
        ]);
      }
    }
  }

  return { emailsSent, inAppDispatched, queuedDigests, skippedCount };
}
