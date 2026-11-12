import type { IncentiveScheme, ScripStatus } from "@/lib/database.types";

export type IncentiveComparisonStatus = "ok" | "short" | "missing" | "not_claimed" | "unknown_rate";

export interface IncentiveRateRecord {
  id: string;
  scheme: IncentiveScheme;
  hsCode: string;
  rateBps: number;
  capPerUnitMinor: number | null;
  uqc: string | null;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD
  sourceNote: string;
}

export interface ShippingBillCalcItemInput {
  id: string;
  hsCode: string;
  description: string;
  quantity: string; // numeric(16,4) decimal string
  uqc: string;
  fobMinor: number;
}

export interface ShippingBillCalcInput {
  shippingBillId: string;
  sbNumber: string;
  sbDate: string; // YYYY-MM-DD
  leoDate: string | null; // YYYY-MM-DD
  currency: string;
  exchangeRate: string | null;
  schemesClaimed: IncentiveScheme[];
  calculationEligible: boolean;
  items: ShippingBillCalcItemInput[];
}

export interface IncentiveCalculationWarning {
  code:
    | "UNCONFIRMED_BILL"
    | "SCHEME_NOT_CLAIMED"
    | "MISSING_REFERENCE_DATE"
    | "MISSING_EXCHANGE_RATE"
    | "MISSING_RATE"
    | "UQC_MISMATCH"
    | "MISSING_ITEMS";
  message: string;
  itemId?: string;
  hsCode?: string;
}

export interface IncentiveItemCalculationBreakdown {
  itemId: string;
  hsCode: string;
  description: string;
  quantity: string;
  itemUqc: string;
  itemFobMinor: number;
  itemFobCurrency: string;
  itemFobInrMinor: number | null;
  rateId: string | null;
  rateBps: number | null;
  capPerUnitMinor: number | null;
  rateUqc: string | null;
  rateLimbInrMinor: number | null;
  capLimbInrMinor: number | null;
  appliedLimb: "rate" | "cap" | "none";
  expectedMinor: number;
  formulaText: string;
  warnings: IncentiveCalculationWarning[];
}

export interface IncentiveCalcDetail {
  scheme: IncentiveScheme;
  sbNumber: string;
  referenceDate: string | null;
  referenceDateField: "leo_date" | "sb_date" | "missing";
  currency: string;
  exchangeRateUsed: string | null;
  roundingPolicy: "half_up_per_item_integer_sum";
  claimedOnSb: boolean;
  calculationEligible: boolean;
  hasUnknownRate: boolean;
  totalExpectedMinor: number;
  formulaSummary: string;
  warnings: IncentiveCalculationWarning[];
  items: IncentiveItemCalculationBreakdown[];
}

export interface IncentiveSchemeCalculationResult {
  scheme: IncentiveScheme;
  expectedMinor: number;
  primaryRateId: string | null;
  hasUnknownRate: boolean;
  claimedOnSb: boolean;
  calcDetail: IncentiveCalcDetail;
}

export interface ParsedRateCsvRow {
  rowNumber: number;
  scheme: IncentiveScheme;
  hsCode: string;
  rateBps: number;
  capPerUnitMinor: number | null;
  uqc: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceNote: string;
}

export interface RateCsvRowError {
  rowNumber: number;
  message: string;
  rawRow: string[];
}

export interface RateCsvPreviewResult {
  totalDataRows: number;
  validRows: ParsedRateCsvRow[];
  errors: RateCsvRowError[];
}

export interface ParsedScrollCsvRow {
  rowNumber: number;
  sbNumber: string;
  scheme: IncentiveScheme;
  creditedMinor: number;
  creditedOn: string | null;
  scrollNumber: string;
  raw: Record<string, string>;
}

export interface ScrollCsvRowError {
  rowNumber: number;
  sbNumber: string | null;
  message: string;
  rawRow: string[];
}

export interface ScrollCsvPreviewResult {
  totalDataRows: number;
  validRows: ParsedScrollCsvRow[];
  errors: ScrollCsvRowError[];
}

export interface ScripValidityRuleConfig {
  confirmed: boolean;
  months: number | null;
  days: number | null;
  sourceNote: string;
  effectiveFrom: string | null;
}

export interface ScripSummaryItem {
  id: string;
  iecId: string;
  scripNumber: string;
  scheme: IncentiveScheme;
  faceMinor: number;
  generatedOn: string;
  expiresOn: string | null;
  expirySource: "compliance_rule" | "manual" | "unconfirmed";
  notes: string;
  status: ScripStatus;
  daysToExpiry: number | null;
}
