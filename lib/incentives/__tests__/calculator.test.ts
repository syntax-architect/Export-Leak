import { describe, expect, it } from "vitest";
import {
  calculateShippingBillIncentives,
  deriveIncentiveComparisonStatus,
} from "@/lib/incentives/calculator";
import { parseAndValidateRatesSpreadsheet } from "@/lib/incentives/rate-importer";
import { resolveScripExpiry } from "@/lib/incentives/scrip-utils";
import { parseScrollSpreadsheet } from "@/lib/incentives/scroll-importer";
import type { IncentiveRateRecord, ShippingBillCalcInput } from "@/lib/incentives/types";

const BASE_RATES: IncentiveRateRecord[] = [
  {
    id: "rate-rodtep-h1",
    scheme: "rodtep",
    hsCode: "84834000",
    rateBps: 150, // 1.50%
    capPerUnitMinor: 2500, // ₹25.00 per KGS
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-06-30",
    sourceNote: "Synthetic H1 2026",
  },
  {
    id: "rate-rodtep-h2",
    scheme: "rodtep",
    hsCode: "84834000",
    rateBps: 200, // 2.00%
    capPerUnitMinor: 4000, // ₹40.00 per KGS
    uqc: "KGS",
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    sourceNote: "Synthetic H2 2026",
  },
  {
    id: "rate-dbk-nocap",
    scheme: "drawback",
    hsCode: "84834000",
    rateBps: 120, // 1.20%
    capPerUnitMinor: null,
    uqc: "KGS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "Synthetic No Cap",
  },
  {
    id: "rate-rosctl",
    scheme: "rosctl",
    hsCode: "62052000",
    rateBps: 333, // 3.33%
    capPerUnitMinor: 15000, // ₹150.00 per PCS
    uqc: "PCS",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceNote: "Synthetic Apparel",
  },
];

function makeSb(overrides: Partial<ShippingBillCalcInput> = {}): ShippingBillCalcInput {
  return {
    shippingBillId: "sb-1",
    sbNumber: "SB-1001",
    sbDate: "2026-03-10",
    leoDate: "2026-03-15",
    currency: "INR",
    exchangeRate: "1.000000",
    schemesClaimed: ["rodtep", "drawback"],
    calculationEligible: true,
    items: [
      {
        id: "item-1",
        hsCode: "84834000",
        description: "Gear Shafts",
        quantity: "100.0000",
        uqc: "KGS",
        fobMinor: 10_000_000, // ₹1,00,000.00
      },
    ],
    ...overrides,
  };
}

describe("Incentive Calculator & Importers (Prompt 8)", () => {
  it("1. picks rate limb when below cap_per_unit × quantity", () => {
    // 1.5% of ₹1,00,000 = ₹1,500 (150,000 paise) vs cap 100 * ₹25 = ₹2,500 -> rate limb ₹1,500
    const res = calculateShippingBillIncentives(makeSb(), BASE_RATES);
    const rodtep = res.find((r) => r.scheme === "rodtep")!;
    expect(rodtep.expectedMinor).toBe(150_000);
    expect(rodtep.calcDetail.items[0]?.appliedLimb).toBe("rate");
    expect(rodtep.calcDetail.warnings).toHaveLength(0);
  });

  it("2. enforces cap_per_unit × quantity when rate limb exceeds cap", () => {
    // FOB ₹5,00,000 -> 1.5% = ₹7,500, but cap = 100 KGS * ₹25 = ₹2,500 (250,000 paise)
    const sb = makeSb({
      items: [
        {
          id: "item-1",
          hsCode: "84834000",
          description: "High-value Gear",
          quantity: "100.0000",
          uqc: "KGS",
          fobMinor: 50_000_000,
        },
      ],
    });
    const res = calculateShippingBillIncentives(sb, BASE_RATES);
    const rodtep = res.find((r) => r.scheme === "rodtep")!;
    expect(rodtep.expectedMinor).toBe(250_000);
    expect(rodtep.calcDetail.items[0]?.appliedLimb).toBe("cap");
  });

  it("3. handles uncapped drawback strictly by rate_bps", () => {
    // 1.2% of ₹5,00,000 = ₹6,000 (600,000 paise)
    const sb = makeSb({
      items: [
        {
          id: "item-1",
          hsCode: "84834000",
          description: "High-value Gear",
          quantity: "100.0000",
          uqc: "KGS",
          fobMinor: 50_000_000,
        },
      ],
    });
    const res = calculateShippingBillIncentives(sb, BASE_RATES);
    const dbk = res.find((r) => r.scheme === "drawback")!;
    expect(dbk.expectedMinor).toBe(600_000);
    expect(dbk.calcDetail.items[0]?.capLimbInrMinor).toBeNull();
  });

  it("4. selects H1 vs H2 rate on mid-year date boundary using LEO date first", () => {
    const sbH1 = makeSb({ sbDate: "2026-06-28", leoDate: "2026-06-30" });
    const sbH2 = makeSb({ sbDate: "2026-06-28", leoDate: "2026-07-01" });

    const h1 = calculateShippingBillIncentives(sbH1, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    const h2 = calculateShippingBillIncentives(sbH2, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;

    expect(h1.primaryRateId).toBe("rate-rodtep-h1");
    expect(h1.expectedMinor).toBe(150_000);
    expect(h2.primaryRateId).toBe("rate-rodtep-h2");
    expect(h2.expectedMinor).toBe(200_000);
  });

  it("5. editing an effective date alters ONLY shipments falling outside/inside the updated range", () => {
    const editedRates = BASE_RATES.map((r) =>
      r.id === "rate-rodtep-h1"
        ? { ...r, effectiveTo: "2026-05-31" }
        : r.id === "rate-rodtep-h2"
          ? { ...r, effectiveFrom: "2026-06-01" }
          : r
    );
    const earlySb = makeSb({ shippingBillId: "early", leoDate: "2026-04-10" });
    const juneSb = makeSb({ shippingBillId: "june", leoDate: "2026-06-15" });

    const beforeEarly = calculateShippingBillIncentives(earlySb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    const afterEarly = calculateShippingBillIncentives(earlySb, editedRates).find(
      (r) => r.scheme === "rodtep"
    )!;
    const beforeJune = calculateShippingBillIncentives(juneSb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    const afterJune = calculateShippingBillIncentives(juneSb, editedRates).find(
      (r) => r.scheme === "rodtep"
    )!;

    expect(beforeEarly.expectedMinor).toBe(150_000);
    expect(afterEarly.expectedMinor).toBe(150_000); // unchanged!
    expect(beforeJune.expectedMinor).toBe(150_000);
    expect(afterJune.expectedMinor).toBe(200_000); // shifted!
  });

  it("6. falls back to sb_date when leo_date is null", () => {
    const sb = makeSb({ leoDate: null, sbDate: "2026-07-10" });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.calcDetail.referenceDateField).toBe("sb_date");
    expect(rodtep.calcDetail.referenceDate).toBe("2026-07-10");
    expect(rodtep.expectedMinor).toBe(200_000);
  });

  it("7. converts foreign currency FOB to INR minor units via exchangeRate cleanly", () => {
    // $1,000.00 USD (100,000 cents) @ ₹85.50 = ₹85,500.00 (8,550,000 paise); 2.00% = ₹1,710.00 (171,000 paise)
    const sb = makeSb({
      leoDate: "2026-08-01",
      currency: "USD",
      exchangeRate: "85.500000",
      items: [
        {
          id: "item-fx",
          hsCode: "84834000",
          description: "FX Item",
          quantity: "500.0000",
          uqc: "KGS",
          fobMinor: 100_000,
        },
      ],
    });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.expectedMinor).toBe(171_000);
    expect(rodtep.calcDetail.items[0]?.itemFobInrMinor).toBe(8_550_000);
  });

  it("8. marks unknown_rate and warns when non-INR shipment lacks exchange_rate", () => {
    const sb = makeSb({ currency: "USD", exchangeRate: null });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.hasUnknownRate).toBe(true);
    expect(rodtep.expectedMinor).toBe(0);
    expect(rodtep.calcDetail.warnings.some((w) => w.code === "MISSING_EXCHANGE_RATE")).toBe(true);
  });

  it("9. emits MISSING_RATE and marks hasUnknownRate when HS code has no effective rate", () => {
    const sb = makeSb({
      items: [
        {
          id: "item-miss",
          hsCode: "99999999",
          description: "Unmapped HS",
          quantity: "10.0000",
          uqc: "KGS",
          fobMinor: 100_000,
        },
      ],
    });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.hasUnknownRate).toBe(true);
    expect(rodtep.calcDetail.warnings.some((w) => w.code === "MISSING_RATE")).toBe(true);
  });

  it("10. emits UQC_MISMATCH warning when item UQC differs from rate table cap UQC", () => {
    const sb = makeSb({
      items: [
        {
          id: "item-uqc",
          hsCode: "84834000",
          description: "Packaged Gears",
          quantity: "100.0000",
          uqc: "PCS",
          fobMinor: 10_000_000,
        },
      ],
    });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.calcDetail.warnings.some((w) => w.code === "UQC_MISMATCH")).toBe(true);
  });

  it("11. enforces exact half-up rounding per item so sum(items) === bill total", () => {
    // FOB values that create fractional 0.5 paise:
    // 1.5% (150 bps) of 1033 paise = 15.495 -> 15 paise
    // 1.5% (150 bps) of 1034 paise = 15.510 -> 16 paise
    // 1.5% (150 bps) of 1033.33 -> let's use exact 150 * 33 / 10000 = 0.495 -> 0, 150 * 500 / 10000 = 7.5 -> 8!
    // Even better: 1.5% of 10050 paise = 150.75 -> 151, 1.5% of 10050 = 151 (not 301.5 -> 302)
    // Wait: 10050 * 150 / 10000 = 150.75 (half-up 151); two identical items = 151 + 151 = 302 (bill sum of rounded items).
    // And 3334 paise * 150 / 10000 = 50.01 -> 50; 3333 paise * 150 / 10000 = 49.995 -> 50.
    // Exact half: 350 paise * 150 / 10000 = 5.25 -> 5; 1500 paise * 100 / 10000 = 15;
    // Test exact 0.5 boundary: 150 bps on 50 paise = 0.75 -> 1; 150 bps on 334 paise = 5.01 -> 5;
    // Use rosctl 333 bps on 150 paise = 49950 / 10000 = 4.995 -> 5; 333 bps on 165 paise = 5.4945 -> 5;
    // 250 bps wait: 150 bps on 300? Wait: 150 * 500 = 75000 / 10000 = 7.5 -> half-up = 8!
    const sb = makeSb({
      schemesClaimed: ["rodtep"],
      items: [
        {
          id: "i1",
          hsCode: "84834000",
          description: "Half-up exact .50",
          quantity: "10.0000",
          uqc: "KGS",
          fobMinor: 500, // 500 * 150 / 10000 = 7.5 -> 8
        },
        {
          id: "i2",
          hsCode: "84834000",
          description: "Half-up .495 down",
          quantity: "10.0000",
          uqc: "KGS",
          fobMinor: 330, // 330 * 150 / 10000 = 4.95 -> 5
        },
        {
          id: "i3",
          hsCode: "84834000",
          description: "Half-up .25 down",
          quantity: "10.0000",
          uqc: "KGS",
          fobMinor: 150, // 150 * 150 / 10000 = 2.25 -> 2
        },
      ],
    });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    const sumOfItems = rodtep.calcDetail.items.reduce((acc, item) => acc + item.expectedMinor, 0);
    expect(rodtep.calcDetail.items.map((i) => i.expectedMinor)).toEqual([8, 5, 2]);
    expect(rodtep.expectedMinor).toBe(sumOfItems);
    expect(rodtep.expectedMinor).toBe(15);
  });

  it("12. marks scheme not_claimed when absent from schemes_claimed", () => {
    const sb = makeSb({ schemesClaimed: ["drawback"] });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.claimedOnSb).toBe(false);
    expect(rodtep.expectedMinor).toBe(0);
    expect(
      deriveIncentiveComparisonStatus({
        claimedOnSb: false,
        calculationEligible: true,
        hasUnknownRate: false,
        expectedMinor: 0,
        creditedMinor: 0,
      })
    ).toBe("not_claimed");
  });

  it("13. holds back unconfirmed low-confidence bills per Hard Rule 6", () => {
    const sb = makeSb({ calculationEligible: false });
    const rodtep = calculateShippingBillIncentives(sb, BASE_RATES).find(
      (r) => r.scheme === "rodtep"
    )!;
    expect(rodtep.expectedMinor).toBe(0);
    expect(rodtep.hasUnknownRate).toBe(true);
    expect(rodtep.calcDetail.warnings.some((w) => w.code === "UNCONFIRMED_BILL")).toBe(true);
  });

  it("14. derives all 5 comparison statuses accurately", () => {
    expect(
      deriveIncentiveComparisonStatus({
        claimedOnSb: true,
        calculationEligible: true,
        hasUnknownRate: false,
        expectedMinor: 100_000,
        creditedMinor: 100_000,
      })
    ).toBe("ok");
    expect(
      deriveIncentiveComparisonStatus({
        claimedOnSb: true,
        calculationEligible: true,
        hasUnknownRate: false,
        expectedMinor: 100_000,
        creditedMinor: 85_000,
      })
    ).toBe("short");
    expect(
      deriveIncentiveComparisonStatus({
        claimedOnSb: true,
        calculationEligible: true,
        hasUnknownRate: false,
        expectedMinor: 100_000,
        creditedMinor: 0,
      })
    ).toBe("missing");
    expect(
      deriveIncentiveComparisonStatus({
        claimedOnSb: false,
        calculationEligible: true,
        hasUnknownRate: false,
        expectedMinor: 0,
        creditedMinor: 5_000,
      })
    ).toBe("not_claimed");
    expect(
      deriveIncentiveComparisonStatus({
        claimedOnSb: true,
        calculationEligible: true,
        hasUnknownRate: true,
        expectedMinor: 0,
        creditedMinor: 0,
      })
    ).toBe("unknown_rate");
  });

  it("15. rate importer rejects 6-digit HS codes and overlapping effective date ranges", async () => {
    const csv = [
      "scheme,hs_code,rate_bps,cap_per_unit,uqc,effective_from,effective_to,source_note",
      "rodtep,848340,150,25.00,KGS,2026-01-01,2026-06-30,Bad 6-digit HS",
      "rodtep,84834000,190,30.00,KGS,2026-05-01,2026-08-01,Overlaps DB H1 & H2",
      "rosctl,62063000,250,15.00,PCS,2026-01-01,2026-06-30,Valid row 1",
      "rosctl,62063000,275,18.00,PCS,2026-06-15,,Overlaps batch row",
      "drawback,73269099,110,,KGS,2026-01-01,,Valid uncapped",
    ].join("\n");

    const preview = await parseAndValidateRatesSpreadsheet({
      filename: "rates.csv",
      bytes: new TextEncoder().encode(csv),
      existingRates: BASE_RATES,
    });

    expect(preview.totalDataRows).toBe(5);
    expect(preview.validRows).toHaveLength(2);
    expect(preview.validRows.map((r) => r.hsCode)).toEqual(["62063000", "73269099"]);
    expect(preview.errors).toHaveLength(3);
    expect(preview.errors[0]?.message).toContain("8-digit");
    expect(preview.errors[1]?.message).toContain("Overlaps with existing rate row");
    expect(preview.errors[2]?.message).toContain("Overlaps with row");
  });

  it("16. rate importer accepts blank cap_per_unit as uncapped null and parses decimal INR caps to minor paise", async () => {
    const csv = [
      "scheme,hs_code,rate_bps,cap_per_unit,uqc,effective_from,effective_to,source_note",
      "rodtep,10011010,125,12.35,KGS,2026-01-01,,Capped",
      "drawback,10011010,100,,,2026-01-01,,Uncapped",
    ].join("\n");

    const preview = await parseAndValidateRatesSpreadsheet({
      filename: "rates.csv",
      bytes: new TextEncoder().encode(csv),
    });

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.capPerUnitMinor).toBe(1235);
    expect(preview.validRows[1]?.capPerUnitMinor).toBeNull();
  });

  it("17. scroll importer parses valid rows and reports malformed rows loudly", async () => {
    const csv = [
      "sb_number,scheme,credited_amount,credited_on,scroll_number",
      'SB-1001,rodtep,"1,500.00",2026-04-01,SCR-01',
      ",drawback,500.00,2026-04-02,SCR-02",
      "SB-1002,rodtep,NOT_A_NUMBER,2026-04-02,SCR-03",
      "SB-1003,unknown_scheme,200.00,2026-04-02,SCR-04",
    ].join("\n");

    const preview = await parseScrollSpreadsheet({
      filename: "scroll.csv",
      bytes: new TextEncoder().encode(csv),
    });

    expect(preview.totalDataRows).toBe(4);
    expect(preview.validRows).toHaveLength(1);
    expect(preview.validRows[0]?.creditedMinor).toBe(150_000);
    expect(preview.errors).toHaveLength(3);
  });

  it("18. scrip expiry helper leaves expiresOn null when compliance rule is unconfirmed unless entered manually", () => {
    const unconfirmed = resolveScripExpiry({
      generatedOn: "2026-05-01",
      manualExpiresOn: null,
      validityRule: {
        confirmed: false,
        months: null,
        days: null,
        sourceNote: "Awaiting confirmation",
        effectiveFrom: null,
      },
    });
    expect(unconfirmed).toEqual({ expiresOn: null, expirySource: "unconfirmed" });

    const confirmed = resolveScripExpiry({
      generatedOn: "2026-05-01",
      manualExpiresOn: null,
      validityRule: {
        confirmed: true,
        months: 12,
        days: 0,
        sourceNote: "Verified rule",
        effectiveFrom: "2026-01-01",
      },
    });
    expect(confirmed).toEqual({ expiresOn: "2027-05-01", expirySource: "compliance_rule" });

    const manual = resolveScripExpiry({
      generatedOn: "2026-05-01",
      manualExpiresOn: "2027-02-15",
      validityRule: null,
    });
    expect(manual).toEqual({ expiresOn: "2027-02-15", expirySource: "manual" });
  });
});
