import { INCENTIVE_SCHEMES } from "@/config/incentives";
import type { IncentiveScheme } from "@/lib/database.types";
import {
  normalizeDateStringToIso,
  parseDecimalMoneyToMinorUnits,
} from "@/lib/documents/parsing/types";
import type {
  IncentiveRateRecord,
  ParsedRateCsvRow,
  RateCsvPreviewResult,
  RateCsvRowError,
} from "@/lib/incentives/types";
import { readTabularSheets } from "@/lib/matching/spreadsheet";

const OPEN_END_DATE = "9999-12-31";

function normalizeHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeScheme(raw: string): IncentiveScheme | null {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "duty_drawback" || cleaned === "dbk" || cleaned === "duty drawback") {
    return "drawback";
  }
  if ((INCENTIVE_SCHEMES as readonly string[]).includes(cleaned)) {
    return cleaned as IncentiveScheme;
  }
  return null;
}

function datesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
): boolean {
  const effAEnd = aEnd ?? OPEN_END_DATE;
  const effBEnd = bEnd ?? OPEN_END_DATE;
  return aStart <= effBEnd && effAEnd >= bStart;
}

function findHeaderRow(rows: string[][]): {
  headerIndex: number;
  cols: Record<string, number>;
} | null {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const normalized = rows[i]!.map(normalizeHeader);
    const map: Record<string, number> = {};
    normalized.forEach((key, idx) => {
      if (key && map[key] === undefined) {
        map[key] = idx;
      }
    });

    const hasScheme = map["scheme"] !== undefined;
    const hasHs =
      map["hs_code"] !== undefined || map["hs"] !== undefined || map["itc_hs"] !== undefined;
    const hasRate = map["rate_bps"] !== undefined;
    const hasEffFrom = map["effective_from"] !== undefined;

    if (hasScheme && hasHs && hasRate && hasEffFrom) {
      return { headerIndex: i, cols: map };
    }
  }
  return null;
}

/**
 * Parses and validates an admin incentive-rate CSV/XLSX import against schema rules
 * and both intra-batch and existing DB effective-date ranges.
 */
export async function parseAndValidateRatesSpreadsheet(params: {
  filename: string;
  bytes: Uint8Array;
  existingRates?: readonly IncentiveRateRecord[];
}): Promise<RateCsvPreviewResult> {
  const sheets = await readTabularSheets(params.filename, params.bytes);
  const firstSheet = sheets[0];
  if (!firstSheet || firstSheet.rows.length < 2) {
    return {
      totalDataRows: 0,
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          message:
            "File has no data rows. Required columns: scheme, hs_code, rate_bps, cap_per_unit, uqc, effective_from, effective_to, source_note.",
          rawRow: [],
        },
      ],
    };
  }

  const headerInfo = findHeaderRow(firstSheet.rows);
  if (!headerInfo) {
    return {
      totalDataRows: firstSheet.rows.length,
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          message:
            "Could not locate required headers: scheme, hs_code, rate_bps, effective_from (optional: cap_per_unit, uqc, effective_to, source_note).",
          rawRow: firstSheet.rows[0] ?? [],
        },
      ],
    };
  }

  const cols = headerInfo.cols;
  const schemeIdx = cols["scheme"]!;
  const hsIdx = cols["hs_code"] ?? cols["hs"] ?? cols["itc_hs"]!;
  const rateBpsIdx = cols["rate_bps"]!;
  const capUnitIdx = cols["cap_per_unit"];
  const capMinorIdx = cols["cap_per_unit_minor"];
  const uqcIdx = cols["uqc"];
  const effFromIdx = cols["effective_from"]!;
  const effToIdx = cols["effective_to"];
  const noteIdx = cols["source_note"];

  const validRows: ParsedRateCsvRow[] = [];
  const errors: RateCsvRowError[] = [];
  let totalDataRows = 0;

  for (let i = headerInfo.headerIndex + 1; i < firstSheet.rows.length; i += 1) {
    const rawRow = firstSheet.rows[i]!;
    if (rawRow.every((cell) => cell.trim().length === 0)) continue;

    const rowNumber = i + 1;
    totalDataRows += 1;

    const rawScheme = rawRow[schemeIdx] ?? "";
    const scheme = normalizeScheme(rawScheme);
    if (!scheme) {
      errors.push({
        rowNumber,
        message: `Invalid scheme "${rawScheme}". Must be rodtep, drawback, or rosctl.`,
        rawRow,
      });
      continue;
    }

    const hsCode = (rawRow[hsIdx] ?? "").replace(/\s+/g, "");
    if (!/^[0-9]{8}$/.test(hsCode)) {
      errors.push({
        rowNumber,
        message: `HS code "${rawRow[hsIdx] ?? ""}" must be an exact 8-digit code.`,
        rawRow,
      });
      continue;
    }

    const rawRateBps = (rawRow[rateBpsIdx] ?? "").trim();
    if (!/^[0-9]+$/.test(rawRateBps)) {
      errors.push({
        rowNumber,
        message: `rate_bps "${rawRateBps}" must be a non-negative integer basis points value (e.g. 150 = 1.50%).`,
        rawRow,
      });
      continue;
    }
    const rateBps = Number(rawRateBps);
    if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 50_000) {
      errors.push({
        rowNumber,
        message: `rate_bps ${rateBps} is out of allowed range (0..50000).`,
        rawRow,
      });
      continue;
    }

    let capPerUnitMinor: number | null = null;
    if (capMinorIdx !== undefined && (rawRow[capMinorIdx] ?? "").trim() !== "") {
      const rawMinor = (rawRow[capMinorIdx] ?? "").trim();
      if (!/^[0-9]+$/.test(rawMinor)) {
        errors.push({
          rowNumber,
          message: `cap_per_unit_minor "${rawMinor}" must be a non-negative integer.`,
          rawRow,
        });
        continue;
      }
      capPerUnitMinor = Number(rawMinor);
    } else if (capUnitIdx !== undefined) {
      const rawCap = (rawRow[capUnitIdx] ?? "").trim();
      if (rawCap && !/^(null|none|na|n\/a|-)$/i.test(rawCap)) {
        const parsedCap = parseDecimalMoneyToMinorUnits(rawCap);
        if (parsedCap === null || parsedCap < 0) {
          errors.push({
            rowNumber,
            message: `Invalid cap_per_unit "${rawCap}". Provide decimal INR (e.g. 2.50) or leave blank.`,
            rawRow,
          });
          continue;
        }
        capPerUnitMinor = parsedCap;
      }
    }

    const uqcRaw = uqcIdx !== undefined ? (rawRow[uqcIdx] ?? "").trim().toUpperCase() : "";
    const uqc = uqcRaw && !/^(null|none|na|n\/a|-)$/i.test(uqcRaw) ? uqcRaw : null;

    const rawEffFrom = (rawRow[effFromIdx] ?? "").trim();
    const effectiveFrom = normalizeDateStringToIso(rawEffFrom);
    if (!effectiveFrom) {
      errors.push({
        rowNumber,
        message: `Invalid effective_from date "${rawEffFrom}". Use YYYY-MM-DD or DD/MM/YYYY.`,
        rawRow,
      });
      continue;
    }

    const rawEffTo = effToIdx !== undefined ? (rawRow[effToIdx] ?? "").trim() : "";
    let effectiveTo: string | null = null;
    if (rawEffTo && !/^(null|none|open|-)$/i.test(rawEffTo)) {
      effectiveTo = normalizeDateStringToIso(rawEffTo);
      if (!effectiveTo) {
        errors.push({
          rowNumber,
          message: `Invalid effective_to date "${rawEffTo}". Use YYYY-MM-DD or leave blank for open-ended.`,
          rawRow,
        });
        continue;
      }
      if (effectiveTo < effectiveFrom) {
        errors.push({
          rowNumber,
          message: `effective_to (${effectiveTo}) cannot precede effective_from (${effectiveFrom}).`,
          rawRow,
        });
        continue;
      }
    }

    const batchConflict = validRows.find(
      (existing) =>
        existing.scheme === scheme &&
        existing.hsCode === hsCode &&
        datesOverlap(existing.effectiveFrom, existing.effectiveTo, effectiveFrom, effectiveTo)
    );
    if (batchConflict) {
      errors.push({
        rowNumber,
        message: `Overlaps with row ${batchConflict.rowNumber} for (${scheme}, ${hsCode}) [${batchConflict.effectiveFrom}..${batchConflict.effectiveTo ?? "open"}].`,
        rawRow,
      });
      continue;
    }

    const dbConflict = (params.existingRates ?? []).find(
      (existing) =>
        existing.scheme === scheme &&
        existing.hsCode === hsCode &&
        datesOverlap(existing.effectiveFrom, existing.effectiveTo, effectiveFrom, effectiveTo)
    );
    if (dbConflict) {
      errors.push({
        rowNumber,
        message: `Overlaps with existing rate row (${dbConflict.effectiveFrom}..${dbConflict.effectiveTo ?? "open"}) for (${scheme}, ${hsCode}).`,
        rawRow,
      });
      continue;
    }

    const sourceNote = noteIdx !== undefined ? (rawRow[noteIdx] ?? "").trim() : "";

    validRows.push({
      rowNumber,
      scheme,
      hsCode,
      rateBps,
      capPerUnitMinor,
      uqc,
      effectiveFrom,
      effectiveTo,
      sourceNote,
    });
  }

  return {
    totalDataRows,
    validRows,
    errors,
  };
}
