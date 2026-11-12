// @vitest-environment node
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = {
  user: null as { id: string; email: string; isPlatformAdmin?: boolean } | null,
};

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
    ) => {
      return actual.assertOrgMembershipAccess({
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
      });
    },
  };
});

import { asPgliteUser, ensurePgliteUser, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { buildLeakageReportPdf, buildLeakageReportWorkbook } from "@/lib/dashboard/export-report";
import {
  computeLeakageDashboard,
  createSavedViewForOrg,
  deleteSavedViewForOrg,
  getLeakageDashboardData,
  getShipmentDetailForOrg,
  updateAlertForOrg,
  upsertComplianceRule,
  type RawAlertRecord,
  type RawCreditRecord,
  type RawExpectationRecord,
  type RawIecRecord,
  type RawMatchRecord,
  type RawRemittanceRecord,
  type RawSbRecord,
  type RawScripRecord,
} from "@/lib/dashboard/repository";
import type { ComplianceRuleInput } from "@/lib/deadlines/engine";

describe("Prompt 9: Leakage dashboard math, dynamic compliance_rules, alerts, saved views & exports", () => {
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

  it("independent sum verification: dashboard KPI totals match exact raw missing + short + not_claimed, at-risk, matched, and expiring scrips", async () => {
    const iecs: RawIecRecord[] = [
      { id: "iec-1", iec_code: "AAACA1111A", legal_name: "Alpha Garments", is_demo: false },
      { id: "iec-2", iec_code: "=SUM(1,2)", legal_name: "Beta Leather", is_demo: false },
    ];

    const shippingBills: RawSbRecord[] = [
      // SB1: missing credit (claimed rodtep 25000, cred 0), due 2026-12-01 (19d left -> at risk < 60d!)
      {
        id: "sb-1",
        iec_id: "iec-1",
        sb_number: "SB-101",
        sb_date: "2026-03-01",
        leo_date: "2026-03-02",
        port_code: "INMAA4",
        invoice_no: "INV-101",
        buyer_name: "Nordic Buyer",
        currency: "USD",
        fob_minor: 1000000,
        exchange_rate: 84,
        schemes_claimed: ["rodtep"],
        status: "pending",
        realisation_due_date: "2026-12-01",
      },
      // SB2: short credit (exp 40000, cred 15000 -> short 25000) + not_claimed (drawback exp 12000, not in claimed), overdue (-5d -> at risk!)
      {
        id: "sb-2",
        iec_id: "iec-1",
        sb_number: "SB-102",
        sb_date: "2026-02-07",
        leo_date: null,
        port_code: "INTUT6",
        invoice_no: "INV-102",
        buyer_name: "=cmd|'/C calc'!A0",
        currency: "EUR",
        fob_minor: 2000000,
        exchange_rate: 91,
        schemes_claimed: ["rodtep"],
        status: "needs_review",
        realisation_due_date: "2026-11-07",
      },
      // SB3: matched & closed (exp 30000, cred 30000 -> gap 0), due 2026-11-20 (not at risk because closed!)
      {
        id: "sb-3",
        iec_id: "iec-2",
        sb_number: "SB-201",
        sb_date: "2026-10-05",
        leo_date: "2026-10-06",
        port_code: "INNSA1",
        invoice_no: "INV-201",
        buyer_name: "Closed Buyer",
        currency: "USD",
        fob_minor: 1500000,
        exchange_rate: 84,
        schemes_claimed: ["rodtep"],
        status: "closed",
        realisation_due_date: "2027-07-05",
      },
    ];

    const expectations: RawExpectationRecord[] = [
      { shipping_bill_id: "sb-1", scheme: "rodtep", expected_minor: 25000 },
      { shipping_bill_id: "sb-2", scheme: "rodtep", expected_minor: 40000 },
      { shipping_bill_id: "sb-2", scheme: "drawback", expected_minor: 12000 },
      { shipping_bill_id: "sb-3", scheme: "rodtep", expected_minor: 30000 },
    ];

    const credits: RawCreditRecord[] = [
      {
        shipping_bill_id: "sb-2",
        scheme: "rodtep",
        credited_minor: 15000,
        credited_on: "2026-09-01",
      },
      {
        shipping_bill_id: "sb-3",
        scheme: "rodtep",
        credited_minor: 30000,
        credited_on: "2026-11-01",
      },
    ];

    const matches: RawMatchRecord[] = [
      { shipping_bill_id: "sb-3", matched_minor: 1500000, created_at: "2026-11-02T00:00:00Z" },
    ];

    const scrips: RawScripRecord[] = [
      {
        id: "scr-1",
        iec_id: "iec-1",
        scrip_number: "SCR-EXP-30",
        scheme: "rodtep",
        face_minor: 55000,
        generated_on: "2025-12-01",
        expires_on: "2026-12-12", // 30 days from todayIso 2026-11-12
        status: "active",
      },
      {
        id: "scr-2",
        iec_id: "iec-2",
        scrip_number: "SCR-OK-180",
        scheme: "rodtep",
        face_minor: 99000,
        generated_on: "2026-06-01",
        expires_on: "2027-05-12", // > 90 days -> excluded
        status: "active",
      },
      {
        id: "scr-3",
        iec_id: "iec-1",
        scrip_number: "SCR-UTILISED",
        scheme: "rodtep",
        face_minor: 22000,
        generated_on: "2025-12-01",
        expires_on: "2026-12-01",
        status: "utilised", // not active -> excluded
      },
    ];

    const remittances: RawRemittanceRecord[] = [
      {
        id: "rem-1",
        iec_id: "iec-1",
        irm_number: "IRM-OPEN-1",
        bank_name: "HDFC Bank",
        remittance_date: "2026-11-05",
        currency: "USD",
        amount_minor: 500000,
        utilised_minor: 100000,
        remitter_name: "Nordic Buyer",
      },
    ];

    const alerts: RawAlertRecord[] = [
      {
        id: "alt-1",
        iec_id: "iec-1",
        kind: "realisation_deadline",
        severity: "critical",
        shipping_bill_id: "sb-2",
        due_on: "2026-11-07",
        created_at: "2026-11-01T00:00:00Z",
      },
    ];

    const rules: ComplianceRuleInput[] = [
      {
        id: "rule-oct",
        key: "realisation_months",
        value: { months: 9, confirmed: true },
        effective_from: "2026-10-01",
        effective_to: null,
      },
    ];

    const result = computeLeakageDashboard({
      org: {
        id: "org-1",
        name: "ExportLeak Consultant Firm",
        type: "consultant",
        plan_key: "pro",
        trial_ends_at: null,
      },
      iecs,
      activeIecId: null,
      shippingBills,
      expectations,
      credits,
      matches,
      remittances,
      scrips,
      alerts,
      complianceRules: rules,
      savedViews: [],
      todayIso: "2026-11-12",
      nowIso: "2026-11-12T10:00:00Z",
    });

    // Independent manual math check:
    const expectedMissing = 25000;
    const expectedShort = 40000 - 15000;
    const expectedNotClaimed = 12000;
    const expectedUnclaimed = expectedMissing + expectedShort + expectedNotClaimed;

    expect(result.summary.missingIncentivePaise).toBe(expectedMissing);
    expect(result.summary.shortIncentivePaise).toBe(expectedShort);
    expect(result.summary.notClaimedIncentivePaise).toBe(expectedNotClaimed);
    expect(result.summary.unclaimedIncentivePaise).toBe(expectedUnclaimed);
    expect(result.summary.atRiskCount).toBe(2); // sb-1 (19d) + sb-2 (-5d)
    expect(result.summary.atRiskFobMinor).toBe(1000000 + 2000000);
    expect(result.summary.matchedAndClosedCount).toBe(1); // sb-3
    expect(result.summary.scripsExpiring90Count).toBe(1); // scr-1
    expect(result.summary.scripsExpiring90Paise).toBe(55000);

    // No NaN / -0
    for (const val of Object.values(result.summary)) {
      if (typeof val === "number") {
        expect(Number.isFinite(val)).toBe(true);
        expect(Object.is(val, -0)).toBe(false);
      }
    }

    // Consultant Home aggregate check across both IECs
    const alphaClient = result.consultantClients.find((c) => c.iecId === "iec-1");
    expect(alphaClient?.unclaimedIncentivePaise).toBe(expectedUnclaimed);
    expect(alphaClient?.atRiskCount).toBe(2);
    expect(alphaClient?.nextDeadlineDate).toBe("2026-11-07");

    // PDF verification (clean parse + footer + content)
    const pdfBytes = await buildLeakageReportPdf(result);
    const parsedPdf = await PDFDocument.load(pdfBytes);
    expect(parsedPdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(parsedPdf.getTitle()).toContain("ExportLeak");
    expect(parsedPdf.getSubject()).toBe("Prepared with ExportLeak");

    // Excel workbook verification (exact 6 sheets + sanitized formula injection)
    const xlsxBytes = await buildLeakageReportWorkbook(result);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(xlsxBytes) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Summary",
      "Missing Incentives",
      "Short Credits",
      "At-Risk Deadlines",
      "Expiring Scrips",
      "Unmatched Payments",
    ]);
    expect(wb.getWorksheet("Missing Incentives")!.rowCount).toBe(2); // header + SB-101
    expect(wb.getWorksheet("Short Credits")!.rowCount).toBe(2); // header + SB-102
    expect(wb.getWorksheet("At-Risk Deadlines")!.rowCount).toBe(3); // header + SB-101 + SB-102
    expect(wb.getWorksheet("Expiring Scrips")!.rowCount).toBe(2); // header + SCR-EXP-30
    expect(wb.getWorksheet("Unmatched Payments")!.rowCount).toBe(2); // header + IRM-OPEN-1

    // Buyer with leading '=' in Short Credits must be formula-sanitized with "'"
    const buyerCell = wb.getWorksheet("Short Credits")!.getRow(2).getCell(4).value;
    expect(String(buyerCell)).toBe("'=cmd|'/C calc'!A0");
  });

  it("updates dashboard deadlines when compliance_rules changes, snoozes/resolves alerts with audit_log, saves views, and builds 5-step SB timeline", async () => {
    const owner = await ensurePgliteUser("dash-owner@example.invalid");
    const admin = {
      ...(await ensurePgliteUser("dash-admin@example.invalid")),
      isPlatformAdmin: true,
    };
    mockState.user = owner;

    const orgId = crypto.randomUUID();
    const iecId = crypto.randomUUID();
    const sbId = crypto.randomUUID();
    const alertId = crypto.randomUUID();

    await asPgliteUser(owner.id, async (tx) => {
      await tx.query(
        `insert into public.organizations (id, name, type) values ($1, 'Kaveri Exports', 'exporter')`,
        [orgId]
      );
      await tx.query(
        `insert into public.memberships (org_id, user_id, role)
         values ($1, $2, 'owner')
         on conflict (user_id, org_id) do nothing`,
        [orgId, owner.id]
      );
      await tx.query(
        `insert into public.iec_profiles (id, org_id, iec_code, legal_name)
         values ($1, $2, 'AAACK1234K', 'Kaveri Exports Pvt Ltd')`,
        [iecId, orgId]
      );
      await tx.query(
        `insert into public.shipping_bills
           (id, iec_id, sb_number, sb_date, leo_date, port_code, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, realisation_due_date)
         values
           ($1, $2, '8899001', '2026-10-15', null, 'INTUT6', 'Munich Cotton GmbH', 'USD', 2000000, 84.0, array['rodtep'], 'pending', '2027-07-15')`,
        [sbId, iecId]
      );
      await tx.query(
        `insert into public.alerts (id, iec_id, kind, severity, shipping_bill_id, due_on)
         values ($1, $2, 'realisation_deadline', 'warning', $3, '2027-07-15')`,
        [alertId, iecId, sbId]
      );
    });

    // Admin (non-org-member) configures 9-month rule effective 2026-10-01 -> computes 2027-07-15
    mockState.user = admin;
    const initialRule = await upsertComplianceRule({
      key: "realisation_months",
      months: 9,
      confirmed: true,
      effectiveFrom: "2026-10-01",
      note: "Initial test period",
      orgId,
    });

    mockState.user = owner;
    const beforeChange = await getLeakageDashboardData(orgId, iecId, "2026-11-12");
    expect(beforeChange.shipments[0]?.realisationDueDate).toBe("2027-07-15");
    expect(beforeChange.shipments[0]?.monthsApplied).toBe(9);

    // Admin (also org owner) updates compliance_rules to 12 months effective 2026-10-01 -> audit_log recorded
    mockState.user = { ...owner, isPlatformAdmin: true };
    await upsertComplianceRule({
      id: initialRule.id,
      key: "realisation_months",
      months: 12,
      confirmed: true,
      effectiveFrom: "2026-10-01",
      note: "Updated FEMA test period",
      orgId,
    });

    mockState.user = owner;
    const afterChange = await getLeakageDashboardData(orgId, iecId, "2026-11-12");
    expect(afterChange.shipments[0]?.realisationDueDate).toBe("2027-10-15");
    expect(afterChange.shipments[0]?.monthsApplied).toBe(12);

    // Saved view CRUD + audit log
    const createdView = await createSavedViewForOrg(orgId, {
      name: "Critical USD",
      filters: { preset: "at_risk", deadlineBucket: "critical" },
      sortBy: "days_left",
      sortDir: "asc",
    });
    expect(createdView.name).toBe("Critical USD");

    const loadedWithView = await getLeakageDashboardData(orgId, iecId, "2026-11-12");
    expect(loadedWithView.savedViews).toHaveLength(1);

    await deleteSavedViewForOrg(orgId, createdView.id);

    // Alert snooze + resolve + audit log
    const snoozed = await updateAlertForOrg(orgId, alertId, { action: "snooze", snoozeDays: 7 });
    expect(snoozed.snoozedUntil).not.toBeNull();

    const resolved = await updateAlertForOrg(orgId, alertId, { action: "resolve" });
    expect(resolved.resolvedAt).not.toBeNull();

    // Shipment Detail Page timeline & "What to do next"
    const detail = await getShipmentDetailForOrg(orgId, sbId, "2026-11-12");
    expect(detail.timeline.map((s) => s.key)).toEqual([
      "filed",
      "cleared",
      "incentive_credited",
      "payment_received",
      "ebrc_ready",
    ]);
    expect(detail.timeline.find((s) => s.key === "cleared")?.status).toBe("attention");
    expect(detail.whatToDoNext.steps.length).toBeGreaterThan(0);

    // Verify audit log captured rule update, saved view, snooze & resolve
    const audits = await asPgliteUser(owner.id, async (tx) => {
      const res = await tx.query<{ action: string }>(
        `select action from public.audit_log where org_id = $1`,
        [orgId]
      );
      return res.rows.map((r) => r.action);
    });
    expect(audits).toContain("update_compliance_rule");
    expect(audits).toContain("save_dashboard_view");
    expect(audits).toContain("delete_dashboard_view");
    expect(audits).toContain("snooze_alert");
    expect(audits).toContain("resolve_alert");
  }, 20_000);
});
