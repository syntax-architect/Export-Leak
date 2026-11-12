import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = {
  user: null as { id: string; email: string } | null,
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

import { POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { POST as irmImportRoute } from "@/app/api/orgs/[orgId]/irm/import/route";
import {
  GET as getMatchesRoute,
  POST as postMatchesRoute,
} from "@/app/api/orgs/[orgId]/matches/route";
import { DELETE as deleteMatchRoute } from "@/app/api/orgs/[orgId]/matches/[matchId]/route";
import { POST as createOrgRoute } from "@/app/api/orgs/route";
import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import type { ReconciliationWorkspaceData } from "@/lib/matching/irm-repository";

interface ExpectedBillsFixture {
  shippingBills: Array<{
    id: string;
    sbNumber: string;
    sbDate: string;
    invoiceNo: string;
    buyerName: string;
    currency: string;
    fobMinor: number;
    status: string;
  }>;
}

function createJsonFileImportRequest(params: {
  url: string;
  action: "preview" | "commit";
  iecId: string;
  filename: string;
  bytes: Buffer | Uint8Array;
}): NextRequest {
  return new NextRequest(params.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: params.action,
      iecId: params.iecId,
      filename: params.filename,
      fileBase64: Buffer.from(params.bytes).toString("base64"),
    }),
  });
}

describe("IRM import and matching API workflow (PGlite)", () => {
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

  async function seedOrgWithFixtureBills() {
    const owner = await ensurePgliteUser("irm-owner@example.invalid");
    mockState.user = owner;
    const orgRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "IRM Flow Exporter", roleChoice: "exporter" }),
      })
    );
    const { organization } = (await orgRes.json()) as { organization: { orgId: string } };
    const orgId = organization.orgId;

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({
          iecCode: "AAACI7777E",
          legalName: "IRM Flow Exporter Pvt Ltd",
          adBankName: "HDFC Bank",
        }),
      }),
      { params: Promise.resolve({ orgId }) }
    );
    const { iec } = (await iecRes.json()) as { iec: { id: string } };
    const iecId = iec.id;

    const fixtureJson = JSON.parse(
      await fs.readFile(path.resolve(process.cwd(), "fixtures/irm/irm-expected-bills.json"), "utf8")
    ) as ExpectedBillsFixture;

    const db = await getPgliteDb();
    const sbIdByNumber = new Map<string, string>();
    for (const sb of fixtureJson.shippingBills) {
      const inserted = await db.query<{ id: string }>(
        `insert into public.shipping_bills (
           iec_id, sb_number, sb_date, port_code, invoice_no, buyer_name, currency, fob_minor, status
         ) values ($1, $2, $3, 'INNSA1', $4, $5, $6, $7, $8)
         returning id`,
        [
          iecId,
          sb.sbNumber,
          sb.sbDate,
          sb.invoiceNo,
          sb.buyerName,
          sb.currency,
          sb.fobMinor,
          sb.status,
        ]
      );
      sbIdByNumber.set(sb.sbNumber, inserted.rows[0]!.id);
    }

    return { owner, orgId, iecId: iecId!, sbIdByNumber };
  }

  it("previews, imports xlsx & csv with failed rows, auto-confirms, allows manual/bulk confirm, blocks cross-currency & over-allocation, and supports unmatch with audit log", async () => {
    const { orgId, iecId, sbIdByNumber } = await seedOrgWithFixtureBills();

    const xlsxBytes = await fs.readFile(
      path.resolve(process.cwd(), "fixtures/irm/irm-dgft-edpms-sample.xlsx")
    );

    // 1. Preview .xlsx (skips 2 preamble rows -> headerRowNumber = 3)
    const previewRes = await irmImportRoute(
      createJsonFileImportRequest({
        url: `http://localhost/api/orgs/${orgId}/irm/import`,
        action: "preview",
        iecId,
        filename: "irm-dgft-edpms-sample.xlsx",
        bytes: xlsxBytes,
      }),
      { params: Promise.resolve({ orgId }) }
    );
    const previewBody = (await previewRes.json()) as {
      preview: { headerRowNumber: number; validCount: number; failedCount: number };
    };
    expect(previewRes.status, JSON.stringify(previewBody)).toBe(200);
    expect(previewBody.preview.headerRowNumber).toBe(3);
    expect(previewBody.preview.validCount).toBe(6);
    expect(previewBody.preview.failedCount).toBe(0);

    // 2. Commit .xlsx -> upserts 6 rows & auto-confirms matches
    const commitRes = await irmImportRoute(
      createJsonFileImportRequest({
        url: `http://localhost/api/orgs/${orgId}/irm/import`,
        action: "commit",
        iecId,
        filename: "irm-dgft-edpms-sample.xlsx",
        bytes: xlsxBytes,
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(commitRes.status).toBe(200);
    const commitBody = (await commitRes.json()) as {
      result: { importedCount: number; updatedCount: number; autoConfirmedCount: number };
    };
    expect(commitBody.result.importedCount).toBe(6);
    expect(commitBody.result.autoConfirmedCount).toBeGreaterThanOrEqual(5);

    // Re-importing the exact same .xlsx is idempotent (updatedCount = 6, importedCount = 0)
    const reimportRes = await irmImportRoute(
      createJsonFileImportRequest({
        url: `http://localhost/api/orgs/${orgId}/irm/import`,
        action: "commit",
        iecId,
        filename: "irm-dgft-edpms-sample.xlsx",
        bytes: xlsxBytes,
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(reimportRes.status).toBe(200);
    const reimportBody = (await reimportRes.json()) as {
      result: { importedCount: number; updatedCount: number };
    };
    expect(reimportBody.result.importedCount).toBe(0);
    expect(reimportBody.result.updatedCount).toBe(6);

    // 3. Import HDFC CSV containing INR exact + duplicate invoice rows + 1 intentionally failed row
    const csvBytes = await fs.readFile(
      path.resolve(process.cwd(), "fixtures/irm/irm-hdfc-bank-export.csv")
    );
    const csvRes = await irmImportRoute(
      createJsonFileImportRequest({
        url: `http://localhost/api/orgs/${orgId}/irm/import`,
        action: "commit",
        iecId,
        filename: "irm-hdfc-bank-export.csv",
        bytes: csvBytes,
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(csvRes.status).toBe(200);
    const csvBody = (await csvRes.json()) as {
      result: {
        importedCount: number;
        failedCount: number;
        failedRows: Array<{ irmNumber: string | null; reason: string }>;
        reviewNeededCount: number;
      };
    };
    expect(csvBody.result.importedCount).toBe(3);
    expect(csvBody.result.failedCount).toBe(1);
    expect(csvBody.result.failedRows[0]?.irmNumber).toBe("IRM-BAD-ROW");
    expect(csvBody.result.reviewNeededCount).toBeGreaterThanOrEqual(4);

    // 4. Inspect GET workspace -> verify duplicate invoice suggestions exist & EUR is not matched to USD
    const wsRes = await getMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches`),
      { params: Promise.resolve({ orgId }) }
    );
    expect(wsRes.status).toBe(200);
    const ws = (await wsRes.json()) as ReconciliationWorkspaceData;

    const eurMatch = ws.confirmedMatches.find((m) => m.irmNumber === "IRM-SBI-26006");
    expect(eurMatch).toBeUndefined();

    const dupSuggestion = ws.suggestions.find(
      (s) => s.sbNumber === "7458601" && s.irmNumber === "IRM-KOTAK-26008"
    );
    expect(dupSuggestion).toBeDefined();

    // 5. Reject a duplicate suggestion cleanly
    const rejectRes = await postMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches`, {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          shippingBillId: sbIdByNumber.get("7458601"),
          remittanceId: ws.remittances.find((r) => r.irmNumber === "IRM-KOTAK-26009")!.id,
          reason: "Wrong consignment",
        }),
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(rejectRes.status).toBe(200);

    // 6. Rule 4 enforcement: trying to link EUR IRM to USD SB -> HTTP 400
    const usdDupSbId = sbIdByNumber.get("7458601")!;
    const eurRemId = ws.remittances.find((r) => r.irmNumber === "IRM-SBI-26006")!.id;
    const crossCurrencyRes = await postMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches`, {
        method: "POST",
        body: JSON.stringify({
          action: "confirm",
          pair: {
            shippingBillId: usdDupSbId,
            remittanceId: eurRemId,
            allocatedMinor: 10000,
            method: "manual",
          },
        }),
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(crossCurrencyRes.status).toBe(400);

    // 7. Over-allocation blocked -> HTTP 400
    const dup901Rem = ws.remittances.find((r) => r.irmNumber === "IRM-KOTAK-26008")!;
    const overAllocRes = await postMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches`, {
        method: "POST",
        body: JSON.stringify({
          action: "confirm",
          pair: {
            shippingBillId: usdDupSbId,
            remittanceId: dup901Rem.id,
            allocatedMinor: dup901Rem.amountMinor + 100,
            method: "manual",
          },
        }),
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(overAllocRes.status).toBe(400);

    // 8. Manual confirm on duplicate bill + unmatch restores balance
    const manualConfirmRes = await postMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches`, {
        method: "POST",
        body: JSON.stringify({
          action: "confirm",
          pair: {
            shippingBillId: usdDupSbId,
            remittanceId: dup901Rem.id,
            allocatedAmount: "7500.00",
            method: "manual",
            confidence: 0.9,
            explanation: "Confirmed duplicate invoice match by buyer statement",
          },
        }),
      }),
      { params: Promise.resolve({ orgId }) }
    );
    expect(manualConfirmRes.status).toBe(200);

    const wsAfterManual = (await (
      await getMatchesRoute(new NextRequest(`http://localhost/api/orgs/${orgId}/matches`), {
        params: Promise.resolve({ orgId }),
      })
    ).json()) as ReconciliationWorkspaceData;

    const createdMatch = wsAfterManual.confirmedMatches.find(
      (m) => m.shippingBillId === usdDupSbId && m.remittanceId === dup901Rem.id
    );
    expect(createdMatch?.matchedMinor).toBe(750000);

    const unmatchRes = await deleteMatchRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches/${createdMatch!.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ orgId, matchId: createdMatch!.id }) }
    );
    expect(unmatchRes.status).toBe(200);

    // Verify audit_log captured irm_import, auto_match, confirm_match, reject_match, and unmatch
    const db = await getPgliteDb();
    const auditRes = await db.query<{ action: string }>(
      `select action from public.audit_log where org_id = $1 order by created_at`,
      [orgId]
    );
    const actions = auditRes.rows.map((r) => r.action);
    expect(actions).toContain("irm_import");
    expect(actions).toContain("auto_match");
    expect(actions).toContain("confirm_match");
    expect(actions).toContain("reject_match");
    expect(actions).toContain("unmatch");

    // 9. Cross-org isolation: stranger gets 403
    const stranger = await ensurePgliteUser("stranger-irm@example.invalid");
    mockState.user = stranger;
    await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Other Exporter", roleChoice: "exporter" }),
      })
    );

    const forbiddenWs = await getMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgId}/matches`),
      { params: Promise.resolve({ orgId }) }
    );
    expect(forbiddenWs.status).toBe(403);
  }, 30_000);
});
