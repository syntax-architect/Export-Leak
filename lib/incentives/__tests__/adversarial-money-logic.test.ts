import { describe, expect, it } from "vitest";
import { runMatchingEngine, computeBuyerSimilarity } from "@/lib/matching/matching-engine";
import type { MatchingShippingBillInput, MatchingRemittanceInput } from "@/lib/matching/types";
import {
  calculateShippingBillIncentives,
  convertMinorFobToInrMinor,
  findApplicableRateRow,
  roundHalfUpDiv,
} from "@/lib/incentives/calculator";
import type { IncentiveRateRecord, ShippingBillCalcInput } from "@/lib/incentives/types";
import {
  addMonthsAndDaysIso,
  classifyDeadlineDays,
  diffIsoDays,
  resolveRealisationDeadline,
  sanitizeInteger,
} from "@/lib/deadlines/engine";
import {
  autoFixBulkEbrcRows,
  parseDgftDateToIso,
  validateBulkEbrcRows,
  type BulkEbrcRowInput,
} from "@/lib/ebrc/validator";
import { buildBulkEbrcWorkbook } from "@/lib/ebrc/generator";
import { isValidDgftPortCode } from "@/lib/ebrc/port-codes";

describe("Review Prompt 2: Correctness Review of Money Logic (Appendix B - Prompt 2)", () => {
  // =========================================================================
  // Module 1: Matching Engine (10 Adversarial Tests)
  // =========================================================================
  describe("Module 1: Matching Engine Correctness", () => {
    it("1.1 Duplicate open invoice numbers block silent auto-confirmation", () => {
      // Two different shipping bills have identical invoice number "INV-100"
      const sb1: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "1000001",
        sbDate: "2026-10-01",
        buyerName: "Acme Corp",
        invoiceNo: "INV-100",
        currency: "USD",
        fobMinor: 500000, // $5,000.00
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const sb2: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-2",
        sbNumber: "1000002",
        sbDate: "2026-10-02",
        buyerName: "Acme Corp",
        invoiceNo: "INV-100",
        currency: "USD",
        fobMinor: 500000, // $5,000.00
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-901",
        remittanceDate: "2026-10-05",
        remitterName: "Acme Corp",
        invoiceReference: "Payment for INV-100",
        currency: "USD",
        amountMinor: 500000,
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb1, sb2],
        remittances: [rem],
      });

      // Crucial: Must NOT auto-confirm because invoice is ambiguous across multiple bills
      expect(result.autoConfirmed.length).toBe(0);
      expect(result.reviewSuggestions.length).toBeGreaterThan(0);
      expect(result.reviewSuggestions[0]?.signals.invoiceAmbiguous).toBe(true);
      expect(result.reviewSuggestions[0]?.explanation).toContain("duplicate invoice");
    });

    it("1.2 Bank charge tolerance rejection on 1 extra paise difference", () => {
      const sb: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "2000001",
        sbDate: "2026-10-01",
        buyerName: "Global Trade Inc",
        invoiceNo: "INV-201",
        currency: "USD",
        fobMinor: 100000, // $1,000.00
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      // Bank charge max is $25.00 (2500 cents). A shortfall of $25.01 (2501 cents) is rejected.
      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-201",
        remittanceDate: "2026-10-10",
        remitterName: "Global Trade Inc",
        invoiceReference: "INV-201",
        currency: "USD",
        amountMinor: 100000 - 2501, // $25.01 shortfall (exceeds $25 tolerance)
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb],
        remittances: [rem],
      });

      expect(result.autoConfirmed.length).toBe(0);
      const match = result.reviewSuggestions.find((m) => m.shippingBillId === "sb-1");
      expect(match?.signals.withinBankChargeTolerance).toBe(false);
    });

    it("1.3 Exact zero paise difference achieves top confidence pattern", () => {
      const sb: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "3000001",
        sbDate: "2026-10-01",
        buyerName: "TexStyle Europe",
        invoiceNo: "INV-301",
        currency: "EUR",
        fobMinor: 750000, // €7,500.00
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-301",
        remittanceDate: "2026-10-05",
        remitterName: "TexStyle Europe GMBH",
        invoiceReference: "Inv 301 Settlement",
        currency: "EUR",
        amountMinor: 750000,
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb],
        remittances: [rem],
      });

      expect(result.autoConfirmed.length).toBe(1);
      expect(result.autoConfirmed[0]?.signals.pattern).toBe("exact_1to1");
      expect(result.autoConfirmed[0]?.signals.amountDiffMinor).toBe(0);
      expect(result.autoConfirmed[0]?.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("1.4 Rejects matching payments and bills with currency mismatch", () => {
      const sb: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "4000001",
        sbDate: "2026-10-01",
        buyerName: "Buyer X",
        invoiceNo: "INV-401",
        currency: "USD",
        fobMinor: 100000,
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-401",
        remittanceDate: "2026-10-05",
        remitterName: "Buyer X",
        invoiceReference: "INV-401",
        currency: "EUR", // Different currency
        amountMinor: 100000,
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb],
        remittances: [rem],
      });

      expect(result.autoConfirmed.length).toBe(0);
      expect(result.reviewSuggestions.length).toBe(0);
    });

    it("1.5 Rejects payment dated prior to shipping bill date", () => {
      const sb: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "5000001",
        sbDate: "2026-10-15",
        buyerName: "Buyer Y",
        invoiceNo: "INV-501",
        currency: "USD",
        fobMinor: 200000,
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-501",
        remittanceDate: "2026-10-01", // 14 days before shipping bill
        remitterName: "Buyer Y",
        invoiceReference: "INV-501",
        currency: "USD",
        amountMinor: 200000,
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb],
        remittances: [rem],
      });

      // Regular post-shipment matching rejects remDate < sbDate
      expect(result.autoConfirmed.length).toBe(0);
    });

    it("1.6 Remittance remainder tracking prevents over-allocation on partial match", () => {
      const sb1: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "6000001",
        sbDate: "2026-10-01",
        buyerName: "Buyer Z",
        invoiceNo: "INV-601",
        currency: "USD",
        fobMinor: 400000, // $4,000
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-601",
        remittanceDate: "2026-10-05",
        remitterName: "Buyer Z",
        invoiceReference: "INV-601 partial",
        currency: "USD",
        amountMinor: 1000000, // $10,000 total IRM
        utilisedMinor: 300000, // $3,000 already utilised, remaining = $7,000
      };

      const result = runMatchingEngine({
        shippingBills: [sb1],
        remittances: [rem],
      });

      // Proposed allocation must be capped at sbNeed ($4,000)
      const match = result.autoConfirmed[0] || result.reviewSuggestions[0];
      expect(match).toBeDefined();
      expect(match?.proposedMinor).toBe(400000);
    });

    it("1.7 Detects 1-to-many sum where multiple bills equal one remittance", () => {
      const sb1: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "7000001",
        sbDate: "2026-10-01",
        buyerName: "Mega Retailer",
        invoiceNo: "INV-701",
        currency: "USD",
        fobMinor: 300000, // $3,000
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const sb2: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-2",
        sbNumber: "7000002",
        sbDate: "2026-10-02",
        buyerName: "Mega Retailer",
        invoiceNo: "INV-702",
        currency: "USD",
        fobMinor: 700000, // $7,000
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-701",
        remittanceDate: "2026-10-10",
        remitterName: "Mega Retailer Corp",
        invoiceReference: "Payment for combined invoices",
        currency: "USD",
        amountMinor: 1000000, // $10,000 exactly equals $3k + $7k
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb1, sb2],
        remittances: [rem],
      });

      const multiMatches = result.reviewSuggestions.filter(
        (m) => m.signals.pattern === "split_1_rem_to_many_sbs"
      );
      expect(multiMatches.length).toBe(2);
    });

    it("1.8 Strips corporate stopwords so company suffixes do not degrade similarity", () => {
      const sim1 = computeBuyerSimilarity("Acme Exports Private Limited", "Acme Exports Ltd");
      const sim2 = computeBuyerSimilarity("Global Trading Corp GmbH", "Global Trading Co LLC");

      expect(sim1).toBe(1); // "acme", "exports" tokens match perfectly
      expect(sim2).toBe(1); // "global" token matches
    });

    it("1.9 Matches alphanumeric invoices regardless of slash/hyphen delimiter formatting", () => {
      const sb: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "8000001",
        sbDate: "2026-10-01",
        buyerName: "Target Stores",
        invoiceNo: "EXP/2026-27/0042",
        currency: "USD",
        fobMinor: 250000,
        alreadyMatchedMinor: 0,
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-801",
        remittanceDate: "2026-10-05",
        remitterName: "Target Stores",
        invoiceReference: "TT FOR EXP2026270042", // Delimiters removed by remitter
        currency: "USD",
        amountMinor: 250000,
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb],
        remittances: [rem],
      });

      expect(result.autoConfirmed.length).toBe(1);
      expect(result.autoConfirmed[0]?.signals.invoiceMatched).toBe(true);
    });

    it("1.10 Never proposes candidate allocation exceeding available bill need", () => {
      const sb: MatchingShippingBillInput = {
        iecId: "iec-1",
        id: "sb-1",
        sbNumber: "9000001",
        sbDate: "2026-10-01",
        buyerName: "Buyer Alpha",
        invoiceNo: "INV-901",
        currency: "USD",
        fobMinor: 100000,
        alreadyMatchedMinor: 80000, // Only $200 needed
        status: "filed",
        calculationEligible: true,
      };

      const rem: MatchingRemittanceInput = {
        iecId: "iec-1",
        bankName: "HDFC Bank",
        id: "rem-1",
        irmNumber: "IRM-901",
        remittanceDate: "2026-10-05",
        remitterName: "Buyer Alpha",
        invoiceReference: "INV-901 final",
        currency: "USD",
        amountMinor: 500000,
        utilisedMinor: 0,
      };

      const result = runMatchingEngine({
        shippingBills: [sb],
        remittances: [rem],
      });

      const match = result.autoConfirmed[0] || result.reviewSuggestions[0];
      expect(match).toBeDefined();
      expect(match?.proposedMinor).toBe(20000); // Exactly $200, not $5,000
    });
  });

  // =========================================================================
  // Module 2: Incentive Calculator (10 Adversarial Tests)
  // =========================================================================
  describe("Module 2: Incentive Calculator Correctness", () => {
    it("2.1 Half-up integer division rounds odd paise fractions with zero floating error", () => {
      // 1234567 paise * 215 bps = 265431905 / 10000 = 26543.1905 -> 26543
      const res1 = roundHalfUpDiv(BigInt(1234567) * BigInt(215), BigInt(10000));
      expect(res1).toBe(BigInt(26543));

      // 1234567 paise * 225 bps = 277777575 / 10000 = 27777.7575 -> 27778
      const res2 = roundHalfUpDiv(BigInt(1234567) * BigInt(225), BigInt(10000));
      expect(res2).toBe(BigInt(27778));

      // Exact 0.5 round half-up: 5 / 2 -> 3
      const res3 = roundHalfUpDiv(BigInt(5), BigInt(2));
      expect(res3).toBe(BigInt(3));
    });

    it("2.2 Cap per unit applies exactly at mathematical boundary", () => {
      // RoDTEP Rate 2.5% (250 bps), Cap ₹35.00/PCS (3500 paise/PCS)
      const rate: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-1",
        scheme: "rodtep",
        hsCode: "61091000",
        rateBps: 250,
        capPerUnitMinor: 3500, // ₹35.00
        uqc: "PCS",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      };

      // Case A: 100 PCS, FOB ₹1,00,000 (10000000 paise)
      // 2.5% of FOB = ₹2,500. Cap = ₹35 * 100 = ₹3,500.
      // Rate FOB applies.
      const sbA: ShippingBillCalcInput = {
        shippingBillId: "sb-a",
        sbNumber: "SB-A",
        sbDate: "2026-05-01",
        leoDate: null,
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["rodtep"],
        calculationEligible: true,
        items: [
          {
            id: "it-1",
            hsCode: "61091000",
            quantity: "100",
            uqc: "PCS",
            fobMinor: 10000000,
            description: "Test Goods",
          },
        ],
      };

      const resA = calculateShippingBillIncentives(sbA, [rate]);
      expect(resA[0]?.expectedMinor).toBe(250000);
      expect(resA[0]?.calcDetail.items[0]?.appliedLimb).toBe("rate");

      // Case B: 50 PCS, FOB ₹10,00,000 (100000000 paise)
      // 2.5% of FOB = ₹25,000. Cap = ₹35 * 50 = ₹1,750.
      // Cap applies.
      const sbB: ShippingBillCalcInput = {
        shippingBillId: "sb-b",
        sbNumber: "SB-B",
        sbDate: "2026-05-01",
        leoDate: null,
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["rodtep"],
        calculationEligible: true,
        items: [
          {
            id: "it-2",
            hsCode: "61091000",
            quantity: "50",
            uqc: "PCS",
            fobMinor: 100000000,
            description: "Test Goods",
          },
        ],
      };

      const resB = calculateShippingBillIncentives(sbB, [rate]);
      expect(resB[0]?.expectedMinor).toBe(175000); // ₹1,750.00
      expect(resB[0]?.calcDetail.items[0]?.appliedLimb).toBe("cap");
    });

    it("2.3 Flags UQC mismatch warning when unit in bill disagrees with notification", () => {
      const rate: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-kgs",
        scheme: "drawback",
        hsCode: "52081190",
        rateBps: 200,
        capPerUnitMinor: 1500, // ₹15/KG
        uqc: "KGS",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      };

      const sb: ShippingBillCalcInput = {
        shippingBillId: "sb-uqc",
        sbNumber: "SB-UQC",
        sbDate: "2026-06-01",
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["drawback"],
        leoDate: null,
        calculationEligible: true,
        items: [
          {
            id: "it-1",
            hsCode: "52081190",
            description: "Cotton fabric",
            quantity: "500",
            uqc: "MTR", // Bill states MTR, but notification states KGS
            fobMinor: 2000000,
          },
        ],
      };

      const res = calculateShippingBillIncentives(sb, [rate]);
      const drawbackResult = res.find((r) => r.scheme === "drawback");
      const itemWarnings = drawbackResult?.calcDetail.items[0]?.warnings;
      expect(itemWarnings?.some((w) => w.code === "UQC_MISMATCH")).toBe(true);
    });

    it("2.4 Resolves mid-year rate changes based on effective date boundaries", () => {
      const rateOld: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-old",
        scheme: "rodtep",
        hsCode: "62034200",
        rateBps: 250,
        capPerUnitMinor: null,
        uqc: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-03-31",
      };

      const rateNew: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-new",
        scheme: "rodtep",
        hsCode: "62034200",
        rateBps: 180, // Revised lower rate from 1 April
        capPerUnitMinor: null,
        uqc: null,
        effectiveFrom: "2026-04-01",
        effectiveTo: null,
      };

      const applicableOld = findApplicableRateRow({
        rates: [rateOld, rateNew],
        scheme: "rodtep",
        hsCode: "62034200",
        referenceDate: "2026-03-31",
      });
      expect(applicableOld?.id).toBe("rate-old");
      expect(applicableOld?.rateBps).toBe(250);

      const applicableNew = findApplicableRateRow({
        rates: [rateOld, rateNew],
        scheme: "rodtep",
        hsCode: "62034200",
        referenceDate: "2026-04-01",
      });
      expect(applicableNew?.id).toBe("rate-new");
      expect(applicableNew?.rateBps).toBe(180);
    });

    it("2.5 Converts foreign FOB to INR minor units using 6-decimal exchange rate", () => {
      // $10,000.00 FOB (1000000 minor) at FX rate 83.456789
      // INR FOB = 1000000 * 83456789 / 1000000 = 83456789 paise (₹8,34,567.89)
      const conv = convertMinorFobToInrMinor({
        fobMinor: 1000000,
        currency: "USD",
        exchangeRate: "83.456789",
      });

      expect(conv.fobInrMinor).toBe(BigInt(83456789));
    });

    it("2.6 Handles zero and 1 paise FOB items without division by zero or errors", () => {
      const convZero = convertMinorFobToInrMinor({
        fobMinor: 0,
        currency: "USD",
        exchangeRate: "83.50",
      });
      expect(convZero.fobInrMinor).toBe(BigInt(0));

      const conv1Paise = convertMinorFobToInrMinor({
        fobMinor: 1,
        currency: "INR",
        exchangeRate: "1",
      });
      expect(conv1Paise.fobInrMinor).toBe(BigInt(1));
    });

    it("2.7 Mathematical proof: Bill total equals exact integer sum of line items", () => {
      const rate: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-multi",
        scheme: "rodtep",
        hsCode: "61091000",
        rateBps: 215, // 2.15%
        capPerUnitMinor: null,
        uqc: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      };

      const items = [
        {
          id: "1",
          hsCode: "61091000",
          quantity: "10",
          uqc: "PCS",
          fobMinor: 111111,
          description: "Test Goods",
        },
        {
          id: "2",
          hsCode: "61091000",
          quantity: "20",
          uqc: "PCS",
          fobMinor: 222222,
          description: "Test Goods",
        },
        {
          id: "3",
          hsCode: "61091000",
          quantity: "30",
          uqc: "PCS",
          fobMinor: 333333,
          description: "Test Goods",
        },
        {
          id: "4",
          hsCode: "61091000",
          quantity: "40",
          uqc: "PCS",
          fobMinor: 444444,
          description: "Test Goods",
        },
      ];

      const sb: ShippingBillCalcInput = {
        shippingBillId: "sb-sum",
        sbNumber: "SB-SUM",
        sbDate: "2026-05-01",
        leoDate: null,
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["rodtep"],
        calculationEligible: true,
        items,
      };

      const res = calculateShippingBillIncentives(sb, [rate]);
      const schemeResult = res.find((r) => r.scheme === "rodtep")!;

      const sumOfItemMinor = schemeResult.calcDetail.items.reduce(
        (acc, it) => acc + it.expectedMinor,
        0
      );

      expect(schemeResult.expectedMinor).toBe(sumOfItemMinor);
    });

    it("2.8 Unclaimed scheme yields strictly zero expected with warning", () => {
      const rate: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-drawback",
        scheme: "drawback",
        hsCode: "61091000",
        rateBps: 200,
        capPerUnitMinor: null,
        uqc: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      };

      const sb: ShippingBillCalcInput = {
        shippingBillId: "sb-unclaimed",
        sbNumber: "SB-UNCLAIMED",
        sbDate: "2026-05-01",
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["rodtep"], // Only RoDTEP claimed, not Drawback
        leoDate: null,
        calculationEligible: true,
        items: [
          {
            id: "1",
            hsCode: "61091000",
            quantity: "10",
            uqc: "PCS",
            fobMinor: 500000,
            description: "Test Goods",
          },
        ],
      };

      const res = calculateShippingBillIncentives(sb, [rate]);
      const drawbackResult = res.find((r) => r.scheme === "drawback")!;

      expect(drawbackResult.expectedMinor).toBe(0);
      expect(drawbackResult.claimedOnSb).toBe(false);
      expect(drawbackResult.calcDetail.warnings[0]?.code).toBe("SCHEME_NOT_CLAIMED");
    });

    it("2.9 Unmapped 8-digit HS code flags unknown rate warning and zero calculation", () => {
      const sb: ShippingBillCalcInput = {
        shippingBillId: "sb-unknown",
        sbNumber: "SB-UNKNOWN",
        sbDate: "2026-05-01",
        leoDate: null,
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["rodtep"],
        calculationEligible: true,
        items: [
          {
            id: "1",
            hsCode: "99999999",
            quantity: "10",
            uqc: "PCS",
            fobMinor: 500000,
            description: "Test Goods",
          },
        ],
      };

      const res = calculateShippingBillIncentives(sb, []); // No rates configured
      const rodtepResult = res.find((r) => r.scheme === "rodtep")!;

      expect(rodtepResult.hasUnknownRate).toBe(true);
      expect(rodtepResult.expectedMinor).toBe(0);
      expect(rodtepResult.calcDetail.items[0]?.warnings[0]?.code).toBe("MISSING_RATE");
    });

    it("2.10 Let Export Order (LEO) date takes precedence over SB filing date", () => {
      const rateOld: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-filed",
        scheme: "rodtep",
        hsCode: "61091000",
        rateBps: 200,
        capPerUnitMinor: null,
        uqc: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-03-31",
      };

      const rateNew: IncentiveRateRecord = {
        sourceNote: "Test Rate",
        id: "rate-leo",
        scheme: "rodtep",
        hsCode: "61091000",
        rateBps: 300,
        capPerUnitMinor: null,
        uqc: null,
        effectiveFrom: "2026-04-01",
        effectiveTo: null,
      };

      // SB filed on March 30, but LEO granted on April 2
      const sb: ShippingBillCalcInput = {
        shippingBillId: "sb-leo-precedence",
        sbNumber: "SB-LEO",
        sbDate: "2026-03-30",
        leoDate: "2026-04-02",
        currency: "INR",
        exchangeRate: "1",
        schemesClaimed: ["rodtep"],
        calculationEligible: true,
        items: [
          {
            id: "1",
            hsCode: "61091000",
            quantity: "10",
            uqc: "PCS",
            fobMinor: 1000000,
            description: "Test Goods",
          },
        ],
      };

      const res = calculateShippingBillIncentives(sb, [rateOld, rateNew]);
      const rodtepResult = res.find((r) => r.scheme === "rodtep")!;

      // Must pick rateNew (300 bps / 3%) based on LEO date
      expect(rodtepResult.primaryRateId).toBe("rate-leo");
      expect(rodtepResult.expectedMinor).toBe(30000); // 3% of ₹10,000 = ₹300
    });
  });

  // =========================================================================
  // Module 3: Deadline Engine (10 Adversarial Tests)
  // =========================================================================
  describe("Module 3: Deadline Engine Correctness", () => {
    it("3.1 Correctly adds months to leap day (2024-02-29)", () => {
      // 2024-02-29 + 9 months = 2024-11-29
      const due = addMonthsAndDaysIso("2024-02-29", 9, 0);
      expect(due).toBe("2024-11-29");
    });

    it("3.2 Clamps May 31 + 9 months to February 28 in common year (2027)", () => {
      // 2026-05-31 + 9 months = 2027-02-28 (February has 28 days in 2027)
      const due = addMonthsAndDaysIso("2026-05-31", 9, 0);
      expect(due).toBe("2027-02-28");
    });

    it("3.3 Clamps May 31 + 9 months to February 29 in leap year (2024)", () => {
      // 2023-05-31 + 9 months = 2024-02-29 (February has 29 days in 2024 leap year)
      const due = addMonthsAndDaysIso("2023-05-31", 9, 0);
      expect(due).toBe("2024-02-29");
    });

    it("3.4 Clamps August 31 + 6 months to February 28", () => {
      const due = addMonthsAndDaysIso("2026-08-31", 6, 0);
      expect(due).toBe("2027-02-28");
    });

    it("3.5 Correctly classifies deadline threshold boundary buckets", () => {
      expect(classifyDeadlineDays(91).bucket).toBe("healthy");
      expect(classifyDeadlineDays(90).bucket).toBe("warning");
      expect(classifyDeadlineDays(30).bucket).toBe("warning");
      expect(classifyDeadlineDays(29).bucket).toBe("critical");
      expect(classifyDeadlineDays(1).bucket).toBe("critical");
      expect(classifyDeadlineDays(0).bucket).toBe("overdue");
      expect(classifyDeadlineDays(-1).bucket).toBe("overdue");
      expect(classifyDeadlineDays(-1).isOverdue).toBe(true);
    });

    it("3.6 Eliminates JavaScript negative zero (-0)", () => {
      const sanitized = sanitizeInteger(-0);
      expect(Object.is(sanitized, 0)).toBe(true);
      expect(Object.is(sanitized, -0)).toBe(false);
    });

    it("3.7 Applies separate rule key for INR-invoiced exports", () => {
      const rules = [
        {
          key: "realisation_months",
          value: { months: 9 },
          effective_from: "2026-10-01",
          effective_to: null,
        },
        {
          key: "realisation_months_inr",
          value: { months: 12 },
          effective_from: "2026-10-01",
          effective_to: null,
        },
      ];

      const resInr = resolveRealisationDeadline({
        sbDate: "2026-10-15",
        currency: "INR",
        rules,
        todayIso: "2026-10-15",
      });

      expect(resInr.monthsApplied).toBe(12);
      expect(resInr.ruleKey).toBe("realisation_months_inr");
      expect(resInr.dueDate).toBe("2027-10-15");
    });

    it("3.8 Resolves rule based on shipment date effective boundaries", () => {
      const rules = [
        {
          key: "realisation_months",
          value: { months: 9 },
          effective_from: "2026-10-01",
          effective_to: null,
        },
        {
          key: "realisation_months",
          value: { months: 15 },
          effective_from: "2024-01-01",
          effective_to: "2026-09-30",
        },
      ];

      const resOld = resolveRealisationDeadline({
        sbDate: "2026-09-15",
        currency: "USD",
        rules,
        todayIso: "2026-09-15",
      });
      expect(resOld.monthsApplied).toBe(15);

      const resNew = resolveRealisationDeadline({
        sbDate: "2026-10-15",
        currency: "USD",
        rules,
        todayIso: "2026-10-15",
      });
      expect(resNew.monthsApplied).toBe(9);
    });

    it("3.9 Flags missing rule warning when compliance rule table is empty", () => {
      const resWithoutStored = resolveRealisationDeadline({
        sbDate: "2026-10-15",
        currency: "USD",
        rules: [], // Empty rules
        todayIso: "2026-10-15",
      });

      expect(resWithoutStored.ruleMissing).toBe(true);
      expect(resWithoutStored.ruleSource).toBe("missing");
      expect(resWithoutStored.ruleNote).toContain("rule configured in compliance_rules");

      const resWithStored = resolveRealisationDeadline({
        sbDate: "2026-10-15",
        currency: "USD",
        rules: [], // Empty rules
        storedDueDate: "2027-07-15",
        todayIso: "2026-10-15",
      });

      expect(resWithStored.ruleMissing).toBe(true);
      expect(resWithStored.ruleSource).toBe("stored_fallback");
      expect(resWithStored.ruleNote).toContain("using recorded due date");
    });

    it("3.10 Calculates exact day difference independent of daylight savings shifts", () => {
      // 2026-01-01 to 2026-10-01 = 273 days exactly
      const diff = diffIsoDays("2026-01-01", "2026-10-01");
      expect(diff).toBe(273);
    });
  });

  // =========================================================================
  // Module 4: eBRC Generator & Validator (10 Adversarial Tests)
  // =========================================================================
  describe("Module 4: eBRC Generator & Validator Correctness", () => {
    const validBaseRow: BulkEbrcRowInput = {
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
    };

    it("4.1 Strict DD/MM/YYYY leap year validation accepts 29/02/2024 and rejects 29/02/2025", () => {
      expect(parseDgftDateToIso("29/02/2024")).toBe("2024-02-29");
      expect(parseDgftDateToIso("29/02/2025")).toBeNull(); // Invalid date in non-leap year
      expect(parseDgftDateToIso("31/04/2026")).toBeNull(); // April only has 30 days
    });

    it("4.2 Validates port code strictly against DGFT Indian port directory", () => {
      expect(isValidDgftPortCode("INTUT6")).toBe(true); // Tuticorin
      expect(isValidDgftPortCode("INNSA1")).toBe(true); // Nhava Sheva
      expect(isValidDgftPortCode("INBOM4")).toBe(true); // Mumbai Air
      expect(isValidDgftPortCode("ZZZZ99")).toBe(false); // Fake port
    });

    it("4.3 Rejects row if IRM currency differs from Shipping Bill expected currency", () => {
      const row: BulkEbrcRowInput = {
        ...validBaseRow,
        irmCurrency: "EUR",
        expectedCurrency: "USD", // Mismatch
      };

      const val = validateBulkEbrcRows([row]);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "CURRENCY_MISMATCH")).toBe(true);
    });

    it("4.4 Enforces remittance available balance to prevent over-allocation in eBRC export", () => {
      const row: BulkEbrcRowInput = {
        ...validBaseRow,
        irmNumber: "IRM-CAP-OVER",
        amountInFcc: "5000.00",
      };

      const val = validateBulkEbrcRows([row], {
        irmBalanceCapMinorByNumber: { "IRM-CAP-OVER": 300000 }, // Only $3,000 available
      });
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "IRM_BALANCE_EXCEEDED")).toBe(true);
    });

    it("4.5 Validates purpose code format strictly (P followed by 4 digits)", () => {
      const invalidRow: BulkEbrcRowInput = {
        ...validBaseRow,
        purposeCode: "INVALID",
      };

      const val = validateBulkEbrcRows([invalidRow]);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.field === "purposeCode")).toBe(true);
    });

    it("4.6 Validates IFSC code format strictly (4 letters + 0 + 6 alphanumeric)", () => {
      const invalidRow: BulkEbrcRowInput = {
        ...validBaseRow,
        ifscCode: "HDFC9999", // Bad format
      };

      const val = validateBulkEbrcRows([invalidRow]);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.field === "ifscCode")).toBe(true);
    });

    it("4.7 Validates Authorized Dealer (AD) code length (1 to 7 alphanumeric characters)", () => {
      const invalidRow: BulkEbrcRowInput = {
        ...validBaseRow,
        adCode: "051000100099", // Exceeds 7 characters
      };

      const val = validateBulkEbrcRows([invalidRow]);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.field === "adCode")).toBe(true);
    });

    it("4.8 Generated Excel matches DGFT template sheet name and exact 12 columns", async () => {
      const workbook = await buildBulkEbrcWorkbook([validBaseRow]);
      expect(workbook.buffer.length).toBeGreaterThan(0);
      expect(workbook.rowCount).toBe(1);
      expect(workbook.sheetName).toBe("eBRC_Bulk_Upload");
      expect(workbook.headers.length).toBe(12);
    });

    it("4.9 Enforces maximum 999 row batch limit for DGFT portal stability", () => {
      const rows = new Array(1000).fill(validBaseRow);
      const val = validateBulkEbrcRows(rows);

      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "ROW_LIMIT_EXCEEDED")).toBe(true);
    });

    it("4.10 Safely auto-fixes ISO YYYY-MM-DD dates to DGFT DD/MM/YYYY format", () => {
      const row: BulkEbrcRowInput = {
        ...validBaseRow,
        shippingBillDate: "2026-10-10",
        irmDate: "2026-10-15",
      };

      const fixed = autoFixBulkEbrcRows([row]);
      expect(fixed.fixesApplied).toBe(2);
      expect(fixed.rows[0]?.shippingBillDate).toBe("10/10/2026");
      expect(fixed.rows[0]?.irmDate).toBe("15/10/2026");
    });
  });
});
