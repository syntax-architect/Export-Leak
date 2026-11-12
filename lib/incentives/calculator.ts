import {
  INCENTIVE_REFERENCE_DATE_CONFIG,
  INCENTIVE_ROUNDING_POLICY,
  INCENTIVE_SCHEMES,
} from "@/config/incentives";
import type { IncentiveScheme } from "@/lib/database.types";
import type {
  IncentiveCalcDetail,
  IncentiveCalculationWarning,
  IncentiveComparisonStatus,
  IncentiveItemCalculationBreakdown,
  IncentiveRateRecord,
  IncentiveSchemeCalculationResult,
  ShippingBillCalcInput,
} from "@/lib/incentives/types";

const TEN_THOUSAND = BigInt(10_000);
const ONE_MILLION = BigInt(1_000_000);

/**
 * Exact non-negative half-up integer division: round(numerator / denominator).
 */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) {
    throw new Error("Denominator must be positive.");
  }
  if (numerator <= BigInt(0)) {
    return BigInt(0);
  }
  return (numerator * BigInt(2) + denominator) / (BigInt(2) * denominator);
}

/**
 * Parses a positive base-10 decimal string into scaled BigInt (e.g. scale=4 for quantity, scale=6 for FX).
 * Uses half-up rounding if more fractional digits exist than `scale`.
 */
export function parsePositiveDecimalToScaledBigInt(
  rawValue: string | number | null | undefined,
  scale: number
): bigint | null {
  if (rawValue === null || rawValue === undefined) return null;
  const cleaned = String(rawValue).replace(/[,\s]/g, "").trim();
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(cleaned);
  if (!match) return null;

  const whole = match[1] ?? "0";
  const fracRaw = match[2] ?? "";
  const scaleFactor = BigInt(10) ** BigInt(scale);
  const padded = `${fracRaw}${"0".repeat(scale + 1)}`;
  const fracSlice = padded.slice(0, scale);
  const nextDigit = Number(padded.charAt(scale) || "0");

  let scaled = BigInt(whole) * scaleFactor + BigInt(fracSlice || "0");
  if (nextDigit >= 5) {
    scaled += BigInt(1);
  }
  return scaled > BigInt(0) ? scaled : null;
}

export function normalizeUqc(uqc: string | null | undefined): string {
  return (uqc ?? "").trim().toUpperCase();
}

export function resolveReferenceDate(
  sb: Pick<ShippingBillCalcInput, "sbDate" | "leoDate">,
  scheme: IncentiveScheme
): { date: string | null; field: "leo_date" | "sb_date" | "missing" } {
  const strategy = INCENTIVE_REFERENCE_DATE_CONFIG[scheme].strategy;
  if (strategy === "leo_date_or_sb_date" && sb.leoDate && sb.leoDate.trim().length > 0) {
    return { date: sb.leoDate.trim(), field: "leo_date" };
  }
  if (sb.sbDate && sb.sbDate.trim().length > 0) {
    return { date: sb.sbDate.trim(), field: "sb_date" };
  }
  return { date: null, field: "missing" };
}

export function convertMinorFobToInrMinor(params: {
  fobMinor: number;
  currency: string;
  exchangeRate: string | null;
}): { fobInrMinor: bigint | null; rateUsed: string | null } {
  const currency = params.currency.trim().toUpperCase();
  const fobBig = BigInt(Math.max(0, Math.trunc(params.fobMinor)));

  if (currency === "INR") {
    return { fobInrMinor: fobBig, rateUsed: "1" };
  }

  const scaledFx = parsePositiveDecimalToScaledBigInt(params.exchangeRate, 6);
  if (!scaledFx) {
    return { fobInrMinor: null, rateUsed: params.exchangeRate };
  }

  return {
    fobInrMinor: roundHalfUpDiv(fobBig * scaledFx, ONE_MILLION),
    rateUsed: params.exchangeRate,
  };
}

export function findApplicableRateRow(params: {
  rates: readonly IncentiveRateRecord[];
  scheme: IncentiveScheme;
  hsCode: string;
  referenceDate: string;
}): IncentiveRateRecord | null {
  const normalizedHs = params.hsCode.trim();
  const matches = params.rates.filter((rate) => {
    if (rate.scheme !== params.scheme) return false;
    if (rate.hsCode.trim() !== normalizedHs) return false;
    if (rate.effectiveFrom > params.referenceDate) return false;
    if (rate.effectiveTo && rate.effectiveTo < params.referenceDate) return false;
    return true;
  });

  if (matches.length === 0) return null;
  matches.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return matches[0] ?? null;
}

function toSafeNumber(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max) {
    throw new Error("Calculated incentive amount exceeds Number.MAX_SAFE_INTEGER.");
  }
  return Number(value);
}

/**
 * Pure per-SB incentive calculator across RoDTEP, Duty Drawback, and RoSCTL.
 * Uses integer BigInt arithmetic with explicit half-up rounding per line item so that
 * the bill total equals the exact sum of rounded item integers.
 */
export function calculateShippingBillIncentives(
  sb: ShippingBillCalcInput,
  rates: readonly IncentiveRateRecord[]
): IncentiveSchemeCalculationResult[] {
  const results: IncentiveSchemeCalculationResult[] = [];
  const normalizedCurrency = sb.currency.trim().toUpperCase();

  for (const scheme of INCENTIVE_SCHEMES) {
    const claimedOnSb = sb.schemesClaimed.includes(scheme);
    const ref = resolveReferenceDate(sb, scheme);
    const topWarnings: IncentiveCalculationWarning[] = [];

    if (!claimedOnSb) {
      topWarnings.push({
        code: "SCHEME_NOT_CLAIMED",
        message: `${scheme.toUpperCase()} was not claimed on Shipping Bill ${sb.sbNumber}.`,
      });
      const detail: IncentiveCalcDetail = {
        scheme,
        sbNumber: sb.sbNumber,
        referenceDate: ref.date,
        referenceDateField: ref.field,
        currency: normalizedCurrency,
        exchangeRateUsed: normalizedCurrency === "INR" ? "1" : sb.exchangeRate,
        roundingPolicy: INCENTIVE_ROUNDING_POLICY,
        claimedOnSb: false,
        calculationEligible: sb.calculationEligible,
        hasUnknownRate: false,
        totalExpectedMinor: 0,
        formulaSummary:
          "Scheme was not selected on this Shipping Bill; expected incentive is ₹0.00.",
        warnings: topWarnings,
        items: [],
      };
      results.push({
        scheme,
        expectedMinor: 0,
        primaryRateId: null,
        hasUnknownRate: false,
        claimedOnSb: false,
        calcDetail: detail,
      });
      continue;
    }

    if (!sb.calculationEligible) {
      topWarnings.push({
        code: "UNCONFIRMED_BILL",
        message:
          "Shipping Bill has low-confidence unconfirmed fields and is held back from verified totals until confirmed.",
      });
      const detail: IncentiveCalcDetail = {
        scheme,
        sbNumber: sb.sbNumber,
        referenceDate: ref.date,
        referenceDateField: ref.field,
        currency: normalizedCurrency,
        exchangeRateUsed: normalizedCurrency === "INR" ? "1" : sb.exchangeRate,
        roundingPolicy: INCENTIVE_ROUNDING_POLICY,
        claimedOnSb: true,
        calculationEligible: false,
        hasUnknownRate: true,
        totalExpectedMinor: 0,
        formulaSummary:
          "Held back pending user confirmation of low-confidence Shipping Bill fields.",
        warnings: topWarnings,
        items: [],
      };
      results.push({
        scheme,
        expectedMinor: 0,
        primaryRateId: null,
        hasUnknownRate: true,
        claimedOnSb: true,
        calcDetail: detail,
      });
      continue;
    }

    if (sb.items.length === 0) {
      topWarnings.push({
        code: "MISSING_ITEMS",
        message: "No HS line items found on this Shipping Bill.",
      });
      const detail: IncentiveCalcDetail = {
        scheme,
        sbNumber: sb.sbNumber,
        referenceDate: ref.date,
        referenceDateField: ref.field,
        currency: normalizedCurrency,
        exchangeRateUsed: normalizedCurrency === "INR" ? "1" : sb.exchangeRate,
        roundingPolicy: INCENTIVE_ROUNDING_POLICY,
        claimedOnSb: true,
        calculationEligible: true,
        hasUnknownRate: true,
        totalExpectedMinor: 0,
        formulaSummary: "No HS line items available to compute incentives.",
        warnings: topWarnings,
        items: [],
      };
      results.push({
        scheme,
        expectedMinor: 0,
        primaryRateId: null,
        hasUnknownRate: true,
        claimedOnSb: true,
        calcDetail: detail,
      });
      continue;
    }

    if (!ref.date) {
      topWarnings.push({
        code: "MISSING_REFERENCE_DATE",
        message:
          "Both LEO date and Shipping Bill date are missing; cannot select an effective rate.",
      });
      const detail: IncentiveCalcDetail = {
        scheme,
        sbNumber: sb.sbNumber,
        referenceDate: null,
        referenceDateField: "missing",
        currency: normalizedCurrency,
        exchangeRateUsed: normalizedCurrency === "INR" ? "1" : sb.exchangeRate,
        roundingPolicy: INCENTIVE_ROUNDING_POLICY,
        claimedOnSb: true,
        calculationEligible: true,
        hasUnknownRate: true,
        totalExpectedMinor: 0,
        formulaSummary: "Missing LEO date and SB date; rate lookup could not be resolved.",
        warnings: topWarnings,
        items: [],
      };
      results.push({
        scheme,
        expectedMinor: 0,
        primaryRateId: null,
        hasUnknownRate: true,
        claimedOnSb: true,
        calcDetail: detail,
      });
      continue;
    }

    let hasUnknownRate = false;
    let primaryRateId: string | null = null;
    let totalExpectedBig = BigInt(0);
    const itemBreakdowns: IncentiveItemCalculationBreakdown[] = [];

    for (const item of sb.items) {
      const itemWarnings: IncentiveCalculationWarning[] = [];
      const fxConv = convertMinorFobToInrMinor({
        fobMinor: item.fobMinor,
        currency: normalizedCurrency,
        exchangeRate: sb.exchangeRate,
      });

      const rate = findApplicableRateRow({
        rates,
        scheme,
        hsCode: item.hsCode,
        referenceDate: ref.date,
      });

      if (!fxConv.fobInrMinor) {
        hasUnknownRate = true;
        const warn: IncentiveCalculationWarning = {
          code: "MISSING_EXCHANGE_RATE",
          message: `Missing valid exchange rate for ${normalizedCurrency} -> INR on item HS ${item.hsCode}.`,
          itemId: item.id,
          hsCode: item.hsCode,
        };
        itemWarnings.push(warn);
        topWarnings.push(warn);
      }

      if (!rate) {
        hasUnknownRate = true;
        const warn: IncentiveCalculationWarning = {
          code: "MISSING_RATE",
          message: `No ${scheme.toUpperCase()} rate imported for HS ${item.hsCode} effective on ${ref.date}.`,
          itemId: item.id,
          hsCode: item.hsCode,
        };
        itemWarnings.push(warn);
        topWarnings.push(warn);

        itemBreakdowns.push({
          itemId: item.id,
          hsCode: item.hsCode,
          description: item.description,
          quantity: item.quantity,
          itemUqc: item.uqc,
          itemFobMinor: item.fobMinor,
          itemFobCurrency: normalizedCurrency,
          itemFobInrMinor: fxConv.fobInrMinor !== null ? toSafeNumber(fxConv.fobInrMinor) : null,
          rateId: null,
          rateBps: null,
          capPerUnitMinor: null,
          rateUqc: null,
          rateLimbInrMinor: null,
          capLimbInrMinor: null,
          appliedLimb: "none",
          expectedMinor: 0,
          formulaText: `Missing ${scheme.toUpperCase()} rate for HS ${item.hsCode} on ${ref.date}.`,
          warnings: itemWarnings,
        });
        continue;
      }

      if (!primaryRateId) {
        primaryRateId = rate.id;
      }

      if (!fxConv.fobInrMinor) {
        itemBreakdowns.push({
          itemId: item.id,
          hsCode: item.hsCode,
          description: item.description,
          quantity: item.quantity,
          itemUqc: item.uqc,
          itemFobMinor: item.fobMinor,
          itemFobCurrency: normalizedCurrency,
          itemFobInrMinor: null,
          rateId: rate.id,
          rateBps: rate.rateBps,
          capPerUnitMinor: rate.capPerUnitMinor,
          rateUqc: rate.uqc,
          rateLimbInrMinor: null,
          capLimbInrMinor: null,
          appliedLimb: "none",
          expectedMinor: 0,
          formulaText: `Waiting for valid ${normalizedCurrency} -> INR exchange rate.`,
          warnings: itemWarnings,
        });
        continue;
      }

      const itemUqcNorm = normalizeUqc(item.uqc);
      const rateUqcNorm = normalizeUqc(rate.uqc);
      if (rateUqcNorm && itemUqcNorm && rateUqcNorm !== itemUqcNorm) {
        const warn: IncentiveCalculationWarning = {
          code: "UQC_MISMATCH",
          message: `UQC mismatch on HS ${item.hsCode}: item uses ${itemUqcNorm}, rate table cap specifies ${rateUqcNorm}. Verify unit conversion.`,
          itemId: item.id,
          hsCode: item.hsCode,
        };
        itemWarnings.push(warn);
        topWarnings.push(warn);
      }

      const rateLimbBig = roundHalfUpDiv(fxConv.fobInrMinor * BigInt(rate.rateBps), TEN_THOUSAND);

      let capLimbBig: bigint | null = null;
      if (rate.capPerUnitMinor !== null) {
        const qtyScaled = parsePositiveDecimalToScaledBigInt(item.quantity, 4);
        if (qtyScaled) {
          capLimbBig = roundHalfUpDiv(qtyScaled * BigInt(rate.capPerUnitMinor), TEN_THOUSAND);
        } else {
          capLimbBig = BigInt(0);
        }
      }

      let appliedLimb: "rate" | "cap" = "rate";
      let expectedItemBig = rateLimbBig;
      if (capLimbBig !== null && capLimbBig < rateLimbBig) {
        appliedLimb = "cap";
        expectedItemBig = capLimbBig;
      }

      totalExpectedBig += expectedItemBig;

      const ratePct = (rate.rateBps / 100).toFixed(2);
      const fobInrFormatted = (Number(fxConv.fobInrMinor) / 100).toFixed(2);
      const rateLimbFormatted = (Number(rateLimbBig) / 100).toFixed(2);
      const formulaText =
        capLimbBig !== null
          ? `min(${ratePct}% × ₹${fobInrFormatted} = ₹${rateLimbFormatted}, ${item.quantity} ${itemUqcNorm || "UNIT"} × ₹${(rate.capPerUnitMinor! / 100).toFixed(2)} = ₹${(Number(capLimbBig) / 100).toFixed(2)}) -> ${appliedLimb} limb`
          : `${ratePct}% × ₹${fobInrFormatted} = ₹${rateLimbFormatted} (no cap)`;

      itemBreakdowns.push({
        itemId: item.id,
        hsCode: item.hsCode,
        description: item.description,
        quantity: item.quantity,
        itemUqc: item.uqc,
        itemFobMinor: item.fobMinor,
        itemFobCurrency: normalizedCurrency,
        itemFobInrMinor: toSafeNumber(fxConv.fobInrMinor),
        rateId: rate.id,
        rateBps: rate.rateBps,
        capPerUnitMinor: rate.capPerUnitMinor,
        rateUqc: rate.uqc,
        rateLimbInrMinor: toSafeNumber(rateLimbBig),
        capLimbInrMinor: capLimbBig !== null ? toSafeNumber(capLimbBig) : null,
        appliedLimb,
        expectedMinor: toSafeNumber(expectedItemBig),
        formulaText,
        warnings: itemWarnings,
      });
    }

    const totalExpectedMinor = toSafeNumber(totalExpectedBig);
    const fxDisplay = normalizedCurrency === "INR" ? "1" : (sb.exchangeRate ?? "missing");
    const formulaSummary =
      itemBreakdowns.length > 0
        ? `Sum of ${itemBreakdowns.length} line item(s) on ${ref.field} (${ref.date}), FX ${normalizedCurrency}->INR @ ${fxDisplay}: ₹${(totalExpectedMinor / 100).toFixed(2)}`
        : "No line items evaluated.";

    results.push({
      scheme,
      expectedMinor: totalExpectedMinor,
      primaryRateId,
      hasUnknownRate,
      claimedOnSb: true,
      calcDetail: {
        scheme,
        sbNumber: sb.sbNumber,
        referenceDate: ref.date,
        referenceDateField: ref.field,
        currency: normalizedCurrency,
        exchangeRateUsed: fxDisplay,
        roundingPolicy: INCENTIVE_ROUNDING_POLICY,
        claimedOnSb: true,
        calculationEligible: sb.calculationEligible,
        hasUnknownRate,
        totalExpectedMinor,
        formulaSummary,
        warnings: topWarnings,
        items: itemBreakdowns,
      },
    });
  }

  return results;
}

export function deriveIncentiveComparisonStatus(params: {
  claimedOnSb: boolean;
  calculationEligible: boolean;
  hasUnknownRate: boolean;
  expectedMinor: number;
  creditedMinor: number;
}): IncentiveComparisonStatus {
  if (!params.claimedOnSb) {
    return "not_claimed";
  }
  if (!params.calculationEligible || params.hasUnknownRate) {
    return "unknown_rate";
  }
  if (params.expectedMinor === 0 && params.creditedMinor === 0) {
    return "ok";
  }
  if (params.expectedMinor > 0 && params.creditedMinor === 0) {
    return "missing";
  }
  if (params.creditedMinor < params.expectedMinor) {
    return "short";
  }
  return "ok";
}
