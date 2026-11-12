import { describe, expect, it } from "vitest";
import { EBRC_MAX_FILE_BYTES, EBRC_MAX_ROWS } from "@/config/ebrc";
import {
  autoFixBulkEbrcRows,
  validateBulkEbrcRows,
  type BulkEbrcRowInput,
} from "@/lib/ebrc/validator";

function makeValidRow(overrides: Partial<BulkEbrcRowInput> = {}): BulkEbrcRowInput {
  return {
    serialNumber: 1,
    iecBranchSlNo: "0",
    ifscCode: "HDFC0000240",
    adCode: "0510002",
    irmNumber: "IRM20261015001",
    irmDate: "15/10/2026",
    irmCurrency: "USD",
    purposeCode: "P0102",
    amountMinor: 1850000,
    amountInFcc: "18500.00",
    portCode: "INTUT6",
    shippingBillNumber: "7458210",
    shippingBillDate: "02/10/2026",
    ...overrides,
  };
}

describe("DGFT Bulk eBRC Row Validator (Passing + Failing per rule)", () => {
  it("passes a completely valid single row and valid multi-row same-currency batch", () => {
    const rows = [
      makeValidRow({ serialNumber: 1 }),
      makeValidRow({
        serialNumber: 2,
        irmNumber: "IRM20261016002",
        irmDate: "16/10/2026",
        amountMinor: 500000,
        amountInFcc: "5000.00",
        shippingBillNumber: "7458211",
        portCode: "INNSA1",
      }),
    ];

    const summary = validateBulkEbrcRows(rows);
    expect(summary.valid).toBe(true);
    expect(summary.errorRowsCount).toBe(0);
    expect(summary.totalAmountByCurrency.USD).toBe(2350000);
  });

  it("enforces required fields and formats (IFSC, AD Code, Serial Number, Branch Sl No.)", () => {
    const bad = makeValidRow({
      serialNumber: 0,
      iecBranchSlNo: "X",
      ifscCode: "BADIFSC",
      adCode: "",
      irmNumber: "",
      shippingBillNumber: "",
    });
    const res = validateBulkEbrcRows([bad]);
    expect(res.valid).toBe(false);
    const codes = new Set(res.errors.map((e) => e.code));
    expect(codes.has("INVALID_SERIAL")).toBe(true);
    expect(codes.has("INVALID_BRANCH_SL")).toBe(true);
    expect(codes.has("INVALID_IFSC")).toBe(true);
    expect(codes.has("MISSING_AD_CODE")).toBe(true);
    expect(codes.has("INVALID_IRM_NUMBER")).toBe(true);
    expect(codes.has("INVALID_SB_NUMBER")).toBe(true);
  });

  it("enforces strict DD/MM/YYYY date format and calendar validity + auto-fix", () => {
    const badDate = makeValidRow({ irmDate: "2026-10-15", shippingBillDate: "02-10-2026" });
    const failed = validateBulkEbrcRows([badDate]);
    expect(failed.valid).toBe(false);
    expect(failed.errors.some((e) => e.code === "INVALID_IRM_DATE" && e.autoFixable)).toBe(true);
    expect(failed.errors.some((e) => e.code === "INVALID_SB_DATE" && e.autoFixable)).toBe(true);

    const fixed = autoFixBulkEbrcRows([badDate]);
    expect(fixed.fixesApplied).toBeGreaterThanOrEqual(2);
    expect(fixed.rows[0]?.irmDate).toBe("15/10/2026");
    expect(fixed.rows[0]?.shippingBillDate).toBe("02/10/2026");
    expect(validateBulkEbrcRows(fixed.rows).valid).toBe(true);

    // Non-existent calendar date (31 Feb) must fail without auto-fix
    const impossibleDate = validateBulkEbrcRows([makeValidRow({ irmDate: "31/02/2026" })]);
    expect(impossibleDate.valid).toBe(false);
    expect(impossibleDate.errors.some((e) => e.code === "INVALID_IRM_DATE")).toBe(true);
  });

  it("validates port codes against /fixtures/dgft-port-codes.json data file", () => {
    expect(validateBulkEbrcRows([makeValidRow({ portCode: "INBOM4" })]).valid).toBe(true);

    const badPort = validateBulkEbrcRows([makeValidRow({ portCode: "ZZFAKE" })]);
    expect(badPort.valid).toBe(false);
    expect(badPort.errors.some((e) => e.code === "INVALID_PORT_CODE")).toBe(true);
  });

  it("blocks restricted purpose codes P0101 / P0108 while allowing valid export codes", () => {
    expect(validateBulkEbrcRows([makeValidRow({ purposeCode: "P0102" })]).valid).toBe(true);
    const p0101 = validateBulkEbrcRows([makeValidRow({ purposeCode: "P0101" })]);
    expect(p0101.valid).toBe(false);
    expect(p0101.errors.some((e) => e.code === "RESTRICTED_PURPOSE_CODE")).toBe(true);

    const p0108 = validateBulkEbrcRows([makeValidRow({ purposeCode: "P0108" })]);
    expect(p0108.valid).toBe(false);
    expect(p0108.errors.some((e) => e.code === "RESTRICTED_PURPOSE_CODE")).toBe(true);
  });

  it("requires P0103 for advance remittances dated before the Shipping Bill", () => {
    const preSbWithoutP0103 = validateBulkEbrcRows([
      makeValidRow({
        irmDate: "01/10/2026",
        shippingBillDate: "15/10/2026",
        purposeCode: "P0102",
      }),
    ]);
    expect(preSbWithoutP0103.valid).toBe(false);
    expect(preSbWithoutP0103.errors.some((e) => e.code === "IRM_BEFORE_SB_DATE")).toBe(true);

    const preSbWithP0103 = validateBulkEbrcRows([
      makeValidRow({
        irmDate: "01/10/2026",
        shippingBillDate: "15/10/2026",
        purposeCode: "P0103",
      }),
    ]);
    expect(preSbWithP0103.valid).toBe(true);
  });

  it("enforces same-currency clubbing only and currency consistency", () => {
    const mixedOnSameSb = validateBulkEbrcRows([
      makeValidRow({ serialNumber: 1, irmCurrency: "USD", shippingBillNumber: "7458210" }),
      makeValidRow({
        serialNumber: 2,
        irmNumber: "IRM20261016999",
        irmCurrency: "EUR",
        shippingBillNumber: "7458210",
      }),
    ]);
    expect(mixedOnSameSb.valid).toBe(false);
    expect(mixedOnSameSb.errors.some((e) => e.code === "CROSS_CURRENCY_CLUBBING")).toBe(true);

    const mismatchExpected = validateBulkEbrcRows([
      makeValidRow({ irmCurrency: "EUR", expectedCurrency: "USD" }),
    ]);
    expect(mismatchExpected.valid).toBe(false);
    expect(mismatchExpected.errors.some((e) => e.code === "CURRENCY_MISMATCH")).toBe(true);
  });

  it("rejects negative/zero amounts and amounts exceeding remaining IRM balance across clubbed rows", () => {
    const zeroAmt = validateBulkEbrcRows([makeValidRow({ amountInFcc: "0.00" })]);
    expect(zeroAmt.valid).toBe(false);
    expect(zeroAmt.errors.some((e) => e.code === "INVALID_AMOUNT")).toBe(true);

    // Same IRM split across 2 SBs totaling 20,000.01 when cap is 20,000.00
    const overCap = validateBulkEbrcRows(
      [
        makeValidRow({
          serialNumber: 1,
          irmNumber: "IRM-CAP-1",
          shippingBillNumber: "SB1001",
          amountInFcc: "12000.00",
        }),
        makeValidRow({
          serialNumber: 2,
          irmNumber: "IRM-CAP-1",
          shippingBillNumber: "SB1002",
          amountInFcc: "8000.01",
        }),
      ],
      {
        irmBalanceCapMinorByNumber: { "IRM-CAP-1": 2000000 },
      }
    );
    expect(overCap.valid).toBe(false);
    expect(overCap.errors.some((e) => e.code === "IRM_BALANCE_EXCEEDED")).toBe(true);

    // Exactly matching IRM balance passes cleanly
    const exactCap = validateBulkEbrcRows(
      [
        makeValidRow({
          serialNumber: 1,
          irmNumber: "IRM-CAP-1",
          shippingBillNumber: "SB1001",
          amountInFcc: "12000.00",
        }),
        makeValidRow({
          serialNumber: 2,
          irmNumber: "IRM-CAP-1",
          shippingBillNumber: "SB1002",
          amountInFcc: "8000.00",
        }),
      ],
      {
        irmBalanceCapMinorByNumber: { "IRM-CAP-1": 2000000 },
      }
    );
    expect(exactCap.valid).toBe(true);
  });

  it("enforces max 999 data rows and max 5 MB file byte size limits", () => {
    const tooManyRows = Array.from({ length: EBRC_MAX_ROWS + 1 }, (_, i) =>
      makeValidRow({ serialNumber: (i % EBRC_MAX_ROWS) + 1 })
    );
    const overRowRes = validateBulkEbrcRows(tooManyRows);
    expect(overRowRes.valid).toBe(false);
    expect(overRowRes.errors.some((e) => e.code === "ROW_LIMIT_EXCEEDED")).toBe(true);

    const overSizeRes = validateBulkEbrcRows([makeValidRow()], {
      fileByteSize: EBRC_MAX_FILE_BYTES + 1,
    });
    expect(overSizeRes.valid).toBe(false);
    expect(overSizeRes.errors.some((e) => e.code === "FILE_SIZE_EXCEEDED")).toBe(true);
  });
});
