import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ConflictError } from "@/lib/auth/errors";

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
import {
  createOrganizationSubscription,
  verifySubscriptionPaymentSignature,
} from "@/lib/billing/razorpay";
import { getEntitlements } from "@/lib/billing/entitlements";
import { POST as subscribeRoute } from "@/app/api/billing/subscribe/route";
import { POST as verifyRoute } from "@/app/api/billing/verify/route";
import { GET as statusRoute } from "@/app/api/billing/status/route";
import { POST as cancelRoute } from "@/app/api/billing/cancel/route";

describe("Prompt 13 - Razorpay Checkout & Subscription Engine", () => {
  const testSecret = "test_razorpay_secret_12345";

  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.RAZORPAY_KEY_ID = "rzp_test_fixture_key";
    process.env.RAZORPAY_KEY_SECRET = testSecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_67890";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_fixture_key";
    process.env.RAZORPAY_PLAN_EXPORTER_MONTHLY = "plan_exporter_monthly_mock";
    process.env.RAZORPAY_PLAN_EXPORTER_ANNUAL = "plan_exporter_annual_mock";
    process.env.RAZORPAY_PLAN_CONSULTANT_MONTHLY = "plan_consultant_monthly_mock";
    process.env.RAZORPAY_PLAN_CONSULTANT_ANNUAL = "plan_consultant_annual_mock";
  });

  beforeEach(async () => {
    await resetPgliteDb();
    mockAuthState.user = null;
  });

  describe("Cryptographic Signature Verification", () => {
    it("verifies a valid subscription payment signature with HMAC-SHA256(payment_id|subscription_id)", () => {
      const paymentId = "pay_test_001";
      const subscriptionId = "sub_test_001";
      const payload = `${paymentId}|${subscriptionId}`;
      const signature = crypto.createHmac("sha256", testSecret).update(payload).digest("hex");

      const isValid = verifySubscriptionPaymentSignature({
        paymentId,
        subscriptionId,
        signature,
        secret: testSecret,
      });

      expect(isValid).toBe(true);
    });

    it("rejects when signature has a flipped byte", () => {
      const paymentId = "pay_test_001";
      const subscriptionId = "sub_test_001";
      const payload = `${paymentId}|${subscriptionId}`;
      const validSig = crypto.createHmac("sha256", testSecret).update(payload).digest("hex");

      const flippedSig = validSig.slice(0, -1) + (validSig.slice(-1) === "a" ? "b" : "a");

      const isValid = verifySubscriptionPaymentSignature({
        paymentId,
        subscriptionId,
        signature: flippedSig,
        secret: testSecret,
      });

      expect(isValid).toBe(false);
    });

    it("rejects when one-time order payload order (order_id|payment_id) is used instead of subscription order", () => {
      const paymentId = "pay_test_001";
      const subscriptionId = "sub_test_001";
      // One-time order order would be subscriptionId|paymentId instead of paymentId|subscriptionId
      const wrongPayload = `${subscriptionId}|${paymentId}`;
      const wrongSignature = crypto
        .createHmac("sha256", testSecret)
        .update(wrongPayload)
        .digest("hex");

      const isValid = verifySubscriptionPaymentSignature({
        paymentId,
        subscriptionId,
        signature: wrongSignature,
        secret: testSecret,
      });

      expect(isValid).toBe(false);
    });

    it("rejects missing parameters gracefully without throwing", () => {
      expect(
        verifySubscriptionPaymentSignature({
          paymentId: "",
          subscriptionId: "sub_1",
          signature: "sig_1",
          secret: testSecret,
        })
      ).toBe(false);
    });
  });

  describe("createOrganizationSubscription", () => {
    it("creates a Razorpay customer and subscription with status 'created' and records audit log", async () => {
      const user = await ensurePgliteUser("owner@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Acme Spices",
        type: "exporter",
      });

      const result = await createOrganizationSubscription({
        orgId: org.orgId,
        actorId: user.id,
        planKey: "exporter_monthly",
        customerEmail: user.email,
        customerName: org.name,
      });

      expect(result.subscriptionId).toMatch(/^sub_/);
      expect(result.planKey).toBe("exporter_monthly");
      expect(result.keyId).toBe("rzp_test_fixture_key");
      expect(result.isPlanChange).toBe(false);

      const db = await getPgliteDb();
      const subRes = await db.query<{
        razorpay_subscription_id: string;
        plan_key: string;
        status: string;
      }>(
        `select razorpay_subscription_id, plan_key, status from public.subscriptions where org_id = $1`,
        [org.orgId]
      );

      expect(subRes.rows).toHaveLength(1);
      expect(subRes.rows[0]!.razorpay_subscription_id).toBe(result.subscriptionId);
      expect(subRes.rows[0]!.status).toBe("created");
      expect(subRes.rows[0]!.plan_key).toBe("exporter_monthly");

      // Verify audit log
      const auditRes = await db.query<{ action: string; entity: string }>(
        `select action, entity from public.audit_log where org_id = $1 and action = 'subscription_created'`,
        [org.orgId]
      );
      expect(auditRes.rows).toHaveLength(1);
    });

    it("rejects subscribing to free or trial_pro plans", async () => {
      const user = await ensurePgliteUser("free@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Free Exporter",
        type: "exporter",
      });

      await expect(
        createOrganizationSubscription({
          orgId: org.orgId,
          actorId: user.id,
          planKey: "free",
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        createOrganizationSubscription({
          orgId: org.orgId,
          actorId: user.id,
          planKey: "trial_pro",
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("blocks duplicate subscription when already active on the same plan", async () => {
      const user = await ensurePgliteUser("active@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Active Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      // Set org as actively subscribed to exporter_monthly
      await db.query(
        `update public.organizations set plan_key = 'exporter_monthly', plan_status = 'active' where id = $1`,
        [org.orgId]
      );
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, 'sub_active_123', 'exporter_monthly', 'active')`,
        [org.orgId]
      );

      await expect(
        createOrganizationSubscription({
          orgId: org.orgId,
          actorId: user.id,
          planKey: "exporter_monthly",
        })
      ).rejects.toThrow(ConflictError);
    });

    it("allows upgrading or changing plan when on another paid plan (plan change flow)", async () => {
      const user = await ensurePgliteUser("upgrade@exporter.test");
      mockAuthState.user = user;
      const org = await createOrganization({
        user,
        name: "Upgrade Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      await db.query(
        `update public.organizations set plan_key = 'exporter_monthly', plan_status = 'active' where id = $1`,
        [org.orgId]
      );
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
         values ($1, 'sub_monthly_123', 'exporter_monthly', 'active')`,
        [org.orgId]
      );

      // Upgrade to consultant_monthly
      const result = await createOrganizationSubscription({
        orgId: org.orgId,
        actorId: user.id,
        planKey: "consultant_monthly",
      });

      expect(result.isPlanChange).toBe(true);
      expect(result.previousSubscriptionId).toBe("sub_monthly_123");
      expect(result.planKey).toBe("consultant_monthly");
    });
  });

  describe("API Endpoints & Acceptance Criteria", () => {
    it("POST /api/billing/subscribe requires owner or admin role", async () => {
      const owner = await ensurePgliteUser("owner2@exporter.test");
      const viewer = await ensurePgliteUser("viewer2@exporter.test");
      mockAuthState.user = owner;
      const org = await createOrganization({
        user: owner,
        name: "Perm Test Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      await db.query(
        `insert into public.memberships (user_id, org_id, role) values ($1, $2, 'viewer')`,
        [viewer.id, org.orgId]
      );

      // Viewer attempts to subscribe -> 403 Forbidden
      mockAuthState.user = viewer;
      const viewerReq = new NextRequest("http://localhost:3000/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: "exporter_monthly",
          orgId: org.orgId,
        }),
      });
      const viewerRes = await subscribeRoute(viewerReq);
      expect(viewerRes.status).toBe(403);

      // Owner attempts to subscribe -> 200 OK
      mockAuthState.user = owner;
      const ownerReq = new NextRequest("http://localhost:3000/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: "exporter_monthly",
          orgId: org.orgId,
        }),
      });
      const ownerRes = await subscribeRoute(ownerReq);
      expect(ownerRes.status).toBe(200);
      const data = await ownerRes.json();
      expect(data.subscriptionId).toBeDefined();
    });

    it("CRITICAL ACCEPTANCE CRITERIA: POST /api/billing/verify verifies signature but DOES NOT activate the plan", async () => {
      const owner = await ensurePgliteUser("verify_no_activate@exporter.test");
      mockAuthState.user = owner;
      const org = await createOrganization({
        user: owner,
        name: "Pending Activation Exporter",
        type: "exporter",
      });

      // Verify starting state: plan is 'free'
      expect(org.planKey).toBe("free");

      const paymentId = "pay_test_signature_999";
      const subscriptionId = "sub_test_signature_999";
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest("hex");

      mockAuthState.user = owner;
      const req = new NextRequest("http://localhost:3000/api/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_payment_id: paymentId,
          razorpay_subscription_id: subscriptionId,
          razorpay_signature: signature,
          orgId: org.orgId,
        }),
      });

      const res = await verifyRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.verified).toBe(true);

      // PROVE that the browser verify callback did NOT activate the plan:
      // (Hard Rule 10: The webhook is the source of truth for activating or deactivating a plan.
      // Never trust the browser's payment success callback for activation.)
      const db = await getPgliteDb();
      const orgCheck = await db.query<{ plan_key: string; plan_status: string }>(
        `select plan_key, plan_status from public.organizations where id = $1`,
        [org.orgId]
      );
      expect(orgCheck.rows[0]!.plan_key).toBe("free");

      const entitlements = await getEntitlements(org.orgId);
      expect(entitlements.planKey).toBe("free");
      expect(entitlements.entitlements.canGenerateEbrc).toBe(false);
      expect(entitlements.entitlements.shippingBillsPerMonth).toBe(5);
    });

    it("POST /api/billing/cancel cancels at cycle end and preserves access until current_end", async () => {
      const owner = await ensurePgliteUser("cancel@exporter.test");
      mockAuthState.user = owner;
      const org = await createOrganization({
        user: owner,
        name: "Canceling Exporter",
        type: "exporter",
      });

      const cycleEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
      const db = await getPgliteDb();
      await db.query(
        `update public.organizations set plan_key = 'exporter_monthly', plan_status = 'active' where id = $1`,
        [org.orgId]
      );
      await db.query(
        `insert into public.subscriptions (
           org_id, razorpay_subscription_id, plan_key, status, current_end, cancel_at_cycle_end
         )
         values ($1, 'sub_cancel_test', 'exporter_monthly', 'active', $2, false)`,
        [org.orgId, cycleEnd]
      );

      mockAuthState.user = owner;
      const req = new NextRequest("http://localhost:3000/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.orgId }),
      });

      const res = await cancelRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.cancelAtCycleEnd).toBe(true);

      // Verify subscriptions row updated
      const subRes = await db.query<{ cancel_at_cycle_end: boolean }>(
        `select cancel_at_cycle_end from public.subscriptions where org_id = $1`,
        [org.orgId]
      );
      expect(subRes.rows[0]!.cancel_at_cycle_end).toBe(true);

      // User STILL has active exporter_monthly entitlements because cycle hasn't ended
      const entitlements = await getEntitlements(org.orgId);
      expect(entitlements.planKey).toBe("exporter_monthly");
      expect(entitlements.entitlements.canGenerateEbrc).toBe(true);
    });

    it("GET /api/billing/status reports organization billing state", async () => {
      const owner = await ensurePgliteUser("status@exporter.test");
      mockAuthState.user = owner;
      const org = await createOrganization({
        user: owner,
        name: "Status Exporter",
        type: "exporter",
      });

      mockAuthState.user = owner;
      const req = new NextRequest(`http://localhost:3000/api/billing/status?orgId=${org.orgId}`);
      const res = await statusRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orgId).toBe(org.orgId);
      expect(data.planKey).toBe("free");
      expect(data.isPaidPlanActive).toBe(false);
    });
  });

  describe("ACCEPTANCE CRITERIA: Client Bundle Secret Isolation", () => {
    it("verifies server secrets never appear in client billing components or client bundles", () => {
      const clientComponentsDir = path.resolve(process.cwd(), "components/billing");
      const clientAppDir = path.resolve(process.cwd(), "app/app/billing");

      const filesToCheck: string[] = [];

      function walkDir(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (
            entry.isFile() &&
            (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))
          ) {
            filesToCheck.push(fullPath);
          }
        }
      }

      walkDir(clientComponentsDir);
      walkDir(clientAppDir);

      expect(filesToCheck.length).toBeGreaterThan(0);

      const forbiddenSecrets = [
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY",
      ];

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const secret of forbiddenSecrets) {
          expect(
            content.includes(secret),
            `Security violation: ${secret} found in client file ${filePath}`
          ).toBe(false);
        }
      }
    });
  });
});
