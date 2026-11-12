import { describe, expect, it } from "vitest";
import { runIrmFixtureBenchmark } from "@/lib/matching/benchmark";
import {
  buildIrmImportPreview,
  normalizeIrmDate,
  normalizeIrmMoneyToMinor,
} from "@/lib/matching/irm-importer";
import { runMatchingEngine } from "@/lib/matching/matching-engine";
import type { MatchingRemittanceInput, MatchingShippingBillInput } from "@/lib/matching/types";

function makeSb(overrides: Partial<MatchingShippingBillInput> = {}): MatchingShippingBillInput {
  return {
    id: "sb-1",
    iecId: "iec-1",
    sbNumber: "7000001",
    sbDate: "2026-10-10",
    invoiceNo: "INV-1001",
    buyerName: "NORDIC APPAREL AB",
    currency: "USD",
    fobMinor: 10000_00,
    alreadyMatchedMinor: 0,
    calculationEligible: true,
    status: "parsed",
    ...overrides,
  };
}

function makeRem(overrides: Partial<MatchingRemittanceInput> = {}): MatchingRemittanceInput {
  return {
    id: "rem-1",
    iecId: "iec-1",
    irmNumber: "IRM-001",
    bankName: "HDFC Bank",
    remittanceDate: "2026-10-15",
    currency: "USD",
    amountMinor: 10000_00,
    utilisedMinor: 0,
    remitterName: "NORDIC APPAREL AB",
    invoiceReference: "PMT FOR INV-1001",
    ...overrides,
  };
}

describe("IRM importer normalisation & header preview", () => {
  it("normalises dates (ISO, DD/MM/YYYY, DD-MMM-YYYY, Excel serial) and Indian comma money without floating point", () => {
    expect(normalizeIrmDate("2026-10-18")).toBe("2026-10-18");
    expect(normalizeIrmDate("25/10/2026")).toBe("2026-10-25");
    expect(normalizeIrmDate("18-Oct-2026")).toBe("2026-10-18");
    expect(normalizeIrmDate("46313")).toBe("2026-10-18");
    expect(normalizeIrmDate("31/02/2026")).toBeNull();

    expect(normalizeIrmMoneyToMinor("INR 4,20,000.50")).toBe(42000050);
    expect(normalizeIrmMoneyToMinor("$11,975.00")).toBe(1197500);
    expect(normalizeIrmMoneyToMinor("-100.00")).toBeNull();
  });

  it("detects header rows past preamble banners and reports failed rows loudly", async () => {
    const csv = [
      "BANK PORTAL EXPORT",
      "GENERATED ON 12 NOV 2026",
      "FIRC / IRM Ref,Bank,Credit Date,Currency,Remittance Value,Already Utilised,Remitter,Payment Narration",
      'IRM-101,HDFC,18/10/2026,USD,"12,500.00",0,ACME LTD,INV-1001',
      'IRM-102,HDFC,31/02/2026,USD,"500.00",0,ACME LTD,BAD DATE',
    ].join("\n");

    const preview = await buildIrmImportPreview({
      filename: "sample.csv",
      bytes: new TextEncoder().encode(csv),
    });

    expect(preview.headerRowNumber).toBe(3);
    expect(preview.validCount).toBe(1);
    expect(preview.failedCount).toBe(1);
    expect(preview.previewRows[0]?.irmNumber).toBe("IRM-101");
    expect(preview.previewRows[0]?.amountMinor).toBe(1250000);
    expect(preview.failedRows[0]?.rowNumber).toBe(5);
    expect(preview.failedRows[0]?.reason).toMatch(/Invalid or missing remittance date/i);
  });
});

describe("Pure Matching Engine (Prompt 7 Acceptance Criteria)", () => {
  it("auto-confirms exact 1-to-1 match with invoice, amount, buyer, and date explanation", () => {
    const res = runMatchingEngine({
      shippingBills: [makeSb()],
      remittances: [makeRem()],
    });

    expect(res.autoConfirmed).toHaveLength(1);
    expect(res.reviewSuggestions).toHaveLength(0);
    expect(res.autoConfirmed[0]?.proposedMinor).toBe(10000_00);
    expect(res.autoConfirmed[0]?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(res.autoConfirmed[0]?.explanation).toContain("Amount equal");
    expect(res.autoConfirmed[0]?.explanation).toContain("INV-1001");
    expect(res.unmatchedBillRemainders["sb-1"]).toBe(0);
    expect(res.unmatchedRemittanceRemainders["rem-1"]).toBe(0);
  });

  it("handles near-equal amounts within bank-charge tolerance", () => {
    const sb = makeSb({ fobMinor: 12000_00, invoiceNo: "INV-2231" });
    const rem = makeRem({
      amountMinor: 11975_00,
      invoiceReference: "WIRE INV-2231 LESS USD 25 FEE",
    });

    const res = runMatchingEngine({ shippingBills: [sb], remittances: [rem] });
    expect(res.autoConfirmed).toHaveLength(1);
    expect(res.autoConfirmed[0]?.proposedMinor).toBe(11975_00);
    expect(res.autoConfirmed[0]?.signals.withinBankChargeTolerance).toBe(true);
    expect(res.autoConfirmed[0]?.explanation).toMatch(/bank charges/i);
  });

  it("supports split payment (1 remittance -> many shipping bills) summing cleanly", () => {
    const sb1 = makeSb({
      id: "sb-1",
      sbNumber: "7000101",
      invoiceNo: "INV/26/301",
      fobMinor: 10000_00,
    });
    const sb2 = makeSb({
      id: "sb-2",
      sbNumber: "7000102",
      invoiceNo: "INV/26/302",
      fobMinor: 8000_00,
    });
    const rem = makeRem({
      id: "rem-split",
      irmNumber: "IRM-SPLIT-1",
      amountMinor: 18000_00,
      invoiceReference: "CLUBBED INV/26/301 AND INV/26/302",
    });

    const res = runMatchingEngine({ shippingBills: [sb1, sb2], remittances: [rem] });
    expect(res.autoConfirmed).toHaveLength(2);
    expect(res.autoConfirmed.map((m) => m.proposedMinor)).toEqual([10000_00, 8000_00]);
    expect(res.autoConfirmed[0]?.signals.pattern).toBe("split_1_rem_to_many_sbs");
    expect(res.unmatchedRemittanceRemainders["rem-split"]).toBe(0);
    expect(res.unmatchedBillRemainders["sb-1"]).toBe(0);
    expect(res.unmatchedBillRemainders["sb-2"]).toBe(0);
  });

  it("supports partial payments (many remittances -> 1 bill AND single installment remainder tracking)", () => {
    const sb = makeSb({ id: "sb-1", invoiceNo: "INV/26/401", fobMinor: 10000_00 });
    const remA = makeRem({
      id: "rem-a",
      irmNumber: "IRM-PART-A",
      amountMinor: 6000_00,
      remittanceDate: "2026-10-16",
      invoiceReference: "60PCT ADV INV/26/401",
    });
    const remB = makeRem({
      id: "rem-b",
      irmNumber: "IRM-PART-B",
      amountMinor: 4000_00,
      remittanceDate: "2026-10-22",
      invoiceReference: "40PCT BAL INV/26/401",
    });

    const fullRes = runMatchingEngine({ shippingBills: [sb], remittances: [remA, remB] });
    expect(fullRes.autoConfirmed).toHaveLength(2);
    expect(fullRes.autoConfirmed.map((m) => m.proposedMinor)).toEqual([6000_00, 4000_00]);
    expect(fullRes.unmatchedBillRemainders["sb-1"]).toBe(0);

    // Single partial installment alone goes to Review Matches with exact remaining need tracked
    const partialRes = runMatchingEngine({ shippingBills: [sb], remittances: [remA] });
    expect(partialRes.autoConfirmed).toHaveLength(0);
    expect(partialRes.reviewSuggestions).toHaveLength(1);
    expect(partialRes.reviewSuggestions[0]?.proposedMinor).toBe(6000_00);
    expect(partialRes.reviewSuggestions[0]?.explanation).toMatch(/Partial payment/i);
  });

  it("never clubs or pairs different currencies and blocks pre-SB payment dates", () => {
    const sbUsd = makeSb({ id: "sb-usd", currency: "USD", fobMinor: 9500_00 });
    const remEur = makeRem({
      id: "rem-eur",
      currency: "EUR",
      amountMinor: 9500_00,
      invoiceReference: "INV-1001",
    });
    const remEarly = makeRem({
      id: "rem-early",
      currency: "USD",
      remittanceDate: "2026-10-05", // before 2026-10-10 SB date
      amountMinor: 9500_00,
      invoiceReference: "INV-1001",
    });

    const res = runMatchingEngine({
      shippingBills: [sbUsd],
      remittances: [remEur, remEarly],
    });
    expect(res.autoConfirmed).toHaveLength(0);
    expect(res.reviewSuggestions).toHaveLength(0);
  });

  it("flags duplicate invoice numbers for manual Review Matches instead of auto-confirming", () => {
    const sb1 = makeSb({
      id: "sb-1",
      sbNumber: "7111111",
      invoiceNo: "INV/DUP/900",
      fobMinor: 8500_00,
    });
    const sb2 = makeSb({
      id: "sb-2",
      sbNumber: "7111112",
      invoiceNo: "INV/DUP/900",
      fobMinor: 8500_00,
    });
    const rem = makeRem({
      id: "rem-1",
      amountMinor: 8500_00,
      invoiceReference: "INV/DUP/900",
    });

    const res = runMatchingEngine({ shippingBills: [sb1, sb2], remittances: [rem] });
    expect(res.autoConfirmed).toHaveLength(0);
    expect(res.reviewSuggestions).toHaveLength(2);
    expect(res.reviewSuggestions.every((s) => s.signals.invoiceAmbiguous)).toBe(true);
    expect(res.reviewSuggestions[0]?.explanation).toMatch(/duplicate invoice/i);
  });

  it("never allocates more than a remittance's remaining balance across matches", () => {
    const rem = makeRem({
      id: "rem-cap",
      amountMinor: 10000_00,
      utilisedMinor: 4000_00, // only 6000_00 remaining
      invoiceReference: "INV-A INV-B",
    });
    const sbA = makeSb({ id: "sb-a", sbNumber: "7200001", invoiceNo: "INV-A", fobMinor: 6000_00 });
    const sbB = makeSb({ id: "sb-b", sbNumber: "7200002", invoiceNo: "INV-B", fobMinor: 6000_00 });

    const res = runMatchingEngine({ shippingBills: [sbA, sbB], remittances: [rem] });
    const totalAutoAllocated = res.autoConfirmed.reduce((sum, m) => sum + m.proposedMinor, 0);
    expect(totalAutoAllocated).toBeLessThanOrEqual(6000_00);
    expect(res.unmatchedRemittanceRemainders["rem-cap"]).toBeGreaterThanOrEqual(0);
  });

  it("runs against /fixtures/irm/, generates report showing auto-confirmed vs reviewed counts", async () => {
    const report = await runIrmFixtureBenchmark();
    expect(report.validRemittancesCount).toBe(9);
    expect(report.failedRows).toHaveLength(1);
    expect(report.result.autoConfirmed.length).toBeGreaterThanOrEqual(6);
    expect(report.result.reviewSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(report.markdown).toContain("Auto-Confirmed Matches");
    expect(report.markdown).toContain("Sent to Review Matches");
  });
});
