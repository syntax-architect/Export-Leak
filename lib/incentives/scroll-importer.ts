import { INCENTIVE_SCHEMES } from "@/config/incentives";
import type { IncentiveScheme } from "@/lib/database.types";
import {
  normalizeDateStringToIso,
  parseDecimalMoneyToMinorUnits,
} from "@/lib/documents/parsing/types";
import type {
  ParsedScrollCsvRow,
  ScrollCsvPreviewResult,
  ScrollCsvRowError,
} from "@/lib/incentives/types";
import { readTabularSheets } from "@/lib/matching/spreadsheet";

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

function findScrollHeaderRow(rows: string[][]): {
  headerIndex: number;
  cols: Record<string, number>;
  rawHeaders: string[];
} | null {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const rawHeaders = rows[i] ?? [];
    const normalized = rawHeaders.map(normalizeHeader);
    const cols: Record<string, number> = {};
    normalized.forEach((key, idx) => {
      if (key && cols[key] === undefined) {
        cols[key] = idx;
      }
    });

    const hasSb =
      cols["sb_number"] !== undefined ||
      cols["sb_no"] !== undefined ||
      cols["shipping_bill_no"] !== undefined ||
      cols["shipping_bill_number"] !== undefined;
    const hasScheme = cols["scheme"] !== undefined;
    const hasAmount =
      cols["credited_amount"] !== undefined ||
      cols["amount"] !== undefined ||
      cols["credited_inr"] !== undefined ||
      cols["scroll_amount"] !== undefined;

    if (hasSb && hasScheme && hasAmount) {
      return { headerIndex: i, cols, rawHeaders };
    }
  }
  return null;
}

/**
 * Parses a customs scroll / ledger export (.csv or .xlsx) into normalized credit rows,
 * returning row-numbered validation errors for any malformed rows.
 */
export async function parseScrollSpreadsheet(params: {
  filename: string;
  bytes: Uint8Array;
}): Promise<ScrollCsvPreviewResult> {
  const sheets = await readTabularSheets(params.filename, params.bytes);
  const firstSheet = sheets[0];
  if (!firstSheet || firstSheet.rows.length < 2) {
    return {
      totalDataRows: 0,
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          sbNumber: null,
          message:
            "File has no data rows. Required columns: sb_number, scheme, credited_amount (optional: credited_on, scroll_number).",
          rawRow: [],
        },
      ],
    };
  }

  const headerInfo = findScrollHeaderRow(firstSheet.rows);
  if (!headerInfo) {
    return {
      totalDataRows: firstSheet.rows.length,
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          sbNumber: null,
          message:
            "Could not locate required headers: sb_number (or sb_no), scheme, credited_amount (or amount).",
          rawRow: firstSheet.rows[0] ?? [],
        },
      ],
    };
  }

  const cols = headerInfo.cols;
  const sbIdx =
    cols["sb_number"] ?? cols["sb_no"] ?? cols["shipping_bill_no"] ?? cols["shipping_bill_number"]!;
  const schemeIdx = cols["scheme"]!;
  const amountIdx =
    cols["credited_amount"] ?? cols["amount"] ?? cols["credited_inr"] ?? cols["scroll_amount"]!;
  const creditedOnIdx = cols["credited_on"] ?? cols["scroll_date"] ?? cols["date"];
  const scrollNumberIdx = cols["scroll_number"] ?? cols["scroll_no"] ?? cols["ledger_ref"];

  const validRows: ParsedScrollCsvRow[] = [];
  const errors: ScrollCsvRowError[] = [];
  let totalDataRows = 0;

  for (let i = headerInfo.headerIndex + 1; i < firstSheet.rows.length; i += 1) {
    const rawRow = firstSheet.rows[i]!;
    if (rawRow.every((cell) => cell.trim().length === 0)) continue;

    const rowNumber = i + 1;
    totalDataRows += 1;

    const sbNumber = (rawRow[sbIdx] ?? "").trim().toUpperCase();
    if (!sbNumber) {
      errors.push({
        rowNumber,
        sbNumber: null,
        message: "Missing Shipping Bill number.",
        rawRow,
      });
      continue;
    }

    const rawScheme = rawRow[schemeIdx] ?? "";
    const scheme = normalizeScheme(rawScheme);
    if (!scheme) {
      errors.push({
        rowNumber,
        sbNumber,
        message: `Invalid scheme "${rawScheme}". Expected rodtep, drawback, or rosctl.`,
        rawRow,
      });
      continue;
    }

    const rawAmount = (rawRow[amountIdx] ?? "").replace(/[₹INR]/gi, "").trim();
    const creditedMinor = parseDecimalMoneyToMinorUnits(rawAmount);
    if (creditedMinor === null || creditedMinor < 0) {
      errors.push({
        rowNumber,
        sbNumber,
        message: `Unparseable credited_amount "${rawRow[amountIdx] ?? ""}".`,
        rawRow,
      });
      continue;
    }

    let creditedOn: string | null = null;
    if (creditedOnIdx !== undefined) {
      const rawDate = (rawRow[creditedOnIdx] ?? "").trim();
      if (rawDate) {
        creditedOn = normalizeDateStringToIso(rawDate);
        if (!creditedOn) {
          errors.push({
            rowNumber,
            sbNumber,
            message: `Invalid credited_on date "${rawDate}".`,
            rawRow,
          });
          continue;
        }
      }
    }

    const scrollNumber =
      scrollNumberIdx !== undefined ? (rawRow[scrollNumberIdx] ?? "").trim() : "";
    const rawObject: Record<string, string> = {};
    headerInfo.rawHeaders.forEach((header, idx) => {
      const key = header.trim() || `col_${idx + 1}`;
      rawObject[key] = rawRow[idx] ?? "";
    });

    validRows.push({
      rowNumber,
      sbNumber,
      scheme,
      creditedMinor,
      creditedOn,
      scrollNumber,
      raw: rawObject,
    });
  }

  return {
    totalDataRows,
    validRows,
    errors,
  };
}
