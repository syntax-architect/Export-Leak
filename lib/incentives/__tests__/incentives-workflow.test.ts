// @vitest-environment node
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = {
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
    getAuthenticatedUser: async () => mockState.user,
    requirePlatformAdmin: async () => actual.assertPlatformAdminAccess(mockState.user),
    requireOrgAccess: async (
      orgId: string,
      minRole: "viewer" | "member" | "admin" | "owner" = "viewer"
    ) =>
      actual.assertOrgMembershipAccess({
        user: mockState.user,
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

vi.mock("@/lib/supabase/config", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/supabase/config")>("@/lib/supabase/config");
  return {
    ...actual,
    isPgliteTestAdapterEnabled: () => true,
  };
});

import { POST as createOrgRoute } from "@/app/api/orgs/route";
import { POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import {
  GET as adminRatesGetRoute,
  PATCH as adminRatesPatchRoute,
  POST as adminRatesPostRoute,
} from "@/app/api/admin/incentive-rates/route";
import {
  GET as getIncentivesRoute,
  POST as recalcIncentivesRoute,
} from "@/app/api/orgs/[orgId]/incentives/route";
import { POST as scrollImportRoute } from "@/app/api/orgs/[orgId]/incentives/scroll/route";
import { POST as createScripRoute } from "@/app/api/orgs/[orgId]/scrips/route";
import {
  DELETE as deleteScripRoute,
  PATCH as patchScripRoute,
} from "@/app/api/orgs/[orgId]/scrips/[scripId]/route";
import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";

describe("Prompt 8 Incentives End-to-End API Workflow", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
  });

  beforeEach(async () => {
    await resetPgliteDb();
    mockState.user = null;
  });

  afterAll(async () => {
    await resetPgliteDb();
    delete process.env.EXPORTLEAK_E2E_ADAPTER;
  });

  it("imports effective-dated rates as admin, computes expectations across schemes, reconciles scroll credits, and enforces scrip expiry rules", async () => {
    const exporter = await ensurePgliteUser("exporter@example.invalid");
    const adminUser = await ensurePgliteUser("admin@exportleak.invalid");
    const outsider = await ensurePgliteUser("outsider@example.invalid");

    // 1. Create Org + IEC as exporter
    mockState.user = exporter;
    const orgRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Coimbatore Precision Works", roleChoice: "exporter" }),
      })
    );
    expect(orgRes.status).toBe(201);
    const { organization } = (await orgRes.json()) as { organization: { orgId: string } };
    const orgId = organization.orgId;

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACC1234D", legalName: "CPW Exports" }),
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(iecRes.status).toBe(201);
    const { iec } = await iecRes.json();

    // Seed 3 Shipping Bills (H1 confirmed INR, H2 confirmed USD with FX, Unconfirmed needs_review bill)
    const db = await getPgliteDb();
    const sb1Id = "11111111-1111-4111-8111-000000000001";
    const sb2Id = "11111111-1111-4111-8111-000000000002";
    const sb3Id = "11111111-1111-4111-8111-000000000003";

    await db.query(
      `insert into public.shipping_bills (
         id, iec_id, sb_number, sb_date, leo_date, port_code, invoice_no, buyer_name,
         currency, fob_minor, exchange_rate, schemes_claimed, status
       ) values
       ($1, $4, 'SB2026001', '2026-04-01', '2026-04-05', 'INMAA1', 'INV-01', 'ACME GMBH', 'INR', 20000000, 1.0, array['rodtep','drawback'], 'parsed'),
       ($2, $4, 'SB2026002', '2026-07-10', '2026-07-15', 'INMAA1', 'INV-02', 'NORDIC AB', 'USD', 500000, 80.0, array['rodtep'], 'parsed'),
       ($3, $4, 'SB2026003', '2026-07-20', '2026-07-21', 'INMAA1', 'INV-03', 'LOWCONF LLC', 'INR', 1000000, 1.0, array['rosctl'], 'needs_review')`,
      [sb1Id, sb2Id, sb3Id, iec.id]
    );

    await db.query(
      `insert into public.shipping_bill_items (shipping_bill_id, hs_code, description, quantity, uqc, fob_minor) values
       ($1, '84834000', 'Forged Gears', 100.0000, 'KGS', 20000000),
       ($2, '84834000', 'Precision Shafts', 100.0000, 'KGS', 500000),
       ($3, '62052000', 'Woven Shirts', 50.0000, 'PCS', 1000000)`,
      [sb1Id, sb2Id, sb3Id]
    );

    // 2. Non-admin MUST be blocked from previewing/committing incentive rates
    const blockedPreview = await adminRatesPostRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "commit", rows: [] }),
      })
    );
    expect(blockedPreview.status).toBe(403);

    // 3. Platform admin previews synthetic CSV fixture and commits rates
    mockState.user = { ...adminUser, isPlatformAdmin: true };
    const rateCsv = await fs.readFile(
      path.resolve(process.cwd(), "fixtures/rates/synthetic-test-rates.csv")
    );
    const rateForm = new FormData();
    rateForm.set("file", new File([rateCsv], "synthetic-test-rates.csv", { type: "text/csv" }));

    const previewRatesRes = await adminRatesPostRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "POST",
        body: rateForm,
      })
    );
    const previewRatesBody = await previewRatesRes.json();
    expect(previewRatesRes.status, JSON.stringify(previewRatesBody)).toBe(200);
    expect(previewRatesBody.errors).toHaveLength(0);
    expect(previewRatesBody.validRows.length).toBeGreaterThanOrEqual(4);

    const commitRatesRes = await adminRatesPostRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          orgId: orgId,
          rows: previewRatesBody.validRows,
        }),
      })
    );
    expect(commitRatesRes.status).toBe(201);

    // Duplicate/overlapping range attempt fails with 409 Conflict at DB trigger level
    const overlapCommit = await adminRatesPostRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          rows: [previewRatesBody.validRows[0]],
        }),
      })
    );
    expect(overlapCommit.status).toBe(409);

    // Regular exporter can read rates GET
    mockState.user = exporter;
    const readRatesRes = await adminRatesGetRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates?scheme=rodtep")
    );
    expect(readRatesRes.status).toBe(200);

    // 4. Recalculate Org Incentives
    const recalcRes = await recalcIncentivesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/incentives`, {
        method: "POST",
        body: JSON.stringify({ iecId: iec.id }),
      }),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(recalcRes.status).toBe(200);
    const recalcBody = await recalcRes.json();
    expect(recalcBody.billsEvaluated).toBe(3);

    // 5. Scroll CSV import: upload fixture + bad unknown SB row
    const scrollCsvBase = await fs.readFile(
      path.resolve(process.cwd(), "fixtures/scroll/customs-scroll-rodtep-drawback.csv"),
      "utf8"
    );
    const scrollWithBadRow = `${scrollCsvBase.trim()}\nUNKNOWN999,rodtep,100.00,2026-08-01,SCR-BAD\n`;
    const scrollForm = new FormData();
    scrollForm.set("iecId", iec.id);
    scrollForm.set("file", new File([scrollWithBadRow], "scroll.csv", { type: "text/csv" }));

    const scrollPreviewRes = await scrollImportRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/incentives/scroll`, {
        method: "POST",
        body: scrollForm,
      }),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(scrollPreviewRes.status).toBe(200);
    const scrollPreview = await scrollPreviewRes.json();
    expect(scrollPreview.validRows).toHaveLength(3);
    expect(scrollPreview.errors).toHaveLength(1);
    expect(scrollPreview.errors[0].sbNumber).toBe("UNKNOWN999");

    const scrollCommitRes = await scrollImportRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/incentives/scroll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          iecId: iec.id,
          rows: scrollPreview.validRows,
        }),
      }),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(scrollCommitRes.status).toBe(200);

    // 6. Inspect comparison statuses:
    // SB2026001: RoDTEP FOB ₹2,00,000 * 1.5% = ₹3,000 vs cap 100*₹25 = ₹2,500 -> cap wins ₹2,500 (250,000), credited ₹2,900 -> ok
    // SB2026001: Drawback FOB ₹2,00,000 * 1.2% = ₹2,400, credited ₹10,000 -> ok
    // SB2026001: RoSCTL not_claimed
    // SB2026002: USD $5,000 * 80 = ₹4,00,000; H2 1.8% = ₹7,200 vs cap 100*₹30 = ₹3,000 -> cap wins ₹3,000 (300,000); wait credited in scroll fixture is ₹4,500 -> ok!
    // Let's also check what if scroll was missing/short on another SB or test SB2026003 low-confidence -> unknown_rate
    const wsRes1 = await getIncentivesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/incentives?iecId=${iec.id}`),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(wsRes1.status).toBe(200);
    const ws1 = await wsRes1.json();

    const sb1Rodtep = ws1.rows.find(
      (r: { sbNumber: string; scheme: string }) =>
        r.sbNumber === "SB2026001" && r.scheme === "rodtep"
    );
    expect(sb1Rodtep.expectedMinor).toBe(250_000);
    expect(sb1Rodtep.creditedMinor).toBe(290_000);
    expect(sb1Rodtep.status).toBe("ok");
    expect(sb1Rodtep.calcDetail.items[0].appliedLimb).toBe("cap");

    const sb3Rosctl = ws1.rows.find(
      (r: { sbNumber: string; scheme: string }) =>
        r.sbNumber === "SB2026003" && r.scheme === "rosctl"
    );
    expect(sb3Rosctl.status).toBe("unknown_rate");

    // 7. Scrips: while validity rule is unconfirmed, expiresOn stays null unless manual
    const scripUnconfirmedRes = await createScripRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/scrips`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iecId: iec.id,
          scripNumber: "SCRIP-UNCONF-1",
          scheme: "rodtep",
          faceAmountInr: "2500.00",
          generatedOn: "2026-06-01",
        }),
      }),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(scripUnconfirmedRes.status).toBe(201);
    const scripUnconfirmed = await scripUnconfirmedRes.json();
    expect(scripUnconfirmed.scrip.expiresOn).toBeNull();
    expect(scripUnconfirmed.scrip.expirySource).toBe("unconfirmed");

    // Platform admin confirms scrip validity rule = 12 months
    mockState.user = { ...adminUser, isPlatformAdmin: true };
    const patchRuleRes = await adminRatesPatchRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          months: 12,
          days: 0,
          sourceNote: "Verified circular for test",
          effectiveFrom: "2026-01-01",
          orgId: orgId,
        }),
      })
    );
    expect(patchRuleRes.status).toBe(200);

    // Exporter creates another scrip -> auto-computes expiresOn + surfaces in nextToExpireScrips
    mockState.user = exporter;
    const scripAutoRes = await createScripRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/scrips`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iecId: iec.id,
          scripNumber: "SCRIP-CONF-2",
          scheme: "rodtep",
          faceAmountInr: "5000.00",
          generatedOn: "2026-06-01",
        }),
      }),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(scripAutoRes.status).toBe(201);
    const scripAuto = await scripAutoRes.json();
    expect(scripAuto.scrip.expiresOn).toBe("2027-06-01");
    expect(scripAuto.scrip.expirySource).toBe("compliance_rule");

    // Update & delete scrip lifecycle
    const patchScripRes = await patchScripRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/scrips/${scripAuto.scrip.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "utilised" }),
      }),
      { params: Promise.resolve({ orgId: orgId, scripId: scripAuto.scrip.id }) }
    );
    expect(patchScripRes.status).toBe(200);
    expect((await patchScripRes.json()).scrip.status).toBe("utilised");

    const delScripRes = await deleteScripRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/scrips/${scripUnconfirmed.scrip.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ orgId: orgId, scripId: scripUnconfirmed.scrip.id }) }
    );
    expect(delScripRes.status).toBe(200);

    // 8. Verify audit_log captured recalculate, import, upsert, update, delete
    const auditRes = await db.query<{ entity: string; action: string }>(
      `select entity, action from public.audit_log where org_id = $1`,
      [orgId]
    );
    const actions = auditRes.rows.map((r) => `${r.entity}:${r.action}`);
    expect(actions).toContain("incentive_expectation:recalculate");
    expect(actions).toContain("incentive_credit:import");
    expect(actions).toContain("scrip:upsert");
    expect(actions).toContain("scrip:update");
    expect(actions).toContain("scrip:delete");

    // 9. Outsider gets 403
    mockState.user = outsider;
    const outsiderRes = await getIncentivesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/incentives`),
      { params: Promise.resolve({ orgId: orgId }) }
    );
    expect(outsiderRes.status).toBe(403);
  }, 30_000);
});
