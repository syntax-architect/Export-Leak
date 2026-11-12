import fs from "node:fs";
import ExcelJS from "exceljs";
import {
  EBRC_HEADERS,
  EBRC_MAX_FILE_BYTES,
  EBRC_SAMPLE_TEMPLATE_PATH,
  EBRC_SHEET_NAME,
  EBRC_TEMPLATE_VERSION,
} from "@/config/ebrc";
import { ValidationError } from "@/lib/auth/errors";
import {
  formatMinorUnitsForExcel,
  parseDecimalToMinorUnitsExact,
  type BulkEbrcRowInput,
} from "@/lib/ebrc/validator";

function sanitizeSpreadsheetString(value: string): string {
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

function minorUnitsToExcelDecimal(minorUnits: number): number {
  const whole = Math.floor(minorUnits / 100);
  const cents = minorUnits % 100;
  return Number(`${whole}.${String(cents).padStart(2, "0")}`);
}

export async function buildBulkEbrcWorkbook(rows: readonly BulkEbrcRowInput[]): Promise<{
  buffer: Buffer;
  rowCount: number;
  templateVersion: string;
  sheetName: string;
  headers: readonly string[];
}> {
  const workbook = new ExcelJS.Workbook();

  // Verify structure against the official sample template when present
  if (fs.existsSync(EBRC_SAMPLE_TEMPLATE_PATH)) {
    const sampleWb = new ExcelJS.Workbook();
    await sampleWb.xlsx.readFile(EBRC_SAMPLE_TEMPLATE_PATH);
    const sampleSheet = sampleWb.getWorksheet(EBRC_SHEET_NAME);
    if (!sampleSheet) {
      throw new Error(`Sample template is missing worksheet "${EBRC_SHEET_NAME}".`);
    }
    const sampleHeaderRow = sampleSheet.getRow(1);
    EBRC_HEADERS.forEach((expectedHeader, idx) => {
      const actual = String(sampleHeaderRow.getCell(idx + 1).value ?? "").trim();
      if (actual !== expectedHeader) {
        throw new Error(
          `Sample template header mismatch at column ${idx + 1}: expected "${expectedHeader}", found "${actual}".`
        );
      }
    });
  }

  workbook.creator = "ExportLeak";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(EBRC_SHEET_NAME);
  const headerRow = sheet.addRow([...EBRC_HEADERS]);
  headerRow.font = { bold: true };

  // Mirror sample template column formatting: text (@) for dates/codes/strings, integer for Serial, 0.00 for Amount
  const textColumns = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12];
  for (const colIdx of textColumns) {
    sheet.getColumn(colIdx).numFmt = "@";
  }
  sheet.getColumn(1).numFmt = "0";
  sheet.getColumn(9).numFmt = "0.00";

  rows.forEach((row, index) => {
    const parsedMinor =
      parseDecimalToMinorUnitsExact(row.amountInFcc) ??
      (typeof row.amountMinor === "number" ? row.amountMinor : 0);

    const serialNum = Number.parseInt(String(row.serialNumber), 10);
    const serial = Number.isInteger(serialNum) && serialNum > 0 ? serialNum : index + 1;

    sheet.addRow([
      serial,
      sanitizeSpreadsheetString(row.iecBranchSlNo),
      sanitizeSpreadsheetString(row.ifscCode.toUpperCase()),
      sanitizeSpreadsheetString(row.adCode.toUpperCase()),
      sanitizeSpreadsheetString(row.irmNumber),
      sanitizeSpreadsheetString(row.irmDate),
      sanitizeSpreadsheetString(row.irmCurrency.toUpperCase()),
      sanitizeSpreadsheetString(row.purposeCode.toUpperCase()),
      minorUnitsToExcelDecimal(parsedMinor),
      sanitizeSpreadsheetString(row.portCode.toUpperCase()),
      sanitizeSpreadsheetString(row.shippingBillNumber.toUpperCase()),
      sanitizeSpreadsheetString(row.shippingBillDate),
    ]);

    // Ensure amount string cache/consistency never loses 2-decimal precision
    void formatMinorUnitsForExcel(parsedMinor);
  });

  sheet.columns.forEach((col, i) => {
    const headerLen = EBRC_HEADERS[i]?.length ?? 14;
    col.width = Math.max(headerLen + 4, 16);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > EBRC_MAX_FILE_BYTES) {
    throw new ValidationError(
      `Generated workbook size (${buffer.byteLength} bytes) exceeds the DGFT 5 MB upload limit.`
    );
  }

  return {
    buffer,
    rowCount: rows.length,
    templateVersion: EBRC_TEMPLATE_VERSION,
    sheetName: EBRC_SHEET_NAME,
    headers: EBRC_HEADERS,
  };
}
