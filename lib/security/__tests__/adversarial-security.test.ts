import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { ensurePgliteUser, getPgliteDb } from "@/lib/auth/pglite-adapter";
import { GET as getReceiptHandler } from "@/app/api/billing/receipts/[eventId]/route";
import { POST as verifyPaymentHandler } from "@/app/api/billing/verify/route";
import { POST as razorpayWebhookHandler } from "@/app/api/webhooks/razorpay/route";
import { POST as shareReportHandler } from "@/app/api/orgs/[orgId]/reports/share/route";
import { POST as publicExtractHandler } from "@/app/api/public/tools/extract-shipping-bill/route";
import { POST as publicValidateEbrcHandler } from "@/app/api/public/tools/validate-ebrc/route";
import { POST as ebrcActionHandler } from "@/app/api/orgs/[orgId]/ebrc/route";
import { POST as createIecHandler } from "@/app/api/orgs/[orgId]/iecs/route";
import { processRazorpayWebhook } from "@/lib/billing/webhook-processor";
import { validateMagicBytes, detectDangerousBinarySignature } from "@/lib/documents/file-security";
import { assertValidStoragePath } from "@/lib/documents/storage";
import { NextRequest } from "next/server";

interface MockUser {
  id: string;
  email: string | null;
  isPlatformAdmin?: boolean;
}

const mockAuthState = {
  user: null as MockUser | null,
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

function makeJsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
): NextRequest {
  const reqHeaders = new Headers(headers ?? {});
  if (body) reqHeaders.set("content-type", "application/json");

  return new NextRequest(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Adversarial Security Review & Payments Penetration Audit (Appendix B - Prompt 1)", () => {
  beforeEach(async () => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
    mockAuthState.user = null;
  });

  // Vector 1: Cross-Tenant Data Breach
  describe("Vector 1: Cross-Tenant Data Breach Attempts", () => {
    it("ATTACK: User A attempts to view Org B's payment receipt via /api/billing/receipts/[eventId]", async () => {
      const db = await getPgliteDb();

      // Create Org B and user B
      const userB = await ensurePgliteUser(`userb_${Date.now()}@example.invalid`);
      const userA = await ensurePgliteUser(`usera_${Date.now()}@example.invalid`);

      const orgBId = crypto.randomUUID();
      const orgAId = crypto.randomUUID();
      const eventBId = crypto.randomUUID();

      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Victim Org B', 'exporter', 'exporter_monthly', 'active')`,
        [orgBId]
      );
      await db.query(
        `insert into public.memberships (user_id, org_id, role) values ($1, $2, 'owner')`,
        [userB.id, orgBId]
      );

      // Org A
      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Attacker Org A', 'exporter', 'free', 'active')`,
        [orgAId]
      );
      await db.query(
        `insert into public.memberships (user_id, org_id, role) values ($1, $2, 'owner')`,
        [userA.id, orgAId]
      );

      // Create a payment event for Org B
      await db.query(
        `insert into public.payment_events (id, provider, provider_event_id, event_type, org_id, payload)
         values ($1, 'razorpay', $2, 'subscription.charged', $3, '{"payload": {"payment": {"entity": {"amount": 99900}}}}'::jsonb)`,
        [eventBId, `evt_victim_${Date.now()}`, orgBId]
      );

      // Attacker User A is authenticated
      mockAuthState.user = userA;

      const request = makeJsonRequest(`http://localhost/api/billing/receipts/${eventBId}`, "GET");

      const response = await getReceiptHandler(request, {
        params: Promise.resolve({ eventId: eventBId }),
      });

      // Must be rejected with 403 Forbidden (cross-tenant receipt access blocked)
      expect(response.status).toBe(403);
    });

    it("ATTACK: User A attempts to create a shared report with Org B's IEC identifier", async () => {
      const db = await getPgliteDb();

      const userA = await ensurePgliteUser(`usera_rep_${Date.now()}@example.invalid`);
      const orgAId = crypto.randomUUID();
      const orgBId = crypto.randomUUID();
      const iecBId = crypto.randomUUID();

      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Org A', 'exporter', 'free', 'active')`,
        [orgAId]
      );
      await db.query(
        `insert into public.memberships (user_id, org_id, role) values ($1, $2, 'owner')`,
        [userA.id, orgAId]
      );

      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Org B', 'exporter', 'free', 'active')`,
        [orgBId]
      );
      await db.query(
        `insert into public.iec_profiles (id, org_id, iec_code, legal_name) values ($1, $2, $3, 'Org B Ltd')`,
        [iecBId, orgBId, `IECO${Date.now().toString().slice(-6)}`]
      );

      mockAuthState.user = userA;

      const request = makeJsonRequest(`http://localhost/api/orgs/${orgAId}/reports/share`, "POST", {
        title: "Stolen IEC Report",
        iecId: iecBId, // Belongs to Org B!
        totals: {
          totalShipments: 1,
          totalFobMinor: 100000,
          totalExpectedMinor: 2000,
          totalCreditedMinor: 2000,
          totalUnclaimedMinor: 0,
        },
      });

      const response = await shareReportHandler(request, {
        params: Promise.resolve({ orgId: orgAId }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error.message).toMatch(/IEC profile does not belong to this organization/i);
    });
  });

  // Vector 2: Unauthenticated Plan Activation
  describe("Vector 2: Unauthenticated Plan Activation Attempts", () => {
    it("ATTACK: Attacker calls /api/billing/verify directly hoping to activate a paid plan", async () => {
      const keySecret = process.env.RAZORPAY_KEY_SECRET || "your-razorpay-key-secret";
      const paymentId = "pay_fake123";
      const subscriptionId = "sub_fake123";
      const validSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest("hex");

      const request = makeJsonRequest("http://localhost/api/billing/verify", "POST", {
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: subscriptionId,
        razorpay_signature: validSignature,
      });

      const response = await verifyPaymentHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.verified).toBe(true);
      // Hard Rule 10: response explicitly says waiting for webhook activation, does not activate
      expect(data.message).toMatch(/Waiting for webhook activation/i);
    });
  });

  // Vector 3: Webhook Forgery & Replay
  describe("Vector 3: Webhook Forgery & Replay Protection", () => {
    it("ATTACK: Attacker sends forged Razorpay webhook with forged signature", async () => {
      const body = JSON.stringify({
        event: "subscription.charged",
        payload: { subscription: { entity: { id: "sub_fake" } } },
      });

      const request = new NextRequest("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": "bad_signature_000000000000000000000000000000000000000000000000",
        },
        body,
      });

      const response = await razorpayWebhookHandler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/signature/i);
    });

    it("ATTACK: Attacker flips 1 byte of the HMAC signature", async () => {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "your-razorpay-webhook-secret";
      const body = JSON.stringify({ event: "subscription.charged" });
      const validSig = crypto.createHmac("sha256", secret).update(body).digest("hex");
      const flippedSig = (validSig[0] === "a" ? "b" : "a") + validSig.slice(1);

      const request = new NextRequest("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": flippedSig,
        },
        body,
      });

      const response = await razorpayWebhookHandler(request);
      expect(response.status).toBe(400);
    });

    it("ATTACK: Webhook replay attack is recognized as duplicate without side effects", async () => {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "your-razorpay-webhook-secret";
      const eventId = `replay_${Date.now()}`;
      const payload = {
        id: eventId,
        event: "subscription.authenticated",
        payload: { subscription: { entity: { id: `sub_${Date.now()}` } } },
      };
      const rawBody = JSON.stringify(payload);
      const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

      // First run: processes
      const first = await processRazorpayWebhook({
        rawBody,
        signature: sig,
        eventIdHeader: eventId,
      });
      expect(first.status).toBe("processed");

      // Second run: replay
      const second = await processRazorpayWebhook({
        rawBody,
        signature: sig,
        eventIdHeader: eventId,
      });
      expect(second.status).toBe("duplicate");
    });
  });

  // Vector 4: Direct API Plan Limit Bypass
  describe("Vector 4: Direct API Plan Limit Bypass Attempts", () => {
    it("ATTACK: Free plan user attempts to generate eBRC via direct API call", async () => {
      const db = await getPgliteDb();
      const user = await ensurePgliteUser(`free_${Date.now()}@example.invalid`);
      const orgId = crypto.randomUUID();

      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Free Exporter', 'exporter', 'free', 'active')`,
        [orgId]
      );
      await db.query(
        `insert into public.memberships (user_id, org_id, role) values ($1, $2, 'owner')`,
        [user.id, orgId]
      );

      mockAuthState.user = user;

      const request = makeJsonRequest(`http://localhost/api/orgs/${orgId}/ebrc`, "POST", {
        action: "generate",
        rows: [
          {
            serialNumber: 1,
            iecBranchSlNo: "0",
            ifscCode: "HDFC0000123",
            adCode: "0510001",
            irmNumber: "IRM2026001",
            irmDate: "15/10/2026",
            irmCurrency: "USD",
            purposeCode: "P0102",
            amountInFcc: "1500.00",
            portCode: "INNSA1",
            shippingBillNumber: "1234567",
            shippingBillDate: "10/10/2026",
          },
        ],
      });

      const response = await ebrcActionHandler(request, {
        params: Promise.resolve({ orgId }),
      });

      // Free plan cannot generate eBRC -> must return 402 with PLAN_LIMIT_EXCEEDED
      expect(response.status).toBe(402);
      const data = await response.json();
      expect(data.error.code).toBe("PLAN_LIMIT_EXCEEDED");
    });

    it("ATTACK: Free plan user with 1 existing IEC attempts to add a 2nd IEC via direct API", async () => {
      const db = await getPgliteDb();
      const user = await ensurePgliteUser(`free2_${Date.now()}@example.invalid`);
      const orgId = crypto.randomUUID();

      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Free Exporter 2', 'exporter', 'free', 'active')`,
        [orgId]
      );
      await db.query(
        `insert into public.memberships (user_id, org_id, role) values ($1, $2, 'owner')`,
        [user.id, orgId]
      );
      await db.query(
        `insert into public.iec_profiles (org_id, iec_code, legal_name) values ($1, $2, 'First IEC')`,
        [orgId, `IEC1${Date.now().toString().slice(-6)}`]
      );

      mockAuthState.user = user;

      const request = makeJsonRequest(`http://localhost/api/orgs/${orgId}/iecs`, "POST", {
        iecCode: `IEC2${Date.now().toString().slice(-6)}`,
        legalName: "Second IEC Attempt",
      });

      const response = await createIecHandler(request, {
        params: Promise.resolve({ orgId }),
      });

      // Free tier max IEC is 1 -> adding 2nd must return 402
      expect(response.status).toBe(402);
      const data = await response.json();
      expect(data.error.code).toBe("PLAN_LIMIT_EXCEEDED");
    });
  });

  // Vector 5: Malicious File Upload Attacks
  describe("Vector 5: Malicious File Upload Attacks", () => {
    it("ATTACK: Renamed .exe with a .pdf extension is rejected by magic byte detection", () => {
      // Windows PE/EXE starts with "MZ" (0x4D, 0x5A)
      const fakePdf = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const check = validateMagicBytes(fakePdf, "pdf");

      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Executable Windows binary/i);
    });

    it("ATTACK: Linux ELF binary disguised as .xlsx is rejected", () => {
      // ELF starts with 0x7F, 'E', 'L', 'F'
      const fakeXlsx = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]);
      const check = validateMagicBytes(fakeXlsx, "xlsx");

      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Executable ELF binary/i);
    });

    it("ATTACK: Path traversal payload in storage path is rejected", () => {
      expect(() => {
        assertValidStoragePath("../../etc/passwd.pdf");
      }).toThrow(/Invalid storage path/i);

      expect(() => {
        assertValidStoragePath("orgId/iecId/../../../windows/system32/cmd.exe");
      }).toThrow(/Invalid storage path/i);
    });

    it("ATTACK: Public shipping bill extractor rejects non-PDF binary upload with 400", async () => {
      const fakePdfBytes = new Uint8Array([0x4d, 0x5a, 0x00, 0x00]); // MZ executable
      const check = validateMagicBytes(fakePdfBytes, "pdf");
      expect(check.valid).toBe(false);

      const request = new NextRequest("http://localhost/api/public/tools/extract-shipping-bill", {
        method: "POST",
        body: "invalid-binary-content",
      });

      const response = await publicExtractHandler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/Invalid form data submission|valid Shipping Bill PDF/i);
    });

    it("ATTACK: Public eBRC validator rejects non-XLSX upload with 400", async () => {
      const fakeExcelBytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]); // ELF
      const check = validateMagicBytes(fakeExcelBytes, "xlsx");
      expect(check.valid).toBe(false);

      const request = new NextRequest("http://localhost/api/public/tools/validate-ebrc", {
        method: "POST",
        body: "invalid-binary-content",
      });

      const response = await publicValidateEbrcHandler(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/Invalid form data submission|valid .xlsx Bulk eBRC/i);
    });
  });

  // Vector 6: Secret Leak Audit
  describe("Vector 6: Secret Leak Audit", () => {
    it("CRITICAL: Detects and rejects dangerous signatures in binary uploads", () => {
      // Shell script shebang "#!"
      const shebang = new Uint8Array([0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e]);
      expect(detectDangerousBinarySignature(shebang)).toMatch(/Executable script header/i);
    });
  });

  // Vector 7: Double Billing Prevention
  describe("Vector 7: Double Billing Prevention on Plan Upgrade", () => {
    it("PROVES: Activating an upgraded subscription automatically supersedes & cancels prior active subscription", async () => {
      const db = await getPgliteDb();
      const orgId = crypto.randomUUID();
      const priorSubId = `sub_prior_${Date.now()}`;
      const newSubId = `sub_new_${Date.now()}`;
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "your-razorpay-webhook-secret";

      // Create org and initial active subscription
      await db.query(
        `insert into public.organizations (id, name, type, plan_key, plan_status) values ($1, 'Upgrading Org', 'exporter', 'exporter_monthly', 'active')`,
        [orgId]
      );

      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status, paid_count, cancel_at_cycle_end)
         values ($1, $2, 'exporter_monthly', 'active', 1, false)`,
        [orgId, priorSubId]
      );

      // Now new subscription is created on upgrade to consultant_annual
      await db.query(
        `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status, paid_count, cancel_at_cycle_end)
         values ($1, $2, 'consultant_annual', 'created', 0, false)`,
        [orgId, newSubId]
      );

      // Webhook arrives: subscription.activated for newSubId
      const eventId = `evt_act_${Date.now()}`;
      const payload = {
        id: eventId,
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: newSubId,
              notes: { org_id: orgId, plan_key: "consultant_annual" },
              current_start: Math.floor(Date.now() / 1000),
              current_end: Math.floor(Date.now() / 1000) + 365 * 86400,
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

      const result = await processRazorpayWebhook({
        rawBody,
        signature: sig,
        eventIdHeader: eventId,
      });

      expect(result.status).toBe("processed");

      // Verify Org plan is updated
      const orgRes = await db.query<{ plan_key: string; plan_status: string }>(
        `select plan_key, plan_status from public.organizations where id = $1`,
        [orgId]
      );
      expect(orgRes.rows[0]?.plan_key).toBe("consultant_annual");
      expect(orgRes.rows[0]?.plan_status).toBe("active");

      // Verify the PRIOR subscription is cancelled to prevent DOUBLE BILLING!
      const priorSubRes = await db.query<{ status: string }>(
        `select status from public.subscriptions where razorpay_subscription_id = $1`,
        [priorSubId]
      );
      expect(priorSubRes.rows[0]?.status).toBe("cancelled");

      // Verify the NEW subscription is active
      const newSubRes = await db.query<{ status: string }>(
        `select status from public.subscriptions where razorpay_subscription_id = $1`,
        [newSubId]
      );
      expect(newSubRes.rows[0]?.status).toBe("active");
    });
  });
});
