import fs from "node:fs";
import ExcelJS from "exceljs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EBRC_HEADERS, EBRC_SAMPLE_TEMPLATE_PATH, EBRC_SHEET_NAME } from "@/config/ebrc";
import { ForbiddenError, PlanLimitError } from "@/lib/auth/errors";
import { buildBulkEbrcWorkbook } from "@/lib/ebrc/generator";
import { parseBulkEbrcWorkbook } from "@/lib/ebrc/validator";

const mockAuthState = {
  user: null as { id: string; email: string; isPlatformAdmin?: boolean } | null,
};

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
import {
  generateBulkEbrcExportForOrg,
  getEbrcWorkspaceData,
  validateOrFixOrgEbrcRows,
} from "@/lib/ebrc/repository";

describe("DGFT Bulk eBRC Generator (Round-trip + Plan Gate + Org/IEC RLS)", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
  });

  beforeEach(async () => {
    await resetPgliteDb();
  });

  it("round-trip test: generated workbook matches sample template cell-by-cell structure, sheet name, and headers", async () => {
    const sampleBytes = fs.readFileSync(EBRC_SAMPLE_TEMPLATE_PATH);
    const parsedSample = await parseBulkEbrcWorkbook(sampleBytes);

    expect(parsedSample.headerErrors).toEqual([]);
    expect(parsedSample.sheetName).toBe(EBRC_SHEET_NAME);
    expect(parsedSample.headers).toEqual([...EBRC_HEADERS]);
    expect(parsedSample.rows.length).toBeGreaterThanOrEqual(2);

    const built = await buildBulkEbrcWorkbook(parsedSample.rows);
    expect(built.rowCount).toBe(parsedSample.rows.length);

    // Re-read generated workbook and compare cell-by-cell with sample
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.load(
      sampleBytes as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]
    );
    const genWb = new ExcelJS.Workbook();
    await genWb.xlsx.load(
      built.buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]
    );

    const sampleWs = sampleWb.getWorksheet(EBRC_SHEET_NAME)!;
    const genWs = genWb.getWorksheet(EBRC_SHEET_NAME)!;
    expect(genWs).toBeDefined();
    expect(genWs.name).toBe(sampleWs.name);
    expect(genWs.rowCount).toBe(sampleWs.rowCount);

    for (let r = 1; r <= sampleWs.rowCount; r += 1) {
      for (let c = 1; c <= EBRC_HEADERS.length; c += 1) {
        const expectedVal = sampleWs.getRow(r).getCell(c).value;
        const actualVal = genWs.getRow(r).getCell(c).value;
        expect(actualVal).toBe(expectedVal);
      }
    }
  });

  it("gates Excel generation on Free plan, enforces strict org/IEC RLS isolation, and logs audit_log on Exporter plan", async () => {
    const userA = await ensurePgliteUser("ebrc-owner-a@example.invalid");
    const userB = await ensurePgliteUser("ebrc-owner-b@example.invalid");
    const db = await getPgliteDb();

    // Seed Org A (Free plan) and Org B (Exporter plan) with distinct IECs, SBs, IRMs, confirmed matches
    const orgAId = "10000000-0000-4000-8000-000000000010";
    const orgBId = "20000000-0000-4000-8000-000000000020";
    const iecAId = "10000000-0000-4000-8000-000000000011";
    const iecA2Id = "10000000-0000-4000-8000-000000000012";
    const iecBId = "20000000-0000-4000-8000-000000000021";

    await db.exec(`
      insert into public.organizations (id, name, type, plan_key, plan_status) values
        ('${orgAId}', 'Org A Garments', 'consultant', 'free', 'active'),
        ('${orgBId}', 'Org B Textiles', 'exporter', 'exporter_monthly', 'active');

      insert into public.memberships (user_id, org_id, role) values
        ('${userA.id}', '${orgAId}', 'owner'),
        ('${userB.id}', '${orgBId}', 'owner');

      insert into public.iec_profiles (id, org_id, iec_code, legal_name, is_demo) values
        ('${iecAId}', '${orgAId}', 'AAACA1111A', 'Org A Primary IEC', false),
        ('${iecA2Id}', '${orgAId}', 'AAACA2222B', 'Org A Secondary IEC', false),
        ('${iecBId}', '${orgBId}', 'AAACB9999Z', 'Org B Secret IEC', false);

      insert into public.shipping_bills (id, iec_id, sb_number, sb_date, port_code, buyer_name, currency, fob_minor, status) values
        ('10000000-0000-4000-8000-000000000101', '${iecAId}', 'SB-A1', '2026-10-02', 'INTUT6', 'Buyer A1', 'USD', 1850000, 'ebrc_ready'),
        ('10000000-0000-4000-8000-000000000102', '${iecA2Id}', 'SB-A2', '2026-10-03', 'INNSA1', 'Buyer A2', 'USD', 900000, 'ebrc_ready'),
        ('20000000-0000-4000-8000-000000000201', '${iecBId}', 'SB-B1-LEAK', '2026-10-04', 'INBOM4', 'Secret Buyer B', 'EUR', 3100000, 'ebrc_ready');

      insert into public.remittances (id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor, utilised_minor, raw) values
        ('10000000-0000-4000-8000-000000000301', '${iecAId}', 'IRM-A-001', 'HDFC Bank', '2026-10-15', 'USD', 1850000, 1850000, '{"ifscCode":"HDFC0000240","adCode":"0510002","purposeCode":"P0102"}'::jsonb),
        ('10000000-0000-4000-8000-000000000302', '${iecA2Id}', 'IRM-A2-001', 'SBI Bank', '2026-10-18', 'USD', 900000, 900000, '{"ifscCode":"SBIN0004321","adCode":"0000842","purposeCode":"P0102"}'::jsonb),
        ('20000000-0000-4000-8000-000000000401', '${iecBId}', 'IRM-B-SECRET', 'ICICI Bank', '2026-10-19', 'EUR', 3100000, 3100000, '{"ifscCode":"ICIC0000001","adCode":"0999999","purposeCode":"P0102"}'::jsonb);

      insert into public.sb_remittance_matches (id, shipping_bill_id, remittance_id, matched_minor, method, confidence, confirmed_by) values
        ('10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000301', 1850000, 'auto', 0.99, '${userA.id}'),
        ('10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000302', 900000, 'auto', 0.99, '${userA.id}'),
        ('20000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000401', 3100000, 'auto', 0.99, '${userB.id}');
    `);

    mockAuthState.user = { id: userA.id, email: userA.email };

    // 1. Free plan can preview & validate rows for IEC A1, and never sees Org B or IEC A2
    const previewA1 = await getEbrcWorkspaceData({ orgId: orgAId, iecId: iecAId });
    expect(previewA1.canGenerateEbrc).toBe(false);
    expect(previewA1.rows).toHaveLength(1);
    expect(previewA1.rows[0]?.shippingBillNumber).toBe("SB-A1");
    expect(previewA1.validation.valid).toBe(true);

    const validatedFree = await validateOrFixOrgEbrcRows({
      orgId: orgAId,
      iecId: iecAId,
      rows: previewA1.rows,
      applyAutoFix: false,
    });
    expect(validatedFree.validation.valid).toBe(true);

    // 2. Generating on Free plan must be blocked server-side with PlanLimitError (402)
    await expect(
      generateBulkEbrcExportForOrg({
        orgId: orgAId,
        iecId: iecAId,
        rows: previewA1.rows,
      })
    ).rejects.toBeInstanceOf(PlanLimitError);

    // 3. Upgrade Org A to consultant_monthly -> generate for IEC A1 succeeds and contains ONLY SB-A1
    await db.exec(
      `update public.organizations set plan_key = 'consultant_monthly' where id = '${orgAId}'`
    );

    const exported = await generateBulkEbrcExportForOrg({
      orgId: orgAId,
      iecId: iecAId,
      rows: previewA1.rows,
    });
    expect(exported.rowCount).toBe(1);

    const parsedExport = await parseBulkEbrcWorkbook(exported.buffer);
    expect(parsedExport.rows).toHaveLength(1);
    expect(parsedExport.rows[0]?.shippingBillNumber).toBe("SB-A1");
    expect(parsedExport.rows[0]?.irmNumber).toBe("IRM-A-001");
    // Must never contain Org B or another IEC's rows
    expect(parsedExport.rows.some((r) => r.shippingBillNumber === "SB-B1-LEAK")).toBe(false);
    expect(parsedExport.rows.some((r) => r.shippingBillNumber === "SB-A2")).toBe(false);

    // Verify audit_log written
    const auditRes = await db.query<{ action: string; entity: string }>(
      `select action, entity from public.audit_log where org_id = $1 and action = 'generate_bulk_ebrc'`,
      [orgAId]
    );
    expect(auditRes.rows).toHaveLength(1);

    // 4. Attempting to inject Org B's match or another IEC's match inside Org A's IEC A1 export is blocked
    const previewB = await (async () => {
      mockAuthState.user = { id: userB.id, email: userB.email };
      return getEbrcWorkspaceData({ orgId: orgBId, iecId: iecBId });
    })();

    mockAuthState.user = { id: userA.id, email: userA.email };
    await expect(
      generateBulkEbrcExportForOrg({
        orgId: orgAId,
        iecId: iecAId,
        rows: previewB.rows,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
