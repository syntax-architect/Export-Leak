import { describe, expect, it, beforeEach } from "vitest";
import { calculatePublicIncentive } from "@/lib/incentives/public-lookup";
import { checkRateLimit } from "@/lib/rate-limit/memory-rate-limiter";
import { buildBulkEbrcWorkbook } from "@/lib/ebrc/generator";
import {
  parseBulkEbrcWorkbook,
  validateBulkEbrcRows,
  autoFixBulkEbrcRows,
} from "@/lib/ebrc/validator";
import { getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";

describe("Prompt 17: Public Free Tools, In-Memory Guarantee, and Rate Limiting", () => {
  beforeEach(async () => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
    await resetPgliteDb();
  });

  it("calculates RoDTEP and Drawback using rate tables with formula explanation and cap rules", async () => {
    // Test HS Code 61091000 (Cotton T-shirts): RoDTEP 2.5% cap ₹35/PCS, Drawback 2.1% cap ₹28/PCS
    const res = await calculatePublicIncentive({
      hsCode: "61091000",
      fobMinor: 100_000_00, // ₹1,00,000.00
      quantity: 1000,
      uqc: "PCS",
      scheme: "all",
      shippingDate: "2026-10-15",
    });

    expect(res.hsCode).toBe("61091000");
    expect(res.results.length).toBeGreaterThanOrEqual(1);

    const rodtep = res.results.find((r) => r.scheme === "rodtep");
    expect(rodtep).toBeDefined();
    expect(rodtep?.ratePercent).toBe(2.5);

    // 2.5% of ₹1,00,000 = ₹2,500.00
    // Cap: ₹35 * 1000 = ₹35,000.00
    // min(2500, 35000) = ₹2,500.00 (Rate % FOB applied)
    expect(rodtep?.expectedMinor).toBe(250_000); // ₹2,500.00 in paise
    expect(rodtep?.appliedLimb).toBe("rate_fob");
    expect(rodtep?.formulaExplanation).toContain("2.5% of FOB value");

    // Test case where cap hits: FOB ₹10,00,000, Quantity 50 PCS
    // 2.5% of ₹10,00,000 = ₹25,000.00
    // Cap: ₹35 * 50 = ₹1,750.00 -> Cap applies!
    const cappedRes = await calculatePublicIncentive({
      hsCode: "61091000",
      fobMinor: 1000_000_00, // ₹10,00,000.00
      quantity: 50,
      uqc: "PCS",
      scheme: "rodtep",
      shippingDate: "2026-10-15",
    });

    const cappedRodtep = cappedRes.results.find((r) => r.scheme === "rodtep");
    expect(cappedRodtep).toBeDefined();
    expect(cappedRodtep?.appliedLimb).toBe("cap_unit");
    expect(cappedRodtep?.expectedMinor).toBe(175_000); // ₹1,750.00 in paise
    expect(cappedRodtep?.formulaExplanation).toContain("Cap of ₹35.00 per PCS applied");
  });

  it("validates bulk eBRC rows in memory and never persists uploaded files to storage", async () => {
    const db = await getPgliteDb();

    // Generate sample valid eBRC rows
    const testRows = [
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
        portCode: "INTUT6",
        shippingBillNumber: "948201",
        shippingBillDate: "10/10/2026",
      },
    ];

    const wb = await buildBulkEbrcWorkbook(testRows);
    expect(wb.buffer.length).toBeGreaterThan(0);

    // In-memory parse and validation
    const parsed = await parseBulkEbrcWorkbook(wb.buffer);
    expect(parsed.rows.length).toBe(1);

    const validation = validateBulkEbrcRows(parsed.rows);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);

    // CRITICAL ACCEPTANCE CHECK: Verify zero rows written to documents table
    const docRes = await db.query<{ count: string }>(
      "select count(*) as count from public.documents"
    );
    expect(Number(docRes.rows[0]?.count ?? 0)).toBe(0);
  });

  it("enforces sliding-window rate limiting with user-friendly retry message", () => {
    const testIp = "203.0.113.42";
    const action = "test_ebrc_limit";
    const maxAllowed = 3;

    // Requests 1, 2, 3 should be allowed
    const r1 = checkRateLimit(testIp, action, maxAllowed, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(testIp, action, maxAllowed, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(testIp, action, maxAllowed, 60);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request must be blocked with friendly message
    const r4 = checkRateLimit(testIp, action, maxAllowed, 60);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.friendlyMessage).toContain("You have reached the free usage limit");
    expect(r4.friendlyMessage).toContain("create a free account");
  });

  it("supports auto-fixing safe formatting errors in bulk eBRC rows", () => {
    // Provide rows with whitespace, lowercase currency, and dash dates (safe auto-fixes)
    const dirtyRows = [
      {
        serialNumber: " 1 ",
        iecBranchSlNo: " 0 ",
        ifscCode: " hdfc0000123 ",
        adCode: " 0510001 ",
        irmNumber: " IRM9021 ",
        irmDate: "2026-10-15", // ISO dash format
        irmCurrency: "usd", // lowercase
        purposeCode: " p0102 ",
        amountInFcc: " 2500.50 ",
        portCode: " intut6 ",
        shippingBillNumber: " 839201 ",
        shippingBillDate: "2026-10-10",
      },
    ];

    const fixResult = autoFixBulkEbrcRows(dirtyRows);
    expect(fixResult.fixesApplied).toBeGreaterThan(0);

    const fixed = fixResult.rows[0];
    expect(fixed).toBeDefined();
    expect(fixed?.ifscCode).toBe("HDFC0000123");
    expect(fixed?.irmCurrency).toBe("USD");
    expect(fixed?.portCode).toBe("INTUT6");
    expect(fixed?.irmDate).toBe("15/10/2026");
    expect(fixed?.shippingBillDate).toBe("10/10/2026");
  });

  it("creates and retrieves a read-only shared report summary for CA audit review", async () => {
    const db = await getPgliteDb();

    // 1. Create org
    const orgRes = await db.query<{ id: string }>(
      `insert into public.organizations (name, type, plan_key, plan_status)
       values ('CA Share Test Exporter', 'exporter', 'free', 'active')
       returning id`
    );
    const orgId = orgRes.rows[0]?.id;
    expect(orgId).toBeDefined();

    // 2. Insert shared report
    const token = "test_ca_share_token_abcdef123456";
    const totals = {
      totalShipments: 14,
      totalFobMinor: 25_000_000_00, // ₹2.5 Cr
      totalExpectedMinor: 500_000_00, // ₹5 Lakh
      totalCreditedMinor: 412_000_00,
      totalUnclaimedMinor: 88_000_00, // ₹88,000 unclaimed
      overdueCount: 2,
      expiringScripsCount: 1,
    };

    await db.query(
      `insert into public.shared_reports (org_id, token, title, totals, expires_at)
       values ($1, $2, 'October 2026 Reconciliation Audit', $3, now() + interval '30 days')`,
      [orgId!, token, JSON.stringify(totals)]
    );

    // 3. Query as public user by token
    const fetchRes = await db.query<{
      title: string;
      totals: typeof totals;
      expires_at: string;
    }>(
      `select title, totals, expires_at::text
       from public.shared_reports
       where token = $1 and revoked_at is null and expires_at > now()`,
      [token]
    );

    expect(fetchRes.rows.length).toBe(1);
    const fetched = fetchRes.rows[0];
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("October 2026 Reconciliation Audit");
    expect(fetched?.totals.totalShipments).toBe(14);
    expect(fetched?.totals.totalUnclaimedMinor).toBe(88_000_00);

    // 4. Revocation test
    await db.query(`update public.shared_reports set revoked_at = now() where token = $1`, [token]);

    const revokedRes = await db.query(
      `select id from public.shared_reports
       where token = $1 and revoked_at is null and expires_at > now()`,
      [token]
    );
    expect(revokedRes.rows.length).toBe(0); // Inaccessible once revoked
  });
});
