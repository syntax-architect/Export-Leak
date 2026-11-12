import ExcelJS from "exceljs";
import {
  EBRC_ADVANCE_PURPOSE_CODE,
  EBRC_DEFAULT_BRANCH_SL_NO,
  EBRC_HEADERS,
  EBRC_MAX_FILE_BYTES,
  EBRC_MAX_ROWS,
  EBRC_RESTRICTED_PURPOSE_CODES,
  EBRC_SHEET_NAME,
} from "@/config/ebrc";
import { isValidDgftPortCode } from "@/lib/ebrc/port-codes";

export interface BulkEbrcRowInput {
  rowId?: string;
  matchId?: string;
  shippingBillId?: string;
  remittanceId?: string;
  serialNumber: number | string;
  iecBranchSlNo: string;
  ifscCode: string;
  adCode: string;
  irmNumber: string;
  irmDate: string;
  irmCurrency: string;
  purposeCode: string;
  amountMinor?: number;
  amountInFcc: string;
  portCode: string;
  shippingBillNumber: string;
  shippingBillDate: string;
  expectedCurrency?: string;
  irmAvailableMinor?: number;
}

export interface BulkEbrcCellError {
  rowIndex: number;
  rowNumber: number;
  field: keyof BulkEbrcRowInput | "file";
  code: string;
  message: string;
  fixHint: string;
  autoFixable: boolean;
}

export interface BulkEbrcValidationSummary {
  valid: boolean;
  totalRows: number;
  errorRowsCount: number;
  autoFixableCount: number;
  totalAmountByCurrency: Record<string, number>;
  errors: BulkEbrcCellError[];
  rowErrorsByIndex: Record<number, BulkEbrcCellError[]>;
}

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const AD_CODE_REGEX = /^[A-Z0-9]{1,7}$/;
const BRANCH_SL_REGEX = /^[0-9]$/;
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;
const PURPOSE_CODE_REGEX = /^[A-Z][0-9]{4}$/;
const SB_NUMBER_REGEX = /^[A-Z0-9/-]{3,20}$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function buildValidIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > getDaysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatIsoDateToDgft(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function parseDgftDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  return buildValidIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

export function tryNormalizeDateToDgft(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already valid DD/MM/YYYY
  const strictIso = parseDgftDateToIso(trimmed);
  if (strictIso) return formatIsoDateToDgft(strictIso);

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const iso = buildValidIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return iso ? formatIsoDateToDgft(iso) : null;
  }

  // DD-MM-YYYY, DD.MM.YYYY, D/M/YYYY
  const dmyMatch = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const iso = buildValidIsoDate(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
    return iso ? formatIsoDateToDgft(iso) : null;
  }

  return null;
}

/**
 * Exact integer minor-unit parser using string decimal split (never float multiplication).
 */
export function parseDecimalToMinorUnitsExact(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number.parseInt(match[1] ?? "0", 10);
  const fracPadded = (match[2] ?? "").padEnd(2, "0");
  const frac = Number.parseInt(fracPadded, 10);
  const total = whole * 100 + frac;
  if (!Number.isSafeInteger(total)) return null;
  return total;
}

export function formatMinorUnitsForExcel(minorUnits: number): string {
  const safe = Number.isFinite(minorUnits) ? Math.max(0, Math.round(minorUnits)) : 0;
  const whole = Math.floor(safe / 100);
  const frac = String(safe % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export function autoFixBulkEbrcRows(rows: readonly BulkEbrcRowInput[]): {
  rows: BulkEbrcRowInput[];
  fixesApplied: number;
} {
  let fixesApplied = 0;

  const fixed = rows.map((row, idx) => {
    const next: BulkEbrcRowInput = { ...row };
    const expectedSerial = idx + 1;
    if (String(next.serialNumber).trim() !== String(expectedSerial)) {
      next.serialNumber = expectedSerial;
      fixesApplied += 1;
    }

    const branchTrim = (next.iecBranchSlNo ?? "").trim();
    if (!branchTrim) {
      next.iecBranchSlNo = EBRC_DEFAULT_BRANCH_SL_NO;
      fixesApplied += 1;
    } else if (branchTrim !== next.iecBranchSlNo) {
      next.iecBranchSlNo = branchTrim;
      fixesApplied += 1;
    }

    const upperFields: Array<
      "ifscCode" | "adCode" | "irmCurrency" | "purposeCode" | "portCode" | "shippingBillNumber"
    > = ["ifscCode", "adCode", "irmCurrency", "purposeCode", "portCode", "shippingBillNumber"];

    for (const key of upperFields) {
      const normalized = (next[key] ?? "").trim().toUpperCase();
      if (normalized !== next[key]) {
        next[key] = normalized;
        fixesApplied += 1;
      }
    }

    const trimmedIrm = (next.irmNumber ?? "").trim();
    if (trimmedIrm !== next.irmNumber) {
      next.irmNumber = trimmedIrm;
      fixesApplied += 1;
    }

    const normIrmDate = tryNormalizeDateToDgft(next.irmDate ?? "");
    if (normIrmDate && normIrmDate !== next.irmDate) {
      next.irmDate = normIrmDate;
      fixesApplied += 1;
    }

    const normSbDate = tryNormalizeDateToDgft(next.shippingBillDate ?? "");
    if (normSbDate && normSbDate !== next.shippingBillDate) {
      next.shippingBillDate = normSbDate;
      fixesApplied += 1;
    }

    const minor = parseDecimalToMinorUnitsExact(next.amountInFcc ?? "");
    if (minor !== null && minor > 0) {
      const formattedAmount = formatMinorUnitsForExcel(minor);
      if (formattedAmount !== next.amountInFcc) {
        next.amountInFcc = formattedAmount;
        next.amountMinor = minor;
        fixesApplied += 1;
      }
    }

    return next;
  });

  return { rows: fixed, fixesApplied };
}

function pushCellError(
  errors: BulkEbrcCellError[],
  rowErrorsByIndex: Record<number, BulkEbrcCellError[]>,
  err: BulkEbrcCellError
) {
  errors.push(err);
  if (!rowErrorsByIndex[err.rowIndex]) {
    rowErrorsByIndex[err.rowIndex] = [];
  }
  rowErrorsByIndex[err.rowIndex]!.push(err);
}

export function validateBulkEbrcRows(
  rows: readonly BulkEbrcRowInput[],
  options?: {
    fileByteSize?: number;
    irmBalanceCapMinorByNumber?: Record<string, number>;
    futureCutoffIso?: string;
  }
): BulkEbrcValidationSummary {
  const errors: BulkEbrcCellError[] = [];
  const rowErrorsByIndex: Record<number, BulkEbrcCellError[]> = {};
  const totalAmountByCurrency: Record<string, number> = {};

  if (options?.fileByteSize !== undefined && options.fileByteSize > EBRC_MAX_FILE_BYTES) {
    pushCellError(errors, rowErrorsByIndex, {
      rowIndex: -1,
      rowNumber: 0,
      field: "file",
      code: "FILE_SIZE_EXCEEDED",
      message: `File size exceeds the DGFT maximum limit of 5 MB.`,
      fixHint: "Split rows into smaller batches under 5 MB before uploading on DGFT.",
      autoFixable: false,
    });
  }

  if (rows.length === 0) {
    pushCellError(errors, rowErrorsByIndex, {
      rowIndex: -1,
      rowNumber: 0,
      field: "file",
      code: "EMPTY_ROWS",
      message: "No matched rows to include in the bulk eBRC file.",
      fixHint: "Confirm at least one IRM–Shipping Bill match or add rows first.",
      autoFixable: false,
    });
  }

  if (rows.length > EBRC_MAX_ROWS) {
    pushCellError(errors, rowErrorsByIndex, {
      rowIndex: -1,
      rowNumber: 0,
      field: "file",
      code: "ROW_LIMIT_EXCEEDED",
      message: `DGFT accepts at most ${EBRC_MAX_ROWS} data rows per upload (found ${rows.length}).`,
      fixHint: "Filter by date range or IRMs to split into batches of 999 rows or fewer.",
      autoFixable: false,
    });
  }

  const seenSerials = new Set<number>();
  const sbCurrencyMap = new Map<string, string>();
  const irmCurrencyMap = new Map<string, string>();
  const irmAllocatedSumMinor = new Map<string, number>();
  const irmCapMinor = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;

    // 1. Serial Number
    const serialStr = String(row.serialNumber ?? "").trim();
    const serialVal = /^\d+$/.test(serialStr) ? Number.parseInt(serialStr, 10) : NaN;
    if (!Number.isInteger(serialVal) || serialVal < 1 || serialVal > EBRC_MAX_ROWS) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "serialNumber",
        code: "INVALID_SERIAL",
        message: "Serial Number must be an integer between 1 and 999.",
        fixHint: `Set Serial Number to ${rowNumber}.`,
        autoFixable: true,
      });
    } else if (seenSerials.has(serialVal)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "serialNumber",
        code: "DUPLICATE_SERIAL",
        message: `Duplicate Serial Number ${serialVal}. Each row requires a unique sequence number.`,
        fixHint: "Run Auto-fix to renumber rows sequentially (1..N).",
        autoFixable: true,
      });
    } else {
      seenSerials.add(serialVal);
    }

    // 2. IEC Branch Sl. No.
    const branch = (row.iecBranchSlNo ?? "").trim();
    if (!BRANCH_SL_REGEX.test(branch)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "iecBranchSlNo",
        code: "INVALID_BRANCH_SL",
        message: "IEC Branch Sl. No. must be a single digit (0–9).",
        fixHint: 'Use "0" for main head office or your registered DGFT branch digit.',
        autoFixable: branch.length === 0,
      });
    }

    // 3. IFSC Code
    const rawIfsc = row.ifscCode ?? "";
    const normIfsc = rawIfsc.trim().toUpperCase();
    if (!normIfsc) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "ifscCode",
        code: "MISSING_IFSC",
        message: "Bank IFSC Code is required.",
        fixHint: "Enter the 11-character IFSC of the AD bank branch that received the IRM.",
        autoFixable: false,
      });
    } else if (!IFSC_REGEX.test(normIfsc)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "ifscCode",
        code: "INVALID_IFSC",
        message: `Invalid IFSC Code "${rawIfsc}". Must be 11 characters (e.g. HDFC0000240).`,
        fixHint: "Check your AD bank branch IFSC (5th character must be zero '0').",
        autoFixable: false,
      });
    } else if (rawIfsc !== normIfsc) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "ifscCode",
        code: "FORMAT_IFSC",
        message: "IFSC Code contains spaces or lowercase letters.",
        fixHint: `Change to ${normIfsc}.`,
        autoFixable: true,
      });
    }

    // 4. AD Code
    const rawAd = row.adCode ?? "";
    const normAd = rawAd.trim().toUpperCase();
    if (!normAd) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "adCode",
        code: "MISSING_AD_CODE",
        message: "AD Code is required.",
        fixHint: "Enter your 7-character bank AD code registered with customs.",
        autoFixable: false,
      });
    } else if (!AD_CODE_REGEX.test(normAd)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "adCode",
        code: "INVALID_AD_CODE",
        message: `AD Code "${rawAd}" must be 1–7 alphanumeric characters.`,
        fixHint: "Remove hyphens or extra digits so AD Code is up to 7 characters.",
        autoFixable: false,
      });
    }

    // 5. IRM Number
    const irmNum = (row.irmNumber ?? "").trim();
    if (!irmNum || irmNum.length > 50) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmNumber",
        code: "INVALID_IRM_NUMBER",
        message: "IRM Number is required and must be 50 characters or fewer.",
        fixHint: "Copy the exact IRM number from your DGFT EDPMS / bank sheet.",
        autoFixable: false,
      });
    }

    // 6. IRM Date
    const rawIrmDate = row.irmDate ?? "";
    const irmDateIso = parseDgftDateToIso(rawIrmDate);
    if (!irmDateIso) {
      const fixableDate = tryNormalizeDateToDgft(rawIrmDate);
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmDate",
        code: "INVALID_IRM_DATE",
        message: `IRM Date "${rawIrmDate}" must strictly be DD/MM/YYYY.`,
        fixHint: fixableDate
          ? `Click Auto-fix to convert to ${fixableDate}.`
          : "Enter a valid calendar date in DD/MM/YYYY format.",
        autoFixable: fixableDate !== null,
      });
    } else if (options?.futureCutoffIso && irmDateIso > options.futureCutoffIso) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmDate",
        code: "FUTURE_IRM_DATE",
        message: `IRM Date ${rawIrmDate} is in the future.`,
        fixHint: "Verify the actual remittance credit date on the IRM.",
        autoFixable: false,
      });
    }

    // 7. IRM Currency & Same-Currency Clubbing
    const rawCurr = row.irmCurrency ?? "";
    const normCurr = rawCurr.trim().toUpperCase();
    if (!ISO_CURRENCY_REGEX.test(normCurr)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmCurrency",
        code: "INVALID_CURRENCY",
        message: `IRM Currency "${rawCurr}" must be a 3-letter ISO currency code (e.g. USD).`,
        fixHint: "Use a valid 3-letter uppercase ISO currency code.",
        autoFixable: rawCurr !== normCurr && ISO_CURRENCY_REGEX.test(normCurr),
      });
    } else if (rawCurr !== normCurr) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmCurrency",
        code: "FORMAT_CURRENCY",
        message: "Currency code must be uppercase.",
        fixHint: `Change to ${normCurr}.`,
        autoFixable: true,
      });
    }

    if (
      row.expectedCurrency &&
      normCurr &&
      row.expectedCurrency.trim().toUpperCase() !== normCurr
    ) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmCurrency",
        code: "CURRENCY_MISMATCH",
        message: `Row currency ${normCurr} does not match linked record currency ${row.expectedCurrency}.`,
        fixHint: `Change IRM Currency back to ${row.expectedCurrency}; DGFT does not allow cross-currency clubbing.`,
        autoFixable: false,
      });
    }

    // 8. Purpose Code
    const rawPurpose = row.purposeCode ?? "";
    const normPurpose = rawPurpose.trim().toUpperCase();
    if (!PURPOSE_CODE_REGEX.test(normPurpose)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "purposeCode",
        code: "INVALID_PURPOSE_CODE",
        message: `Purpose Code "${rawPurpose}" must be a 5-character RBI code (e.g. P0102).`,
        fixHint: "Enter the RBI export purpose code shown on your bank IRM (e.g. P0102).",
        autoFixable: rawPurpose !== normPurpose && PURPOSE_CODE_REGEX.test(normPurpose),
      });
    } else if ((EBRC_RESTRICTED_PURPOSE_CODES as readonly string[]).includes(normPurpose)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "purposeCode",
        code: "RESTRICTED_PURPOSE_CODE",
        message: `Purpose code ${normPurpose} is restricted and rejected by DGFT Bulk eBRC.`,
        fixHint:
          "Only eligible export realisation purpose codes (such as P0102 or P0103) can be uploaded in Bulk eBRC.",
        autoFixable: false,
      });
    }

    // 9. Amount in FCC & Balance check
    const amountMinor = parseDecimalToMinorUnitsExact(row.amountInFcc ?? "");
    if (amountMinor === null || amountMinor <= 0) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "amountInFcc",
        code: "INVALID_AMOUNT",
        message: `Amount in FCC "${row.amountInFcc}" must be greater than zero with at most 2 decimals.`,
        fixHint: "Enter a positive numeric amount such as 18500.00.",
        autoFixable: false,
      });
    } else if (normCurr) {
      totalAmountByCurrency[normCurr] = (totalAmountByCurrency[normCurr] ?? 0) + amountMinor;
    }

    if (irmNum && amountMinor !== null && amountMinor > 0) {
      irmAllocatedSumMinor.set(irmNum, (irmAllocatedSumMinor.get(irmNum) ?? 0) + amountMinor);
      const explicitCap = options?.irmBalanceCapMinorByNumber?.[irmNum] ?? row.irmAvailableMinor;
      if (typeof explicitCap === "number") {
        const existingCap = irmCapMinor.get(irmNum);
        irmCapMinor.set(
          irmNum,
          existingCap === undefined ? explicitCap : Math.min(existingCap, explicitCap)
        );
      }
    }

    // 10. Port Code (validated strictly against data file)
    const rawPort = row.portCode ?? "";
    const normPort = rawPort.trim().toUpperCase();
    if (!normPort || !isValidDgftPortCode(normPort)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "portCode",
        code: "INVALID_PORT_CODE",
        message: `Port Code "${rawPort}" is not in the DGFT/ICEGATE customs port list.`,
        fixHint:
          "Enter a valid 6-character Indian port code such as INNSA1, INBOM4, INTUT6, or INMAA4.",
        autoFixable: false,
      });
    } else if (rawPort !== normPort) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "portCode",
        code: "FORMAT_PORT_CODE",
        message: "Port Code must be uppercase with no spaces.",
        fixHint: `Change to ${normPort}.`,
        autoFixable: true,
      });
    }

    // 11. Shipping Bill Number
    const normSb = (row.shippingBillNumber ?? "").trim().toUpperCase();
    if (!SB_NUMBER_REGEX.test(normSb)) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "shippingBillNumber",
        code: "INVALID_SB_NUMBER",
        message: `Shipping Bill Number "${row.shippingBillNumber}" is missing or malformed.`,
        fixHint: "Enter the 7-digit Customs Shipping Bill number.",
        autoFixable: false,
      });
    }

    // Cross-row same-currency checks (per SB and per IRM)
    if (normSb && normCurr) {
      const prevCurr = sbCurrencyMap.get(normSb);
      if (prevCurr && prevCurr !== normCurr) {
        pushCellError(errors, rowErrorsByIndex, {
          rowIndex: index,
          rowNumber,
          field: "irmCurrency",
          code: "CROSS_CURRENCY_CLUBBING",
          message: `Shipping Bill ${normSb} mixes ${prevCurr} and ${normCurr}. Same-currency clubbing only is allowed.`,
          fixHint: "Keep all rows clubbed under one Shipping Bill in the same currency.",
          autoFixable: false,
        });
      } else {
        sbCurrencyMap.set(normSb, normCurr);
      }
    }

    if (irmNum && normCurr) {
      const prevIrmCurr = irmCurrencyMap.get(irmNum);
      if (prevIrmCurr && prevIrmCurr !== normCurr) {
        pushCellError(errors, rowErrorsByIndex, {
          rowIndex: index,
          rowNumber,
          field: "irmCurrency",
          code: "IRM_CURRENCY_CONFLICT",
          message: `IRM ${irmNum} cannot have multiple currencies (${prevIrmCurr} vs ${normCurr}).`,
          fixHint: `Set IRM Currency consistently to ${prevIrmCurr}.`,
          autoFixable: false,
        });
      } else {
        irmCurrencyMap.set(irmNum, normCurr);
      }
    }

    // 12. Shipping Bill Date & chronological check
    const rawSbDate = row.shippingBillDate ?? "";
    const sbDateIso = parseDgftDateToIso(rawSbDate);
    if (!sbDateIso) {
      const fixableSbDate = tryNormalizeDateToDgft(rawSbDate);
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "shippingBillDate",
        code: "INVALID_SB_DATE",
        message: `Shipping Bill Date "${rawSbDate}" must strictly be DD/MM/YYYY.`,
        fixHint: fixableSbDate
          ? `Click Auto-fix to convert to ${fixableSbDate}.`
          : "Enter a valid calendar date in DD/MM/YYYY format.",
        autoFixable: fixableSbDate !== null,
      });
    } else if (irmDateIso && sbDateIso > irmDateIso && normPurpose !== EBRC_ADVANCE_PURPOSE_CODE) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber,
        field: "irmDate",
        code: "IRM_BEFORE_SB_DATE",
        message: `IRM Date (${rawIrmDate}) is earlier than Shipping Bill Date (${rawSbDate}) without advance purpose code ${EBRC_ADVANCE_PURPOSE_CODE}.`,
        fixHint: `Use purpose code ${EBRC_ADVANCE_PURPOSE_CODE} for advance remittances, or verify the dates.`,
        autoFixable: false,
      });
    }
  });

  // Check aggregate IRM balance cap across rows
  rows.forEach((row, index) => {
    const irmNum = (row.irmNumber ?? "").trim();
    if (!irmNum) return;
    const allocated = irmAllocatedSumMinor.get(irmNum) ?? 0;
    const cap = irmCapMinor.get(irmNum);
    if (typeof cap === "number" && allocated > cap) {
      pushCellError(errors, rowErrorsByIndex, {
        rowIndex: index,
        rowNumber: index + 1,
        field: "amountInFcc",
        code: "IRM_BALANCE_EXCEEDED",
        message: `Total allocated for IRM ${irmNum} (${formatMinorUnitsForExcel(allocated)}) exceeds available IRM balance (${formatMinorUnitsForExcel(cap)}).`,
        fixHint: `Reduce Amount in FCC across rows using IRM ${irmNum} so the total is <= ${formatMinorUnitsForExcel(cap)}.`,
        autoFixable: false,
      });
    }
  });

  const errorRowIndexes = Object.keys(rowErrorsByIndex).filter((k) => Number(k) >= 0);
  const autoFixableCount = errors.filter((e) => e.autoFixable).length;

  return {
    valid: errors.length === 0,
    totalRows: rows.length,
    errorRowsCount: errorRowIndexes.length,
    autoFixableCount,
    totalAmountByCurrency,
    errors,
    rowErrorsByIndex,
  };
}

function readCellText(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    // Signal Excel Date object directly as ISO so validator flags non-DD/MM/YYYY text if auto-converted, or auto-fix converts cleanly
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "object") {
    if ("result" in val && val.result !== undefined) {
      return String(val.result).trim();
    }
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in val && typeof val.text === "string") {
      return val.text.trim();
    }
  }
  return String(val).trim();
}

export async function parseBulkEbrcWorkbook(buffer: Buffer): Promise<{
  sheetName: string;
  headers: string[];
  rows: BulkEbrcRowInput[];
  headerErrors: BulkEbrcCellError[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);

  const headerErrors: BulkEbrcCellError[] = [];
  const worksheet = workbook.getWorksheet(EBRC_SHEET_NAME) ?? workbook.worksheets[0];

  if (!worksheet) {
    headerErrors.push({
      rowIndex: -1,
      rowNumber: 0,
      field: "file",
      code: "NO_WORKSHEET",
      message: "No worksheet found in uploaded Excel file.",
      fixHint: `Upload a .xlsx workbook containing the "${EBRC_SHEET_NAME}" sheet.`,
      autoFixable: false,
    });
    return { sheetName: "", headers: [], rows: [], headerErrors };
  }

  if (worksheet.name !== EBRC_SHEET_NAME) {
    headerErrors.push({
      rowIndex: -1,
      rowNumber: 0,
      field: "file",
      code: "WRONG_SHEET_NAME",
      message: `Expected worksheet named "${EBRC_SHEET_NAME}", found "${worksheet.name}".`,
      fixHint: `Rename the worksheet tab to "${EBRC_SHEET_NAME}".`,
      autoFixable: false,
    });
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  for (let col = 1; col <= EBRC_HEADERS.length; col += 1) {
    headers.push(readCellText(headerRow.getCell(col)));
  }

  EBRC_HEADERS.forEach((expectedHeader, idx) => {
    if (headers[idx] !== expectedHeader) {
      headerErrors.push({
        rowIndex: -1,
        rowNumber: 1,
        field: "file",
        code: "HEADER_MISMATCH",
        message: `Column ${idx + 1} header must be "${expectedHeader}", found "${headers[idx] ?? ""}".`,
        fixHint: "Use the exact DGFT sample template column order and header names.",
        autoFixable: false,
      });
    }
  });

  const rows: BulkEbrcRowInput[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const rawAmount = readCellText(row.getCell(9));
    const parsedMinor = parseDecimalToMinorUnitsExact(rawAmount);
    rows.push({
      rowId: `xlsx-row-${rowNumber - 1}`,
      serialNumber: readCellText(row.getCell(1)),
      iecBranchSlNo: readCellText(row.getCell(2)),
      ifscCode: readCellText(row.getCell(3)),
      adCode: readCellText(row.getCell(4)),
      irmNumber: readCellText(row.getCell(5)),
      irmDate: readCellText(row.getCell(6)),
      irmCurrency: readCellText(row.getCell(7)),
      purposeCode: readCellText(row.getCell(8)),
      amountMinor: parsedMinor ?? undefined,
      amountInFcc: parsedMinor !== null ? formatMinorUnitsForExcel(parsedMinor) : rawAmount,
      portCode: readCellText(row.getCell(10)),
      shippingBillNumber: readCellText(row.getCell(11)),
      shippingBillDate: readCellText(row.getCell(12)),
    });
  });

  return {
    sheetName: worksheet.name,
    headers,
    rows,
    headerErrors,
  };
}
