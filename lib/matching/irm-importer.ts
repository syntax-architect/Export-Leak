import { ValidationError } from "@/lib/auth/errors";
import { KNOWN_ISO_CURRENCIES, parseDecimalMoneyToMinorUnits } from "@/lib/documents/parsing/types";
import { readTabularSheets } from "@/lib/matching/spreadsheet";
import type {
  IrmCanonicalField,
  IrmColumnMapping,
  IrmImportParseResult,
  IrmImportPreview,
  IrmNormalizedRow,
  IrmRowError,
  RawTabularSheet,
} from "@/lib/matching/types";

const HEADER_SYNONYMS: Record<IrmCanonicalField, readonly string[]> = {
  irmNumber: [
    "irm no",
    "irm number",
    "irm ref",
    "irm reference",
    "firc / irm ref",
    "firc/irm",
    "irmno",
    "irm #",
    "firc number",
    "firc no",
    "remittance ref",
  ],
  bankName: ["ad bank name", "ad bank", "bank name", "bank", "remitting bank", "authorised dealer"],
  remittanceDate: [
    "irm issue date",
    "irm date",
    "remittance date",
    "credit date",
    "payment date",
    "value date",
    "realisation date",
    "realization date",
    "date of remittance",
    "date",
  ],
  currency: ["fcc", "currency", "ccy", "curr", "remittance currency", "currency code"],
  amount: [
    "irm amount",
    "remittance value",
    "remittance amount",
    "firc amount",
    "amount",
    "amt",
    "credit amount",
    "total amount",
    "inward amount",
  ],
  utilisedAmount: [
    "utilised amt",
    "utilized amt",
    "utilised amount",
    "utilized amount",
    "already utilised",
    "already utilized",
    "used amount",
    "matched amount",
  ],
  remitterName: [
    "remitter / buyer name",
    "buyer / remitter name",
    "remitter name",
    "remitter",
    "buyer name",
    "buyer",
    "ordering customer",
    "sender name",
  ],
  invoiceReference: [
    "remarks / ref",
    "payment narration",
    "invoice reference",
    "invoice ref",
    "invoice no",
    "invoice number",
    "narration",
    "remarks",
    "reference",
    "purpose / remarks",
    "ref",
  ],
  adCode: ["ad code", "ad_code", "bank ad code", "ad branch code"],
};

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function normalizeHeaderToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreHeaderMatch(header: string, synonyms: readonly string[]): number {
  const token = normalizeHeaderToken(header);
  if (!token) return 0;

  let best = 0;
  for (const synonym of synonyms) {
    if (token === synonym) return 100;
    if (token.includes(synonym)) {
      best = Math.max(best, 75);
    } else if (synonym.includes(token) && token.length >= 3) {
      best = Math.max(best, 55);
    }
  }
  return best;
}

function makeEmptyMapping(): IrmColumnMapping {
  return {
    irmNumber: null,
    bankName: null,
    remittanceDate: null,
    currency: null,
    amount: null,
    utilisedAmount: null,
    remitterName: null,
    invoiceReference: null,
    adCode: null,
  };
}

export function detectColumnMapping(headers: readonly string[]): {
  mapping: IrmColumnMapping;
  score: number;
} {
  const mapping = makeEmptyMapping();
  const candidates: Array<{ field: IrmCanonicalField; header: string; score: number }> = [];

  for (const field of Object.keys(HEADER_SYNONYMS) as IrmCanonicalField[]) {
    const synonyms = HEADER_SYNONYMS[field];
    for (const header of headers) {
      const score = scoreHeaderMatch(header, synonyms);
      if (score > 0) {
        candidates.push({ field, header, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const usedHeaders = new Set<string>();
  let totalScore = 0;

  for (const item of candidates) {
    if (mapping[item.field] !== null || usedHeaders.has(item.header)) continue;
    mapping[item.field] = item.header;
    usedHeaders.add(item.header);
    totalScore += item.score;
  }

  return { mapping, score: totalScore };
}

export function selectBestHeaderRow(sheet: RawTabularSheet): {
  headerRowIndex: number; // 0-based index in sheet.rows
  headers: string[];
  mapping: IrmColumnMapping;
  score: number;
} {
  const scanLimit = Math.min(sheet.rows.length, 25);
  let bestIdx = 0;
  let bestHeaders: string[] = [];
  let bestMapping = makeEmptyMapping();
  let bestScore = -1;

  for (let idx = 0; idx < scanLimit; idx += 1) {
    const rawRow = sheet.rows[idx] ?? [];
    const headers = rawRow.map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
    const nonEmptyCount = rawRow.filter((h) => h.trim().length > 0).length;
    if (nonEmptyCount < 3) continue;

    const { mapping, score } = detectColumnMapping(headers);
    const hasCoreColumns =
      Boolean(mapping.irmNumber) && Boolean(mapping.amount) && Boolean(mapping.remittanceDate);
    const effectiveScore = score + (hasCoreColumns ? 150 : 0);

    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      bestIdx = idx;
      bestHeaders = headers;
      bestMapping = mapping;
    }
  }

  return {
    headerRowIndex: bestIdx,
    headers: bestHeaders,
    mapping: bestMapping,
    score: bestScore,
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function normalizeIrmDate(rawInput: string): string | null {
  const raw = rawInput.trim();
  if (!raw) return null;

  // ISO YYYY-MM-DD or YYYY-MM-DDTHH...
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Numeric DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Indian convention)
  const dmyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const rawYear = Number(dmyMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Textual DD-MMM-YYYY or DD MMM YYYY
  const dMonYMatch = raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s](\d{2,4})$/);
  if (dMonYMatch) {
    const day = Number(dMonYMatch[1]);
    const month = MONTH_ABBR[dMonYMatch[2]!.toLowerCase()] ?? 0;
    const rawYear = Number(dMonYMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Excel serial date number (1900 epoch: 36526..73050 maps cleanly to 2000..2099)
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Math.floor(Number(raw));
    if (serial >= 36526 && serial <= 73050) {
      const utcMs = (serial - 25569) * 86400 * 1000;
      const dt = new Date(utcMs);
      const year = dt.getUTCFullYear();
      const month = dt.getUTCMonth() + 1;
      const day = dt.getUTCDate();
      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  return null;
}

export function normalizeIrmMoneyToMinor(rawInput: string): number | null {
  const cleaned = rawInput
    .replace(/(?:USD|EUR|GBP|INR|AED|SAR|SGD|JPY|AUD|CAD|CHF|CNY|RS\.?|₹|\$|€|£|¥)/gi, "")
    .trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("-")) return null;
  return parseDecimalMoneyToMinorUnits(cleaned);
}

function buildRowObject(
  headers: readonly string[],
  cells: readonly string[]
): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const key = headers[i] ?? `Column ${i + 1}`;
    record[key] = (cells[i] ?? "").trim();
  }
  return record;
}

function getMappedCell(
  record: Record<string, string>,
  headerName: string | null | undefined
): string {
  if (!headerName) return "";
  return (record[headerName] ?? "").trim();
}

export function normalizeIrmRows(params: {
  sheet: RawTabularSheet;
  headerRowIndex: number;
  headers: readonly string[];
  mapping: IrmColumnMapping;
}): {
  validRows: IrmNormalizedRow[];
  failedRows: IrmRowError[];
  totalDataRows: number;
} {
  const validRows: IrmNormalizedRow[] = [];
  const failedRows: IrmRowError[] = [];
  const dataRows = params.sheet.rows.slice(params.headerRowIndex + 1);

  for (let i = 0; i < dataRows.length; i += 1) {
    const cells = dataRows[i] ?? [];
    if (!cells.some((c) => c.trim().length > 0)) continue;

    const rowNumber = params.headerRowIndex + 2 + i;
    const raw = buildRowObject(params.headers, cells);
    const irmNumberRaw = getMappedCell(raw, params.mapping.irmNumber);
    const bankNameRaw = getMappedCell(raw, params.mapping.bankName);
    const dateRaw = getMappedCell(raw, params.mapping.remittanceDate);
    const currencyRaw = getMappedCell(raw, params.mapping.currency);
    const amountRaw = getMappedCell(raw, params.mapping.amount);
    const utilisedRaw = getMappedCell(raw, params.mapping.utilisedAmount);
    const remitterNameRaw = getMappedCell(raw, params.mapping.remitterName);
    const invoiceRefRaw = getMappedCell(raw, params.mapping.invoiceReference);
    const adCodeRaw = getMappedCell(raw, params.mapping.adCode);

    const reasons: string[] = [];

    const irmNumber = irmNumberRaw.trim().toUpperCase();
    if (!irmNumber) {
      reasons.push("Missing IRM / FIRC number");
    }

    const remittanceDate = normalizeIrmDate(dateRaw);
    if (!remittanceDate) {
      reasons.push(`Invalid or missing remittance date ("${dateRaw || "blank"}")`);
    }

    const currency = currencyRaw.trim().toUpperCase();
    if (!currency || !KNOWN_ISO_CURRENCIES.has(currency)) {
      reasons.push(`Unsupported or missing currency code ("${currencyRaw || "blank"}")`);
    }

    const amountMinor = normalizeIrmMoneyToMinor(amountRaw);
    if (amountMinor === null || amountMinor <= 0) {
      reasons.push(`Remittance amount must be a positive number ("${amountRaw || "blank"}")`);
    }

    let utilisedMinor = 0;
    if (params.mapping.utilisedAmount && utilisedRaw) {
      const parsedUtilised = normalizeIrmMoneyToMinor(utilisedRaw);
      if (parsedUtilised === null || parsedUtilised < 0) {
        reasons.push(`Invalid utilised amount ("${utilisedRaw}")`);
      } else {
        utilisedMinor = parsedUtilised;
      }
    }

    if (amountMinor !== null && utilisedMinor > amountMinor) {
      reasons.push("Utilised amount exceeds total IRM amount");
    }

    if (reasons.length > 0 || !remittanceDate || amountMinor === null) {
      failedRows.push({
        rowNumber,
        irmNumber: irmNumber || null,
        reason: reasons.join("; "),
        raw,
      });
      continue;
    }

    validRows.push({
      rowNumber,
      irmNumber,
      bankName: bankNameRaw || "Unknown Bank",
      remittanceDate,
      currency,
      amountMinor,
      utilisedMinor,
      remitterName: remitterNameRaw,
      invoiceReference: invoiceRefRaw,
      adCode: adCodeRaw || null,
      raw,
    });
  }

  return {
    validRows,
    failedRows,
    totalDataRows: validRows.length + failedRows.length,
  };
}

function chooseBestSheet(sheets: readonly RawTabularSheet[]): {
  sheet: RawTabularSheet;
  detection: ReturnType<typeof selectBestHeaderRow>;
} {
  let chosenSheet = sheets[0]!;
  let chosenDetection = selectBestHeaderRow(chosenSheet);

  for (let i = 1; i < sheets.length; i += 1) {
    const candidate = sheets[i]!;
    const detection = selectBestHeaderRow(candidate);
    if (detection.score > chosenDetection.score) {
      chosenSheet = candidate;
      chosenDetection = detection;
    }
  }

  return { sheet: chosenSheet, detection: chosenDetection };
}

export async function buildIrmImportPreview(params: {
  filename: string;
  bytes: Uint8Array;
  overrideMapping?: Partial<IrmColumnMapping>;
}): Promise<IrmImportPreview> {
  const sheets = await readTabularSheets(params.filename, params.bytes);
  const { sheet, detection } = chooseBestSheet(sheets);

  const mapping: IrmColumnMapping = {
    ...detection.mapping,
    ...(params.overrideMapping ?? {}),
  };

  const normalized = normalizeIrmRows({
    sheet,
    headerRowIndex: detection.headerRowIndex,
    headers: detection.headers,
    mapping,
  });

  return {
    filename: params.filename,
    sheetName: sheet.sheetName,
    headerRowNumber: detection.headerRowIndex + 1,
    headers: detection.headers,
    suggestedMapping: mapping,
    totalDataRows: normalized.totalDataRows,
    validCount: normalized.validRows.length,
    failedCount: normalized.failedRows.length,
    previewRows: normalized.validRows.slice(0, 10),
    failedRows: normalized.failedRows.slice(0, 25),
  };
}

export async function parseIrmSheetForImport(params: {
  filename: string;
  bytes: Uint8Array;
  columnMapping?: Partial<IrmColumnMapping>;
}): Promise<IrmImportParseResult> {
  const sheets = await readTabularSheets(params.filename, params.bytes);
  const { sheet, detection } = chooseBestSheet(sheets);

  const mapping: IrmColumnMapping = {
    ...detection.mapping,
    ...(params.columnMapping ?? {}),
  };

  if (!mapping.irmNumber || !mapping.remittanceDate || !mapping.currency || !mapping.amount) {
    throw new ValidationError(
      "Column mapping must include IRM Number, Remittance Date, Currency, and Amount."
    );
  }

  const normalized = normalizeIrmRows({
    sheet,
    headerRowIndex: detection.headerRowIndex,
    headers: detection.headers,
    mapping,
  });

  return {
    sheetName: sheet.sheetName,
    headerRowNumber: detection.headerRowIndex + 1,
    headers: detection.headers,
    mapping,
    totalDataRows: normalized.totalDataRows,
    validRows: normalized.validRows,
    failedRows: normalized.failedRows,
  };
}
