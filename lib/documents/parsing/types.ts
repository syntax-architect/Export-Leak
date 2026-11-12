import type { IncentiveScheme } from "@/lib/database.types";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.85;
export const DEFAULT_AI_MAX_COST_PER_DOC_PAISE = 200; // ₹2.00 per document cap

export const KNOWN_ISO_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AED",
  "SAR",
  "SGD",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "HKD",
  "NZD",
  "QAR",
  "OMR",
  "KWD",
  "BHD",
  "MYR",
  "THB",
  "ZAR",
  "SEK",
  "NOK",
  "DKK",
]);

export type ExtractionMethod = "deterministic" | "ocr_deterministic" | "ai" | "manual";

export interface FieldSourceSpan {
  page: number;
  start: number;
  end: number;
  snippet: string;
}

export interface FieldConfidenceEntry {
  confidence: number;
  source: FieldSourceSpan | null;
  method: ExtractionMethod;
  confirmed: boolean;
  warnings: string[];
}

export interface ParsedPageText {
  page: number;
  text: string;
}

export interface ParsedShippingBillItemDraft {
  hsCode: string;
  description: string;
  quantity: string; // Decimal string for Postgres numeric(16,4)
  uqc: string;
  fobMinor: number;
  fieldConfidence: Record<string, FieldConfidenceEntry>;
}

export interface ParsedShippingBillDraft {
  sbNumber: string | null;
  sbDate: string | null; // YYYY-MM-DD
  portCode: string | null;
  leoDate: string | null; // YYYY-MM-DD
  invoiceNo: string | null;
  buyerName: string | null;
  currency: string | null;
  fobMinor: number | null;
  exchangeRate: string | null;
  schemesClaimed: IncentiveScheme[];
  items: ParsedShippingBillItemDraft[];
  fieldConfidence: Record<string, FieldConfidenceEntry>;
}

export interface ShippingBillValidationSummary {
  needsReviewFields: string[];
  validationErrors: string[];
  isValidForAutoConfirm: boolean;
}

export interface ParsePipelineResult {
  draft: ParsedShippingBillDraft;
  validation: ShippingBillValidationSummary;
  pageTexts: ParsedPageText[];
  usedOcrFallback: boolean;
  strategy: "deterministic" | "ocr_deterministic" | "deterministic_plus_ai";
  aiTokensUsed: number;
  aiCostPaise: number;
  aiCapExceeded: boolean;
  finalStatus: "done" | "needs_review";
}

export function getAiMaxCostPerDocPaise(): number {
  const raw = Number(process.env.AI_MAX_COST_PER_DOC_PAISE ?? DEFAULT_AI_MAX_COST_PER_DOC_PAISE);
  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_AI_MAX_COST_PER_DOC_PAISE;
  }
  return Math.floor(raw);
}

/**
 * Exact base-10 decimal string to integer minor-unit conversion (2 decimal places).
 * Never uses floating-point arithmetic for monetary values.
 */
export function parseDecimalMoneyToMinorUnits(rawValue: string): number | null {
  const cleaned = rawValue.replace(/[,\s]/g, "").trim();
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(cleaned);
  if (!match) return null;

  const wholePart = match[1] ?? "0";
  const fracRaw = match[2] ?? "";
  const padded = `${fracRaw}000`;
  const fracTwo = padded.slice(0, 2);
  const thirdDigit = Number(padded.charAt(2) || "0");

  const wholeMinor = BigInt(wholePart) * BigInt(100);
  let fracMinor = BigInt(fracTwo);
  if (thirdDigit >= 5) {
    fracMinor += BigInt(1);
  }
  const total = wholeMinor + fracMinor;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(total);
}

export function normalizeDateStringToIso(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (isoMatch) {
    return buildValidIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(value);
  if (dmyMatch) {
    let year = Number(dmyMatch[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return buildValidIsoDate(year, Number(dmyMatch[2]), Number(dmyMatch[1]));
  }

  const monthMap: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    SEPT: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };
  const dMonYMatch = /^(\d{1,2})[\s\-\/]([A-Za-z]{3,4})[\s\-\/](\d{2,4})$/.exec(value);
  if (dMonYMatch) {
    const month = monthMap[dMonYMatch[2]!.toUpperCase()];
    if (!month) return null;
    let year = Number(dMonYMatch[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return buildValidIsoDate(year, month, Number(dMonYMatch[1]));
  }

  return null;
}

function buildValidIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1995 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
