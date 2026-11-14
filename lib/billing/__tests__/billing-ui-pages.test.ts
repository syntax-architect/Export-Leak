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
import { GET as exportDataRoute } from "@/app/api/orgs/[orgId]/export-data/route";
import { GET as billingHistoryRoute } from "@/app/api/billing/history/route";
import { GET as receiptRoute } from "@/app/api/billing/receipts/[eventId]/route";

describe("Prompt 15 - Billing UI, Pricing, Legal Pages & Data Portability", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  beforeEach(async () => {
    await resetPgliteDb();
    mockAuthState.user = null;
  });

  describe("Export my data (Data Portability)", () => {
    it("allows a lapsed / Free user to export all organization records as structured JSON", async () => {
      const user = await ensurePgliteUser("exporter@data-portability.test");
      mockAuthState.user = user;

      const org = await createOrganization({
        user,
        name: "Data Portability Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      // Ensure org is on Free plan
      await db.query(
        `update public.organizations set plan_key = 'free', plan_status = 'active' where id = $1`,
        [org.orgId]
      );

      const req = new NextRequest(`http://localhost:3000/api/orgs/${org.orgId}/export-data`);
      const res = await exportDataRoute(req, { params: Promise.resolve({ orgId: org.orgId }) });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("content-disposition")).toContain(`exportleak-data-${org.orgId}.json`);

      const exportedData = await res.json();
      expect(exportedData.organization.id).toBe(org.orgId);
      expect(Array.isArray(exportedData.iecProfiles)).toBe(true);
      expect(Array.isArray(exportedData.shippingBills)).toBe(true);

      // Verify audit log recorded data export
      const auditRes = await db.query<{ action: string }>(
        `select action from public.audit_log where org_id = $1 and action = 'org_data_exported'`,
        [org.orgId]
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
    });

    it("rejects unauthorized access to another organization's data export with 400/403", async () => {
      const userA = await ensurePgliteUser("userA@export.test");
      const userB = await ensurePgliteUser("userB@export.test");
      mockAuthState.user = userA;

      const orgB = await createOrganization({
        user: userB,
        name: "Organization B",
        type: "exporter",
      });

      const req = new NextRequest(`http://localhost:3000/api/orgs/${orgB.orgId}/export-data`);
      const res = await exportDataRoute(req, { params: Promise.resolve({ orgId: orgB.orgId }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("Billing History & Receipts", () => {
    it("returns billing history list for organization", async () => {
      const user = await ensurePgliteUser("owner@billing-history.test");
      mockAuthState.user = user;

      const org = await createOrganization({
        user,
        name: "History Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      await db.query(
        `insert into public.payment_events (provider, provider_event_id, event_type, payload, org_id)
         values ('razorpay', 'evt_hist_001', 'subscription.charged', $1::jsonb, $2)`,
        [
          JSON.stringify({
            event: "subscription.charged",
            payload: {
              payment: { entity: { amount: 99900, id: "pay_hist_001" } },
              subscription: { entity: { notes: { plan_key: "exporter_monthly" } } },
            },
          }),
          org.orgId,
        ]
      );

      const req = new NextRequest(`http://localhost:3000/api/billing/history?orgId=${org.orgId}`);
      const res = await billingHistoryRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.events).toHaveLength(1);
      expect(data.events[0].amountPaise).toBe(99900);
      expect(data.events[0].status).toBe("paid");
    });

    it("generates branded payment receipt with non-GST disclaimer", async () => {
      const user = await ensurePgliteUser("owner@receipt.test");
      mockAuthState.user = user;

      const org = await createOrganization({
        user,
        name: "Receipt Exporter",
        type: "exporter",
      });

      const db = await getPgliteDb();
      const insertRes = await db.query<{ id: string }>(
        `insert into public.payment_events (provider, provider_event_id, event_type, payload, org_id)
         values ('razorpay', 'evt_receipt_001', 'subscription.activated', $1::jsonb, $2)
         returning id`,
        [
          JSON.stringify({
            event: "subscription.activated",
            payload: {
              payment: { entity: { amount: 99900, id: "pay_rcpt_001" } },
              subscription: { entity: { notes: { plan_key: "exporter_monthly" } } },
            },
          }),
          org.orgId,
        ]
      );

      const eventRowId = insertRes.rows[0]?.id;
      expect(eventRowId).toBeDefined();
      if (!eventRowId) throw new Error("Event ID missing");

      const req = new NextRequest(`http://localhost:3000/api/billing/receipts/${eventRowId}`);
      const res = await receiptRoute(req, { params: Promise.resolve({ eventId: eventRowId }) });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("ExportLeak");
      expect(html).toContain("Receipt Notice:");
      expect(html).toContain("GST Tax Invoice");
      expect(html).toContain("₹999");
      expect(html).toContain("Receipt Exporter");
    });
  });
});
