import ExcelJS from "exceljs";
import { ValidationError } from "@/lib/auth/errors";
import { getDocumentExtension } from "@/lib/documents/file-security";
import type { RawTabularSheet } from "@/lib/matching/types";

function formatUtcDateToIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return formatUtcDateToIso(value);
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) {
      return cellValueToString(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("error" in value) {
      return "";
    }
  }
  return String(value).trim();
}

function detectCsvDelimiter(sample: string): "," | ";" | "\t" {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  let inQuotes = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (let i = 0; i < firstLine.length; i += 1) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) {
      counts[ch] += 1;
    }
  }
  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

export function parseCsvRows(textInput: string): string[][] {
  const text = textInput.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((v) => v.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function parseHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowHtml.match(/<(td|th)\b[^>]*>[\s\S]*?<\/(td|th)>/gi) ?? [];
    for (const cellHtml of cellMatches) {
      const stripped = decodeHtmlEntities(cellHtml.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      cells.push(stripped);
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

function parseSpreadsheetXmlRows(xml: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = xml.match(/<Row\b[^>]*>[\s\S]*?<\/Row>/gi) ?? [];
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<Cell\b[^>]*>[\s\S]*?<\/Cell>/gi) ?? [];
    for (const cellXml of cellMatches) {
      const dataMatch = cellXml.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
      const value = dataMatch?.[1]
        ? decodeHtmlEntities(dataMatch[1]).replace(/\s+/g, " ").trim()
        : "";
      cells.push(value);
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

export async function readTabularSheets(
  filename: string,
  bytes: Uint8Array
): Promise<RawTabularSheet[]> {
  const ext = getDocumentExtension(filename);
  if (!ext || (ext !== "xlsx" && ext !== "xls" && ext !== "csv")) {
    throw new ValidationError("IRM import supports .xlsx, .xls, and .csv files only.");
  }

  if (ext === "csv") {
    const text = Buffer.from(bytes).toString("utf8");
    const rows = parseCsvRows(text);
    return [{ sheetName: "CSV", rows }];
  }

  if (ext === "xls") {
    const isOle2 =
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0;

    if (!isOle2) {
      const text = Buffer.from(bytes).toString("utf8").trim();
      if (/<table\b/i.test(text)) {
        return [{ sheetName: "XLS_HTML", rows: parseHtmlTableRows(text) }];
      }
      if (/<Workbook\b/i.test(text) && /<Row\b/i.test(text)) {
        return [{ sheetName: "XLS_XML", rows: parseSpreadsheetXmlRows(text) }];
      }
      return [{ sheetName: "XLS_TEXT", rows: parseCsvRows(text) }];
    }

    throw new ValidationError(
      "Legacy binary .xls format cannot be decoded directly. Please save the bank report as .xlsx or .csv and re-upload."
    );
  }

  // .xlsx via ExcelJS
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await workbook.xlsx.load(arrayBuffer as ArrayBuffer);

  const sheets: RawTabularSheet[] = [];
  for (const worksheet of workbook.worksheets) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rawValues = row.values;
      if (!Array.isArray(rawValues)) return;
      const cells: string[] = [];
      for (let i = 1; i < rawValues.length; i += 1) {
        cells.push(cellValueToString(rawValues[i] ?? null));
      }
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    });
    if (rows.length > 0) {
      sheets.push({
        sheetName: worksheet.name || "Sheet1",
        rows,
      });
    }
  }

  if (sheets.length === 0) {
    throw new ValidationError("The uploaded Excel workbook contains no readable rows.");
  }

  return sheets;
}
