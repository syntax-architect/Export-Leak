import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestSentEmails, getTestSentEmails } from "@/lib/email/resend";
import { generateAlertsForIec } from "@/lib/alerts/engine";
import { dispatchCandidateAlerts } from "@/lib/alerts/notifier";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  unsubscribeByToken,
  resubscribeByToken,
} from "@/lib/alerts/preferences";
import { formatWhatsAppMessage } from "@/lib/alerts/templates";
import { ensurePgliteUser, getPgliteDb } from "@/lib/auth/pglite-adapter";

describe("Prompt 16 - Alerts Engine & Notifications", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
  });

  beforeEach(async () => {
    clearTestSentEmails();
    const db = await getPgliteDb();
    await db.query(
      `insert into public.compliance_rules (key, value, effective_from)
       values ('realisation_months_inr', '{"months": 9, "confirmed": true}'::jsonb, '2020-01-01'),
              ('realisation_months', '{"months": 9, "confirmed": true}'::jsonb, '2020-01-01')
       on conflict do nothing`
    );
  });

  it("Fake-clock test: deadline thresholds produce exactly one alert each", async () => {
    const db = await getPgliteDb();
    const user = await ensurePgliteUser("owner-clk@acme.example");

    // 1. Setup organization, owner, and IEC profile
    const orgId = "00000000-0000-0000-0000-000000000016";
    const iecId = "11111111-1111-1111-1111-111111110016";
    const sbId = "22222222-2222-2222-2222-222222220016";

    await db.query(
      `insert into public.organizations (id, name, type, plan_key, plan_status)
       values ($1, 'Acme Exporters', 'exporter', 'exporter_monthly', 'active')
       on conflict (id) do nothing`,
      [orgId]
    );

    await db.query(
      `insert into public.memberships (user_id, org_id, role)
       values ($1, $2, 'owner')
       on conflict do nothing`,
      [user.id, orgId]
    );

    await db.query(
      `insert into public.iec_profiles (id, org_id, iec_code, legal_name, default_currency)
       values ($1, $2, '0300000016', 'Acme Textiles LLP', 'INR')
       on conflict (id) do nothing`,
      [iecId, orgId]
    );

    // Shipping bill with FEMA realisation due date set to 2026-10-01 (FOB: ₹5,00,000)
    await db.query(
      `insert into public.shipping_bills
         (id, iec_id, sb_number, sb_date, leo_date, port_code, currency, fob_minor, status, realisation_due_date)
       values ($1, $2, 'SB-CLK-101', '2026-01-01', '2026-01-01', 'INNSA1', 'INR', 50000000, 'pending', '2026-10-01')
       on conflict (id) do nothing`,
      [sbId, iecId]
    );

    // Day 100 before deadline: 2026-06-23 (100 days remaining -> threshold > 90 -> 0 deadline alerts)
    const resDay100 = await generateAlertsForIec(iecId, { clockIso: "2026-06-23" });
    const deadlineAlertsDay100 = resDay100.alerts.filter((a) => a.kind.startsWith("realisation_"));
    expect(deadlineAlertsDay100).toHaveLength(0);

    // Day 90 before deadline: 2026-07-03 (90 days remaining -> produces exactly one 90-day alert)
    const resDay90 = await generateAlertsForIec(iecId, { clockIso: "2026-07-03" });
    const deadlineAlertsDay90 = resDay90.alerts.filter((a) => a.kind.startsWith("realisation_"));
    expect(deadlineAlertsDay90).toHaveLength(1);
    const a90 = deadlineAlertsDay90[0];
    expect(a90).toBeDefined();
    expect(a90!.kind).toBe("realisation_deadline_90");
    expect(a90!.threshold).toBe(90);

    // Day 85 before deadline: 2026-07-08 (85 days remaining -> 90-day alert already generated -> 0 new alerts!)
    const resDay85 = await generateAlertsForIec(iecId, { clockIso: "2026-07-08" });
    const deadlineAlertsDay85 = resDay85.alerts.filter((a) => a.kind.startsWith("realisation_"));
    expect(deadlineAlertsDay85).toHaveLength(0); // Deduplicated!

    // Day 60 before deadline: 2026-08-02 (60 days remaining -> produces exactly one 60-day alert)
    const resDay60 = await generateAlertsForIec(iecId, { clockIso: "2026-08-02" });
    const deadlineAlertsDay60 = resDay60.alerts.filter((a) => a.kind.startsWith("realisation_"));
    expect(deadlineAlertsDay60).toHaveLength(1);
    const a60 = deadlineAlertsDay60[0];
    expect(a60).toBeDefined();
    expect(a60!.kind).toBe("realisation_deadline_60");
    expect(a60!.threshold).toBe(60);

    // Day 30 before deadline: 2026-09-01 (30 days remaining -> produces exactly one 30-day alert)
    const resDay30 = await generateAlertsForIec(iecId, { clockIso: "2026-09-01" });
    const deadlineAlertsDay30 = resDay30.alerts.filter((a) => a.kind.startsWith("realisation_"));
    expect(deadlineAlertsDay30).toHaveLength(1);
    const a30 = deadlineAlertsDay30[0];
    expect(a30).toBeDefined();
    expect(a30!.kind).toBe("realisation_deadline_30");
    expect(a30!.threshold).toBe(30);

    // Day 7 before deadline: 2026-09-24 (7 days remaining -> produces exactly one 7-day alert)
    const resDay7 = await generateAlertsForIec(iecId, { clockIso: "2026-09-24" });
    const deadlineAlertsDay7 = resDay7.alerts.filter((a) => a.kind.startsWith("realisation_"));
    expect(deadlineAlertsDay7).toHaveLength(1);
    const a7 = deadlineAlertsDay7[0];
    expect(a7).toBeDefined();
    expect(a7!.kind).toBe("realisation_deadline_7");
    expect(a7!.threshold).toBe(7);

    // Day -1 (overdue): 2026-10-02 (past due date -> produces exactly one overdue alert)
    const resOverdue = await generateAlertsForIec(iecId, { clockIso: "2026-10-02" });
    const deadlineAlertsOverdue = resOverdue.alerts.filter((a) =>
      a.kind.startsWith("realisation_")
    );
    expect(deadlineAlertsOverdue).toHaveLength(1);
    const aOverdue = deadlineAlertsOverdue[0];
    expect(aOverdue).toBeDefined();
    expect(aOverdue!.kind).toBe("realisation_overdue");
    expect(aOverdue!.threshold).toBe(0);

    // Verify stored alerts in database: exactly 5 distinct deadline alerts created
    const stored = await db.query<{ kind: string; threshold: number; dedup_key: string }>(
      `select kind, threshold, dedup_key from public.alerts
       where shipping_bill_id = $1 and kind like 'realisation_%'
       order by threshold desc`,
      [sbId]
    );
    expect(stored.rows).toHaveLength(5);
    expect(stored.rows.map((r: { threshold: number }) => r.threshold)).toEqual([90, 60, 30, 7, 0]);

    // 2. Auto-resolution: Now match the shipping bill payment in full
    await db.query(
      `update public.shipping_bills
       set status = 'matched'
       where id = $1`,
      [sbId]
    );

    // Run generator again: should detect that SB is closed and auto-resolve all 5 deadline alerts!
    const resResolved = await generateAlertsForIec(iecId, { clockIso: "2026-10-03" });
    expect(resResolved.autoResolvedCount).toBeGreaterThanOrEqual(5);

    const checkResolved = await db.query<{ count: string }>(
      `select count(*) as count from public.alerts
       where shipping_bill_id = $1 and kind like 'realisation_%' and resolved_at is not null`,
      [sbId]
    );
    const checkRow = checkResolved.rows[0];
    expect(checkRow).toBeDefined();
    expect(Number(checkRow!.count)).toBe(5);
  });

  it("Unsubscribed users receive nothing except essential billing messages", async () => {
    const db = await getPgliteDb();
    const subUser = await ensurePgliteUser("user-sub@example.com");
    const unsubUser = await ensurePgliteUser("user-unsub@example.com");

    const orgId = "00000000-0000-0000-0000-000000000017";
    const iecId = "11111111-1111-1111-1111-111111110017";
    const sbId = "22222222-2222-2222-2222-222222220017";

    await db.query(
      `insert into public.organizations (id, name, type, plan_key, plan_status)
       values ($1, 'Global Exports Ltd', 'exporter', 'exporter_monthly', 'active')
       on conflict (id) do nothing`,
      [orgId]
    );

    await db.query(
      `insert into public.subscriptions
         (org_id, razorpay_subscription_id, plan_key, status, current_start, current_end)
       values ($1, 'sub_unsub_test_001', 'exporter_monthly', 'active', now(), now() + interval '30 days')
       on conflict do nothing`,
      [orgId]
    );

    await db.query(
      `insert into public.memberships (user_id, org_id, role)
       values ($1, $2, 'owner'), ($3, $2, 'member')
       on conflict do nothing`,
      [subUser.id, orgId, unsubUser.id]
    );

    await db.query(
      `insert into public.iec_profiles (id, org_id, iec_code, legal_name, default_currency)
       values ($1, $2, '0300000017', 'Global Exports Ltd', 'INR')
       on conflict (id) do nothing`,
      [iecId, orgId]
    );

    await db.query(
      `insert into public.shipping_bills
         (id, iec_id, sb_number, sb_date, port_code, currency, fob_minor, status, realisation_due_date)
       values ($1, $2, 'SB-UNSUB-1', '2026-01-01', 'INNSA1', 'INR', 10000000, 'pending', '2026-05-01')
       on conflict (id) do nothing`,
      [sbId, iecId]
    );

    // User A is subscribed. User B is unsubscribed.
    await getNotificationPreferences(orgId, subUser.id, iecId);
    const prefB = await getNotificationPreferences(orgId, unsubUser.id, iecId);

    // Unsubscribe User B
    await unsubscribeByToken(prefB.unsubscribeToken);

    const updatedPrefB = await getNotificationPreferences(orgId, unsubUser.id, iecId);
    expect(updatedPrefB.unsubscribedAt).not.toBeNull();

    // Generate candidate alert for realisation deadline (30 days left)
    const alertResult = await generateAlertsForIec(iecId, { clockIso: "2026-09-01" });
    expect(alertResult.alerts.length).toBeGreaterThan(0);

    // Dispatch notifications
    const dispatchResult = await dispatchCandidateAlerts(iecId, alertResult.alerts);
    expect(dispatchResult.skippedCount).toBeGreaterThanOrEqual(1);

    const sentEmails = getTestSentEmails();
    // User A should receive the email
    const emailsToUserA = sentEmails.filter((e) => e.to.includes(subUser.email));
    // User B should NOT receive any compliance/deadline email
    const emailsToUserB = sentEmails.filter((e) => e.to.includes(unsubUser.email));

    expect(emailsToUserA.length).toBeGreaterThanOrEqual(1);
    expect(emailsToUserB).toHaveLength(0); // Zero emails for unsubscribed user on non-essential alerts!

    // Verify each email contains clear sender name and List-Unsubscribe header
    for (const email of sentEmails) {
      expect(email.from).toContain("ExportLeak Alerts");
      expect(email.headers?.["List-Unsubscribe"]).toBeDefined();
      expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }

    // Now test ESSENTIAL billing message: Payment problem (past_due subscription)
    clearTestSentEmails();
    const billingAlert = [
      {
        iecId,
        kind: "payment_problem" as const,
        severity: "critical" as const,
        title: "Subscription Renewal Action Required",
        message: "Payment retry failed; grace period active.",
        shippingBillId: null,
        dueOn: null,
        entityType: "organization" as const,
        entityId: orgId,
        threshold: 3,
        dedupKey: `payment_problem:${orgId}`,
      },
    ];

    await dispatchCandidateAlerts(iecId, billingAlert);
    const billingEmails = getTestSentEmails();
    // Essential billing message is sent to BOTH User A and unsubscribed User B!
    const billingToUserB = billingEmails.filter((e) => e.to.includes(unsubUser.email));
    expect(billingToUserB).toHaveLength(1);
    const b0 = billingToUserB[0];
    expect(b0).toBeDefined();
    expect(b0!.subject).toContain("Subscription Renewal");
  });

  it("Consultants can configure notification preferences per client IEC", async () => {
    const db = await getPgliteDb();
    const consultantUser = await ensurePgliteUser("consultant@apex.example");

    const consultantOrgId = "00000000-0000-0000-0000-000000000018";
    const client1IecId = "11111111-1111-1111-1111-111111110018";
    const client2IecId = "22222222-2222-2222-2222-222222220018";

    await db.query(
      `insert into public.organizations (id, name, type, plan_key, plan_status)
       values ($1, 'Apex EXIM Consultants', 'consultant', 'consultant_monthly', 'active')
       on conflict (id) do nothing`,
      [consultantOrgId]
    );

    await db.query(
      `insert into public.memberships (user_id, org_id, role)
       values ($1, $2, 'owner')
       on conflict do nothing`,
      [consultantUser.id, consultantOrgId]
    );

    await db.query(
      `insert into public.iec_profiles (id, org_id, iec_code, legal_name, default_currency)
       values ($1, $2, '0300000081', 'Client Alpha Pvt Ltd', 'INR'),
              ($3, $2, '0300000082', 'Client Beta Exports', 'USD')
       on conflict (id) do nothing`,
      [client1IecId, consultantOrgId, client2IecId]
    );

    // Set Client 1 preferences to Weekly Digest, Realisation Deadlines ON, Scrips OFF
    await updateNotificationPreferences(
      consultantOrgId,
      consultantUser.id,
      {
        digestFrequency: "weekly",
        alertTypes: { realisation_deadlines: true, scrip_expiry: false },
      },
      client1IecId
    );

    // Set Client 2 preferences to Realtime, Scrips ON
    await updateNotificationPreferences(
      consultantOrgId,
      consultantUser.id,
      {
        digestFrequency: "realtime",
        alertTypes: { realisation_deadlines: false, scrip_expiry: true },
      },
      client2IecId
    );

    const pref1 = await getNotificationPreferences(
      consultantOrgId,
      consultantUser.id,
      client1IecId
    );
    const pref2 = await getNotificationPreferences(
      consultantOrgId,
      consultantUser.id,
      client2IecId
    );

    expect(pref1.iecId).toBe(client1IecId);
    expect(pref1.digestFrequency).toBe("weekly");
    expect(pref1.alertTypes.realisation_deadlines).toBe(true);
    expect(pref1.alertTypes.scrip_expiry).toBe(false);

    expect(pref2.iecId).toBe(client2IecId);
    expect(pref2.digestFrequency).toBe("realtime");
    expect(pref2.alertTypes.realisation_deadlines).toBe(false);
    expect(pref2.alertTypes.scrip_expiry).toBe(true);
  });

  it("Formats WhatsApp-ready templates without sending network requests", async () => {
    const rawTemplate =
      "ExportLeak Alert: Shipment {{1}} (FOB {{2}}) has FEMA realisation deadline approaching in {{3}} days on {{4}}.";
    const formatted = formatWhatsAppMessage(rawTemplate, [
      "SB-9988",
      "₹12,50,000",
      "7",
      "2026-11-20",
    ]);

    expect(formatted).toBe(
      "ExportLeak Alert: Shipment SB-9988 (FOB ₹12,50,000) has FEMA realisation deadline approaching in 7 days on 2026-11-20."
    );
  });

  it("Handles 1-click unsubscribe and resubscribe idempotently", async () => {
    const db = await getPgliteDb();
    const user = await ensurePgliteUser("unsub-test-user@example.com");
    const orgId = "00000000-0000-0000-0000-000000000019";

    await db.query(
      `insert into public.organizations (id, name, type, plan_key, plan_status)
       values ($1, 'Unsub Test Org', 'exporter', 'free', 'active')
       on conflict (id) do nothing`,
      [orgId]
    );

    await db.query(
      `insert into public.memberships (user_id, org_id, role)
       values ($1, $2, 'owner')
       on conflict do nothing`,
      [user.id, orgId]
    );

    const pref = await getNotificationPreferences(orgId, user.id);
    expect(pref.unsubscribedAt).toBeNull();

    // 1-click unsubscribe
    const unsubRes = await unsubscribeByToken(pref.unsubscribeToken);
    expect(unsubRes.success).toBe(true);

    const check1 = await getNotificationPreferences(orgId, user.id);
    expect(check1.unsubscribedAt).not.toBeNull();

    // 1-click resubscribe
    const resubRes = await resubscribeByToken(pref.unsubscribeToken);
    expect(resubRes.success).toBe(true);

    const check2 = await getNotificationPreferences(orgId, user.id);
    expect(check2.unsubscribedAt).toBeNull();
  });
});
