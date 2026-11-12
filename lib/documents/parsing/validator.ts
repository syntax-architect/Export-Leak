import {
  type FieldConfidenceEntry,
  KNOWN_ISO_CURRENCIES,
  normalizeDateStringToIso,
  type ParsedShippingBillDraft,
  REVIEW_CONFIDENCE_THRESHOLD,
  type ShippingBillValidationSummary,
} from "@/lib/documents/parsing/types";

export const REQUIRED_BILL_FIELDS = [
  "sbNumber",
  "sbDate",
  "portCode",
  "invoiceNo",
  "buyerName",
  "currency",
  "fobMinor",
] as const;

function pushWarning(entry: FieldConfidenceEntry, message: string): void {
  if (!entry.warnings.includes(message)) {
    entry.warnings.push(message);
  }
}

function lowerConfidence(entry: FieldConfidenceEntry, maxConfidence: number): void {
  if (!entry.confirmed) {
    entry.confidence = Number(Math.min(entry.confidence, maxConfidence).toFixed(2));
  }
}

function ensureEntry(
  record: Record<string, FieldConfidenceEntry>,
  key: string
): FieldConfidenceEntry {
  if (!record[key]) {
    record[key] = {
      confidence: 0,
      source: null,
      method: "deterministic",
      confirmed: false,
      warnings: [],
    };
  }
  return record[key];
}

function isPlausibleDate(isoDate: string): boolean {
  const normalized = normalizeDateStringToIso(isoDate);
  if (!normalized || normalized !== isoDate) return false;
  const year = Number(isoDate.slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  return year >= 1995 && year <= currentYear + 1;
}

export function validateShippingBillDraft(
  draft: ParsedShippingBillDraft
): ShippingBillValidationSummary {
  const needsReview = new Set<string>();
  const validationErrors: string[] = [];

  const sbNumEntry = ensureEntry(draft.fieldConfidence, "sbNumber");
  if (!draft.sbNumber || !/^\d{6,8}$/.test(draft.sbNumber)) {
    lowerConfidence(sbNumEntry, 0.45);
    pushWarning(sbNumEntry, "Shipping Bill number must be 6 to 8 numeric digits");
    validationErrors.push("sbNumber");
  }

  const sbDateEntry = ensureEntry(draft.fieldConfidence, "sbDate");
  if (!draft.sbDate || !isPlausibleDate(draft.sbDate)) {
    lowerConfidence(sbDateEntry, 0.45);
    pushWarning(sbDateEntry, "Shipping Bill date is missing or outside plausible range");
    validationErrors.push("sbDate");
  }

  const leoEntry = ensureEntry(draft.fieldConfidence, "leoDate");
  if (draft.leoDate) {
    if (!isPlausibleDate(draft.leoDate)) {
      lowerConfidence(leoEntry, 0.45);
      pushWarning(leoEntry, "LEO date is not a valid plausible date");
      validationErrors.push("leoDate");
    } else if (draft.sbDate && draft.leoDate < draft.sbDate) {
      const sbMs = Date.parse(`${draft.sbDate}T00:00:00Z`);
      const leoMs = Date.parse(`${draft.leoDate}T00:00:00Z`);
      if (sbMs - leoMs > 7 * 24 * 60 * 60 * 1000) {
        lowerConfidence(leoEntry, 0.5);
        pushWarning(leoEntry, "LEO date precedes SB filing date by more than 7 days");
        validationErrors.push("leoDate");
      }
    }
  }

  const portEntry = ensureEntry(draft.fieldConfidence, "portCode");
  if (!draft.portCode || !/^[A-Z]{5}[0-9A-Z]$/.test(draft.portCode)) {
    lowerConfidence(portEntry, 0.5);
    pushWarning(portEntry, "Port code must match 6-character customs code (e.g. INNSA1)");
    validationErrors.push("portCode");
  }

  const invEntry = ensureEntry(draft.fieldConfidence, "invoiceNo");
  if (!draft.invoiceNo || draft.invoiceNo.trim().length < 2) {
    lowerConfidence(invEntry, 0.45);
    pushWarning(invEntry, "Invoice number is missing");
    validationErrors.push("invoiceNo");
  }

  const buyerEntry = ensureEntry(draft.fieldConfidence, "buyerName");
  if (!draft.buyerName || draft.buyerName.trim().length < 2) {
    lowerConfidence(buyerEntry, 0.5);
    pushWarning(buyerEntry, "Buyer / consignee name is missing");
    validationErrors.push("buyerName");
  }

  const currencyEntry = ensureEntry(draft.fieldConfidence, "currency");
  if (!draft.currency || !KNOWN_ISO_CURRENCIES.has(draft.currency.toUpperCase())) {
    lowerConfidence(currencyEntry, 0.45);
    pushWarning(currencyEntry, "Currency must be a recognized 3-letter ISO code");
    validationErrors.push("currency");
  }

  const fobEntry = ensureEntry(draft.fieldConfidence, "fobMinor");
  if (draft.fobMinor === null || !Number.isInteger(draft.fobMinor) || draft.fobMinor <= 0) {
    lowerConfidence(fobEntry, 0.4);
    pushWarning(fobEntry, "Total FOB value must be a positive amount");
    validationErrors.push("fobMinor");
  }

  if (draft.items.length === 0) {
    const itemsEntry = ensureEntry(draft.fieldConfidence, "items");
    lowerConfidence(itemsEntry, 0);
    pushWarning(itemsEntry, "At least one line item with 8-digit HS code is required");
    validationErrors.push("items");
    needsReview.add("items");
  } else {
    let itemsFobSum = 0;
    draft.items.forEach((item, index) => {
      itemsFobSum += item.fobMinor;
      const hsEntry = ensureEntry(item.fieldConfidence, "hsCode");
      if (!/^\d{8}$/.test(item.hsCode)) {
        lowerConfidence(hsEntry, 0.45);
        pushWarning(hsEntry, "HS code must be exactly 8 digits");
        validationErrors.push(`items[${index}].hsCode`);
      }

      const itemFobEntry = ensureEntry(item.fieldConfidence, "fobMinor");
      if (!Number.isInteger(item.fobMinor) || item.fobMinor <= 0) {
        lowerConfidence(itemFobEntry, 0.45);
        pushWarning(itemFobEntry, "Item FOB value must be positive");
        validationErrors.push(`items[${index}].fobMinor`);
      }

      const qtyEntry = ensureEntry(item.fieldConfidence, "quantity");
      const qtyNum = Number(item.quantity);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        lowerConfidence(qtyEntry, 0.5);
        pushWarning(qtyEntry, "Item quantity must be positive");
        validationErrors.push(`items[${index}].quantity`);
      }

      for (const [subKey, entry] of Object.entries(item.fieldConfidence)) {
        if (!entry.confirmed && entry.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
          needsReview.add(`items[${index}].${subKey}`);
        }
      }
    });

    if (draft.fobMinor !== null && draft.fobMinor > 0) {
      const tolerance = Math.max(100, Math.floor(draft.fobMinor / 100));
      if (Math.abs(itemsFobSum - draft.fobMinor) > tolerance) {
        lowerConfidence(fobEntry, 0.55);
        pushWarning(
          fobEntry,
          `Item FOB sum (${(itemsFobSum / 100).toFixed(2)}) does not match Total FOB (${(draft.fobMinor / 100).toFixed(2)})`
        );
        validationErrors.push("fobSumMismatch");
      }
    }
  }

  for (const field of REQUIRED_BILL_FIELDS) {
    const entry = ensureEntry(draft.fieldConfidence, field);
    if (!entry.confirmed && entry.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
      needsReview.add(field);
    }
  }

  // Optional fields that exist with low confidence (e.g., invalid LEO format or OCR fallback)
  for (const optionalKey of ["leoDate", "exchangeRate", "schemesClaimed"] as const) {
    const entry = draft.fieldConfidence[optionalKey];
    if (entry && !entry.confirmed && entry.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
      // Only gate on optional fields if there is an explicit warning/value issue
      if (entry.warnings.length > 0 && (optionalKey !== "leoDate" || draft.leoDate !== null)) {
        needsReview.add(optionalKey);
      }
    }
  }

  return {
    needsReviewFields: Array.from(needsReview),
    validationErrors,
    isValidForAutoConfirm: needsReview.size === 0 && validationErrors.length === 0,
  };
}

/**
 * Hard Rule 6 guard: Low-confidence or unconfirmed shipping bills must NEVER affect
 * matching, incentive expectations, or eBRC calculations until human confirmation.
 */
export function isShippingBillCalculationEligible(bill: {
  status: string;
  needsReviewFields?: readonly string[];
  confidenceConfirmedAt?: string | null;
}): boolean {
  if (bill.status === "needs_review" || bill.status === "queued") {
    return false;
  }
  if ((bill.needsReviewFields?.length ?? 0) > 0 && !bill.confidenceConfirmedAt) {
    return false;
  }
  return true;
}
