import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { createOrganization } from "@/lib/auth/repository";
import { getEntitlements } from "@/lib/billing/entitlements";
import { runDailySubscriptionReconciliationJob } from "@/lib/billing/reconciliation";
import {
  maskPayloadSecrets,
  processRazorpayWebhook,
  verifyWebhookSignature,
} from "@/lib/billing/webhook-processor";
import { POST as webhookRoute } from "@/app/api/webhooks/razorpay/route";
import { POST as reprocessRoute } from "@/app/api/admin/billing/reprocess/route";

describe("Prompt 14 - Razorpay Webhooks (The Activation Engine)", () => {
  const webhookSecret = "test_webhook_secret_67890";

  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.RAZORPAY_KEY_ID = "rzp_test_fixture_key";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret_12345";
  });

  beforeEach(async () => {
    await resetPgliteDb();
    mockAuthState.user = null;
  });

  function signPayload(body: string, secret = webhookSecret): string {
    return crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  describe("HMAC-SHA256 Signature Verification", () => {
    it("accepts valid signatures matching raw request body", () => {
      const raw = JSON.stringify({ entity: "event", event: "subscription.activated" });
      const signature = signPayload(raw);

      expect(verifyWebhookSignature(raw, signature)).toBe(true);
    });

    it("rejects when signature has one flipped byte (fail closed 400)", async () => {
      const raw = JSON.stringify({ entity: "event", event: "subscription.activated" });
      const validSig = signPayload(raw);
      const flippedSig = validSig.slice(0, -1) + (validSig.slice(-1) === "a" ? "b" : "a");

      const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": flippedSig,
        },
        body: raw,
      });

      const res = await webhookRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/signature/i);
    });

    it("rejects when secret is wrong or missing", () => {
      const raw = JSON.stringify({ entity: "event", event: "test" });
      const wrongSig = signPayload(raw, "wrong_secret");
      expect(verifyWebhookSignature(raw, wrongSig)).toBe(false);
      expect(verifyWebhookSignature(raw, null)).toBe(false);
    });
  });

  describe("Idempotency & Duplicate Safety", () => {
    it("processes an event once and returns 200 without side effects on resend of the same event ID", async () => {
      const user = await ensurePgliteUser("idempotent@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Idempotent Exporter",
        type: "exporter",
      });

      const subId = "sub_idem_001";
      const eventId = "evt_idem_001";

      const db = await getPgliteDb();
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, $2, 'exporter_monthly', 'created')`,
        [org.orgId, subId]
      );

      const raw = JSON.stringify({
        id: eventId,
        entity: "event",
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "active",
              paid_count: 1,
              notes: {
                org_id: org.orgId,
                plan_key: "exporter_monthly",
              },
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      const signature = signPayload(raw);

      // First delivery: processes event
      const req1 = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
          "x-razorpay-event-id": eventId,
        },
        body: raw,
      });
      const res1 = await webhookRoute(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.status).toBe("processed");

      // Verify org is activated
      const orgCheck1 = await db.query<{ plan_key: string; plan_status: string }>(
        `select plan_key, plan_status from public.organizations where id = $1`,
        [org.orgId]
      );
      expect(orgCheck1.rows[0]?.plan_key).toBe("exporter_monthly");
      expect(orgCheck1.rows[0]?.plan_status).toBe("active");

      // Second delivery (duplicate): returns 200 immediately
      const req2 = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
          "x-razorpay-event-id": eventId,
        },
        body: raw,
      });
      const res2 = await webhookRoute(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.status).toBe("duplicate");
    });
  });

  describe("Out-of-Order Safety", () => {
    it("activated subscription is NOT downgraded by an older delayed subscription.authenticated event", async () => {
      const user = await ensurePgliteUser("ooo@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "OOO Exporter",
        type: "exporter",
      });

      const subId = "sub_ooo_001";
      const db = await getPgliteDb();
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, $2, 'exporter_monthly', 'created')`,
        [org.orgId, subId]
      );

      // 1. Process subscription.activated first
      const activatedRaw = JSON.stringify({
        id: "evt_ooo_act",
        entity: "event",
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "active",
              paid_count: 1,
              notes: {
                org_id: org.orgId,
                plan_key: "exporter_monthly",
              },
            },
          },
        },
        created_at: 1731500000,
      });

      await processRazorpayWebhook({
        rawBody: activatedRaw,
        signature: signPayload(activatedRaw),
      });

      // Confirm status is active
      const subCheck1 = await db.query<{ status: string }>(
        `select status from public.subscriptions where razorpay_subscription_id = $1`,
        [subId]
      );
      expect(subCheck1.rows[0]?.status).toBe("active");

      // 2. An older subscription.authenticated arrives delayed
      const olderAuthRaw = JSON.stringify({
        id: "evt_ooo_old_auth",
        entity: "event",
        event: "subscription.authenticated",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "authenticated",
              notes: {
                org_id: org.orgId,
                plan_key: "exporter_monthly",
              },
            },
          },
        },
        created_at: 1731400000, // Older timestamp
      });

      await processRazorpayWebhook({
        rawBody: olderAuthRaw,
        signature: signPayload(olderAuthRaw),
      });

      // Subscription MUST STILL be active!
      const subCheck2 = await db.query<{ status: string }>(
        `select status from public.subscriptions where razorpay_subscription_id = $1`,
        [subId]
      );
      expect(subCheck2.rows[0]?.status).toBe("active");
    });
  });

  describe("Lifecycle Transitions: Pending (Grace), Halted, and Cancelled", () => {
    it("subscription.pending initiates past_due state with 3-day grace period", async () => {
      const user = await ensurePgliteUser("grace@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Grace Exporter",
        type: "exporter",
      });

      const subId = "sub_grace_001";
      const db = await getPgliteDb();
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, $2, 'exporter_monthly', 'active')`,
        [org.orgId, subId]
      );
      await db.query(
        `update public.organizations set plan_key = 'exporter_monthly', plan_status = 'active' where id = $1`,
        [org.orgId]
      );

      const pendingRaw = JSON.stringify({
        id: "evt_grace_pending",
        entity: "event",
        event: "subscription.pending",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "pending",
              notes: { org_id: org.orgId },
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      });

      await processRazorpayWebhook({
        rawBody: pendingRaw,
        signature: signPayload(pendingRaw),
      });

      const orgCheck = await db.query<{ plan_status: string }>(
        `select plan_status from public.organizations where id = $1`,
        [org.orgId]
      );
      expect(orgCheck.rows[0]?.plan_status).toBe("past_due");

      // Verify entitlements are still active under 3-day grace period
      const entitlements = await getEntitlements(org.orgId);
      expect(entitlements.billingState).toBe("grace_period");
      expect(entitlements.planKey).toBe("exporter_monthly");
      expect(entitlements.entitlements.canGenerateEbrc).toBe(true);
    });

    it("subscription.halted triggers downgrade to free tier", async () => {
      const user = await ensurePgliteUser("halted@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Halted Exporter",
        type: "exporter",
      });

      const subId = "sub_halted_001";
      const db = await getPgliteDb();
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, $2, 'exporter_monthly', 'active')`,
        [org.orgId, subId]
      );

      const haltedRaw = JSON.stringify({
        id: "evt_halted_001",
        entity: "event",
        event: "subscription.halted",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "halted",
              notes: { org_id: org.orgId },
            },
          },
        },
      });

      await processRazorpayWebhook({
        rawBody: haltedRaw,
        signature: signPayload(haltedRaw),
      });

      const orgCheck = await db.query<{ plan_key: string; plan_status: string }>(
        `select plan_key, plan_status from public.organizations where id = $1`,
        [org.orgId]
      );
      expect(orgCheck.rows[0]?.plan_key).toBe("free");
      expect(orgCheck.rows[0]?.plan_status).toBe("halted");

      const entitlements = await getEntitlements(org.orgId);
      expect(entitlements.planKey).toBe("free");
      expect(entitlements.entitlements.canGenerateEbrc).toBe(false);
    });

    it("subscription.cancelled with cancel_at_cycle_end preserves access until current_end", async () => {
      const user = await ensurePgliteUser("cancel_cycle@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Cancel Cycle Exporter",
        type: "exporter",
      });

      const subId = "sub_cancel_cycle_001";
      const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

      const db = await getPgliteDb();
      await db.query(
        `insert into public.subscriptions (
           org_id, razorpay_subscription_id, plan_key, status, current_end, cancel_at_cycle_end
         )
         values ($1, $2, 'exporter_monthly', 'active', $3, true)`,
        [org.orgId, subId, futureEnd]
      );
      await db.query(
        `update public.organizations set plan_key = 'exporter_monthly', plan_status = 'active' where id = $1`,
        [org.orgId]
      );

      const cancelRaw = JSON.stringify({
        id: "evt_cancel_cycle",
        entity: "event",
        event: "subscription.cancelled",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "cancelled",
              cancel_at_cycle_end: 1,
              current_end: Math.floor(new Date(futureEnd).getTime() / 1000),
              notes: { org_id: org.orgId },
            },
          },
        },
      });

      await processRazorpayWebhook({
        rawBody: cancelRaw,
        signature: signPayload(cancelRaw),
      });

      // User STILL keeps access because current_end is in the future
      const entitlements = await getEntitlements(org.orgId);
      expect(entitlements.billingState).toBe("active_subscription");
      expect(entitlements.planKey).toBe("exporter_monthly");
      expect(entitlements.entitlements.canGenerateEbrc).toBe(true);
    });
  });

  describe("Reconciliation & Admin Reprocessing", () => {
    it("reconciliation job fixes drift between Razorpay and local database", async () => {
      const user = await ensurePgliteUser("reconcile@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Reconcile Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      // Drift: DB has status 'created' with 0 paid count, while live Razorpay has 'active' with 1 paid count
      await db.query(
        `insert into public.subscriptions (
           org_id, razorpay_subscription_id, plan_key, status, paid_count
         )
         values ($1, 'sub_sim_drift_001', 'exporter_monthly', 'created', 0)`,
        [org.orgId]
      );

      const report = await runDailySubscriptionReconciliationJob();
      expect(report.checkedCount).toBeGreaterThan(0);
      expect(report.driftCount).toBeGreaterThan(0);

      // Verify DB was reconciled to 'active'
      const check = await db.query<{ status: string; paid_count: number }>(
        `select status, paid_count from public.subscriptions where razorpay_subscription_id = 'sub_sim_drift_001'`,
        []
      );
      expect(check.rows[0]?.status).toBe("active");
      expect(check.rows[0]?.paid_count).toBe(1);
    });

    it("admin reprocess endpoint re-triggers event processing", async () => {
      const admin = await ensurePgliteUser("admin@platform.test");
      mockAuthState.user = { ...admin, isPlatformAdmin: true };

      const user = await ensurePgliteUser("reprocess@exporter.test");
      const org = await createOrganization({
        user,
        name: "Reprocess Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      const subId = "sub_reprocess_001";
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, $2, 'consultant_monthly', 'created')`,
        [org.orgId, subId]
      );

      const payload = {
        id: "evt_reprocess_123",
        entity: "event",
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: subId,
              status: "active",
              notes: { org_id: org.orgId, plan_key: "consultant_monthly" },
            },
          },
        },
      };

      // Store event with error / unprocessed
      await db.query(
        `insert into public.payment_events (
           provider, provider_event_id, event_type, payload, org_id, error
         )
         values ('razorpay', 'evt_reprocess_123', 'subscription.activated', $1::jsonb, $2, 'Simulated failure')`,
        [JSON.stringify(payload), org.orgId]
      );

      const req = new NextRequest("http://localhost:3000/api/admin/billing/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: "evt_reprocess_123" }),
      });

      const res = await reprocessRoute(req);
      expect(res.status).toBe(200);

      // Verify org is now activated after admin reprocess
      const check = await db.query<{ plan_key: string }>(
        `select plan_key from public.organizations where id = $1`,
        [org.orgId]
      );
      expect(check.rows[0]?.plan_key).toBe("consultant_monthly");
    });
  });

  describe("Security: Payload Masking", () => {
    it("masks secrets, tokens, passwords and card numbers recursively", () => {
      const raw = {
        id: "evt_123",
        payment: {
          card_number: "4111111111111111",
          cvv: "123",
          auth_token: "secret_token_abc",
        },
        user: {
          name: "Exporter",
          password_hash: "hash_xyz",
        },
      };

      const masked = maskPayloadSecrets(raw) as typeof raw;
      expect(masked.payment.card_number).toBe("****");
      expect(masked.payment.cvv).toBe("****");
      expect(masked.payment.auth_token).toBe("****");
      expect(masked.user.password_hash).toBe("****");
      expect(masked.user.name).toBe("Exporter");
    });
  });
});
