import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthState = {
  user: null as { id: string; email: string; isPlatformAdmin?: boolean } | null,
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock("@/lib/auth/org-access", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/org-access")>("@/lib/auth/org-access");
  return {
    ...actual,
    getAuthenticatedUser: async () => mockAuthState.user,
    requirePlatformAdmin: async () => actual.assertPlatformAdminAccess(mockAuthState.user),
    requireOrgAccess: async (
      orgId: string,
      minRole: "viewer" | "member" | "admin" | "owner" = "viewer"
    ) =>
      actual.assertOrgMembershipAccess({
        user: mockAuthState.user,
        orgId,
        minRole,
        findMembership: async (userId, validOrgId) => {
          const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
          return asPgliteUser(userId, async (tx) => {
            const res = await tx.query<{ role: "viewer" | "member" | "admin" | "owner" }>(
              `select role from public.memberships where user_id = $1 and org_id = $2`,
              [userId, validOrgId]
            );
            return res.rows[0]?.role ?? null;
          });
        },
      }),
  };
});

import { POST as adminExtendTrialRoute } from "@/app/api/admin/trials/extend/route";
import { POST as cronProcessTrialsRoute } from "@/app/api/internal/process-trials/route";
import { GET as listDocumentsRoute } from "@/app/api/orgs/[orgId]/documents/route";
import { POST as ebrcRoute } from "@/app/api/orgs/[orgId]/ebrc/route";
import { POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { GET as listShippingBillsRoute } from "@/app/api/orgs/[orgId]/shipping-bills/route";
import { POST as startTrialRoute } from "@/app/api/orgs/[orgId]/trial/start/route";
import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { createOrganization } from "@/lib/auth/repository";
import { getEntitlements } from "@/lib/billing/entitlements";
import { convertTrialToPaidPlan, getTrialCountdown, startTrial } from "@/lib/billing/trial";
import { commitUploadedDocument } from "@/lib/documents/repository";
import { writeLocalStorageObject } from "@/lib/documents/storage";
import {
  setEmailTransportForTests,
  type SendTransactionalEmailInput,
} from "@/lib/notifications/email";

const TEST_CRON_SECRET = "test-cron-secret-prompt12";

describe("Prompt 12: 7-day no-card trial engine, time-travel lifecycle, admin extend & analytics", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
    process.env.CRON_SECRET = TEST_CRON_SECRET;
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T09:00:00.000Z"));
    setEmailTransportForTests(null);
    await resetPgliteDb();
  });

  afterEach(() => {
    setEmailTransportForTests(null);
    vi.useRealTimers();
  });

  it("runs full fake-clock lifecycle: day 0 start, day 5 reminder queued with ₹X unclaimed + upgrade link, day 7 downgrade with data still readable", async () => {
    const owner = await ensurePgliteUser("trial-lifecycle-owner@example.invalid");
    mockAuthState.user = { ...owner, isPlatformAdmin: false };

    const org = await createOrganization({
      user: mockAuthState.user,
      name: "Tiruppur Knitwear Exports",
      type: "exporter",
    });

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({
          iecCode: "AAACT9001A",
          legalName: "Tiruppur Knitwear Exports Pvt Ltd",
        }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    const { iec } = (await iecRes.json()) as { iec: { id: string } };

    // Day 0: Uploading first real Shipping Bill PDF automatically starts 7-day Pro Trial
    const docId = crypto.randomUUID();
    const storagePath = `${org.orgId}/${iec.id}/${docId}.pdf`;
    const samplePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    const sha256 = crypto.createHash("sha256").update(samplePdf).digest("hex");
    await writeLocalStorageObject(storagePath, samplePdf);

    const committed = await commitUploadedDocument({
      orgId: org.orgId,
      iecId: iec.id,
      docId,
      kind: "shipping_bill",
      storagePath,
      sha256,
      originalName: "sb-day0.pdf",
      fileSizeBytes: samplePdf.length,
      mimeType: "application/pdf",
    });
    expect(committed.trialStarted).toBe(true);

    // Repeating startTrial on the same org is idempotent (does not extend or duplicate)
    const idempotentRepeat = await startTrial(org.orgId, owner.id);
    expect(idempotentRepeat.started).toBe(false);
    expect(idempotentRepeat.alreadyTrialingOrPaid).toBe(true);

    // Seed a Shipping Bill + unclaimed incentive expectation (₹1,50,000 = 1,50,00,000 paise)
    const db = await getPgliteDb();
    const sbId = crypto.randomUUID();
    await db.query(
      `insert into public.shipping_bills (
         id, iec_id, document_id, sb_number, sb_date, port_code, currency, fob_minor, status
       ) values ($1, $2, $3, 'SB-7001', '2026-11-01', 'INMAA1', 'USD', 2500000, 'matched')`,
      [sbId, iec.id, docId]
    );
    await db.query(
      `insert into public.incentive_expectations (shipping_bill_id, scheme, expected_minor, calc_detail)
       values ($1, 'rodtep', 15000000, '{}'::jsonb)`,
      [sbId]
    );

    const day0Ent = await getEntitlements(org.orgId, owner.id);
    expect(day0Ent.planKey).toBe("trial_pro");
    expect(getTrialCountdown(day0Ent.trialEndsAt).label).toBe("Pro trial: 7 days left");

    // Capture sent email payloads cleanly
    const sentEmails: SendTransactionalEmailInput[] = [];
    setEmailTransportForTests(async (msg) => {
      sentEmails.push(msg);
      return { status: "queued", providerMessageId: "mock-day5-msg", error: null };
    });

    // Day 2: Countdown shows 5 days left
    vi.setSystemTime(new Date("2026-11-03T09:00:00.000Z"));
    expect(getTrialCountdown(day0Ent.trialEndsAt).label).toBe("Pro trial: 5 days left");

    // Day 3: Daily cron does not trigger Day 5 reminder yet
    vi.setSystemTime(new Date("2026-11-04T09:00:00.000Z"));
    const day3Cron = await cronProcessTrialsRoute(
      new NextRequest("http://localhost/api/internal/process-trials", {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      })
    );
    expect(day3Cron.status).toBe(200);
    const day3Json = (await day3Cron.json()) as {
      day5RemindersProcessed: number;
      expiredCount: number;
    };
    expect(day3Json.day5RemindersProcessed).toBe(0);
    expect(day3Json.expiredCount).toBe(0);

    // Day 5: Daily cron queues Day 5 email & WhatsApp template showing ₹1,50,000 unclaimed + upgrade link
    vi.setSystemTime(new Date("2026-11-06T09:00:00.000Z"));
    const day5Cron = await cronProcessTrialsRoute(
      new NextRequest("http://localhost/api/internal/process-trials", {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      })
    );
    expect(day5Cron.status).toBe(200);
    const day5Json = (await day5Cron.json()) as {
      day5RemindersProcessed: number;
      expiredCount: number;
    };
    expect(day5Json.day5RemindersProcessed).toBe(1);
    expect(day5Json.expiredCount).toBe(0);

    // Running cron again on Day 5 is strictly idempotent (no duplicate Day 5 email)
    const day5RepeatCron = await cronProcessTrialsRoute(
      new NextRequest("http://localhost/api/internal/process-trials", {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      })
    );
    const day5RepeatJson = (await day5RepeatCron.json()) as { day5RemindersProcessed: number };
    expect(day5RepeatJson.day5RemindersProcessed).toBe(0);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(owner.email);
    expect(sentEmails[0]!.text).toContain("₹1,50,000 in unclaimed incentives flagged");
    expect(sentEmails[0]!.text).toContain("/app/billing?highlight=exporter_monthly");

    const notifsDay5 = await db.query<{
      kind: string;
      channel: string;
      status: string;
      body_text: string;
      unclaimed_incentive_paise: string | number;
    }>(
      `select kind, channel, status, body_text, unclaimed_incentive_paise
       from public.trial_notifications
       where org_id = $1
       order by channel asc`,
      [org.orgId]
    );
    expect(notifsDay5.rows).toHaveLength(2);
    expect(notifsDay5.rows[0]?.channel).toBe("email");
    expect(notifsDay5.rows[1]?.channel).toBe("whatsapp_template");
    expect(notifsDay5.rows[1]?.status).toBe("stored_template");
    expect(notifsDay5.rows[1]?.body_text).toContain("₹1,50,000 in unclaimed incentives flagged");

    // Day 7: Daily cron downgrades org gently to Free and sends Day 7 notice; all data stays readable
    vi.setSystemTime(new Date("2026-11-08T09:00:01.000Z"));
    const day7Cron = await cronProcessTrialsRoute(
      new NextRequest("http://localhost/api/internal/process-trials", {
        method: "POST",
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      })
    );
    expect(day7Cron.status).toBe(200);
    const day7Json = (await day7Cron.json()) as {
      expiredCount: number;
      downgradedOrgIds: string[];
    };
    expect(day7Json.expiredCount).toBe(1);
    expect(day7Json.downgradedOrgIds).toContain(org.orgId);

    const postExpiryEnt = await getEntitlements(org.orgId, owner.id);
    expect(postExpiryEnt.planKey).toBe("free");
    expect(postExpiryEnt.entitlements.canGenerateEbrc).toBe(false);

    // Premium actions lock on Free (402)
    const ebrcBlocked = await ebrcRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/ebrc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", rows: [] }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(ebrcBlocked.status).toBe(402);

    // Existing uploaded documents and Shipping Bills remain 100% readable after trial expiry
    const readDocsRes = await listDocumentsRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/documents`),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(readDocsRes.status).toBe(200);
    const readDocsBody = (await readDocsRes.json()) as { documents: Array<{ id: string }> };
    expect(readDocsBody.documents.some((d) => d.id === docId)).toBe(true);

    const readSbRes = await listShippingBillsRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/shipping-bills`),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(readSbRes.status).toBe(200);
    const readSbBody = (await readSbRes.json()) as {
      shippingBills: Array<{ id: string }>;
    };
    expect(readSbBody.shippingBills.some((sb) => sb.id === sbId)).toBe(true);

    // Analytics events recorded in sequence
    const eventsRes = await db.query<{ event_type: string }>(
      `select event_type from public.billing_events where org_id = $1 order by created_at asc`,
      [org.orgId]
    );
    expect(eventsRes.rows.map((r) => r.event_type)).toEqual([
      "trial_started",
      "trial_day_5_email",
      "trial_expired",
    ]);
  });

  it("refuses a second trial for the same IEC code across accounts with a friendly 409 message", async () => {
    const owner1 = await ensurePgliteUser("iec-first@example.invalid");
    const owner2 = await ensurePgliteUser("iec-second@example.invalid");

    mockAuthState.user = owner1;
    const org1 = await createOrganization({
      user: owner1,
      name: "Original Exporters",
      type: "exporter",
    });
    await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${org1.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAABM4455K", legalName: "Original Exporters" }),
      }),
      { params: Promise.resolve({ orgId: org1.orgId }) }
    );
    const t1 = await startTrial(org1.orgId, owner1.id);
    expect(t1.started).toBe(true);

    // Second user creates a new account & organization using the same IEC (lowercase input normalized)
    mockAuthState.user = owner2;
    const org2 = await createOrganization({
      user: owner2,
      name: "Duplicate Account Co",
      type: "exporter",
    });
    await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${org2.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "aaabm4455k", legalName: "Duplicate Account Co" }),
      }),
      { params: Promise.resolve({ orgId: org2.orgId }) }
    );

    const repeatRes = await startTrialRoute(
      new NextRequest(`http://localhost/api/orgs/${org2.orgId}/trial/start`, { method: "POST" }),
      { params: Promise.resolve({ orgId: org2.orgId }) }
    );
    expect(repeatRes.status).toBe(409);
    const repeatBody = (await repeatRes.json()) as { error?: { message?: string } };
    expect(repeatBody.error?.message).toBe("A 7-day trial was already used for this IEC code.");
  });

  it("enforces platform-admin-only trial extension override (audit-logged) and immediate paid conversion", async () => {
    const owner = await ensurePgliteUser("pilot-consultant@example.invalid");
    const platformAdminUser = await ensurePgliteUser("founder@exportleak.example");
    const platformAdmin = { ...platformAdminUser, isPlatformAdmin: true };

    mockAuthState.user = owner;
    const org = await createOrganization({
      user: owner,
      name: "Chennai EXIM Associates",
      type: "consultant",
    });

    // Non-admin cannot invoke admin trial override
    const forbiddenExtend = await adminExtendTrialRoute(
      new NextRequest("http://localhost/api/admin/trials/extend", {
        method: "POST",
        body: JSON.stringify({ orgId: org.orgId, days: 14, reason: "Consultant pilot" }),
      })
    );
    expect(forbiddenExtend.status).toBe(403);

    // Platform admin extends trial by 14 days
    mockAuthState.user = platformAdmin;
    const adminExtend = await adminExtendTrialRoute(
      new NextRequest("http://localhost/api/admin/trials/extend", {
        method: "POST",
        body: JSON.stringify({
          orgId: org.orgId,
          days: 14,
          reason: "Consultant multi-IEC pilot",
        }),
      })
    );
    expect(adminExtend.status).toBe(200);
    const extendedJson = (await adminExtend.json()) as {
      planKey: string;
      daysAdded: number;
      trialEndsAt: string;
    };
    expect(extendedJson.planKey).toBe("trial_pro");
    expect(extendedJson.daysAdded).toBe(14);

    const db = await getPgliteDb();
    const auditRes = await db.query<{ action: string }>(
      `select action from public.audit_log where org_id = $1 and action = 'trial_extended'`,
      [org.orgId]
    );
    expect(auditRes.rows).toHaveLength(1);

    // Subscribing during the trial immediately ends the trial and records trial_converted
    vi.setSystemTime(new Date("2026-11-05T12:00:00.000Z"));
    const converted = await convertTrialToPaidPlan({
      orgId: org.orgId,
      paidPlanKey: "consultant_monthly",
      actorId: owner.id,
    });
    expect(converted.wasTrial).toBe(true);
    expect(converted.planKey).toBe("consultant_monthly");

    const postConvertEnt = await getEntitlements(org.orgId, owner.id);
    expect(postConvertEnt.planKey).toBe("consultant_monthly");
    expect(postConvertEnt.billingState).toBe("active_subscription");

    const eventTypes = await db.query<{ event_type: string }>(
      `select event_type from public.billing_events where org_id = $1 order by created_at asc`,
      [org.orgId]
    );
    expect(eventTypes.rows.map((r) => r.event_type)).toEqual(["trial_extended", "trial_converted"]);
  });
});
