import path from "node:path";
import ExcelJS from "exceljs";

const OUTPUT_PATH = path.resolve(process.cwd(), "fixtures", "dgft-bulk-ebrc-sample.xlsx");

const HEADERS = [
  "Serial Number",
  "IEC Branch Sl. No.",
  "IFSC Code",
  "AD Code",
  "IRM Number",
  "IRM Date",
  "IRM Currency",
  "Purpose Code",
  "Amount in FCC",
  "Port Code",
  "Shipping Bill Number",
  "Shipping Bill Date",
];

const SAMPLE_ROWS = [
  [
    1,
    "0",
    "HDFC0000240",
    "0510002",
    "IRM20261015001",
    "15/10/2026",
    "USD",
    "P0102",
    18500.0,
    "INTUT6",
    "7458210",
    "02/10/2026",
  ],
  [
    2,
    "0",
    "SBIN0004321",
    "0000842",
    "IRM20261022004",
    "22/10/2026",
    "EUR",
    "P0103",
    14250.5,
    "INNSA1",
    "7458991",
    "28/10/2026",
  ],
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ExportLeak Reference Fixtures";
  workbook.created = new Date("2026-11-12T00:00:00Z");

  const sheet = workbook.addWorksheet("eBRC_Bulk_Upload");
  const headerRow = sheet.addRow(HEADERS);
  headerRow.font = { bold: true };

  // Keep text date/code columns as explicit text format so Excel never reformats DD/MM/YYYY.
  const textColIndexes = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12];
  for (const colIdx of textColIndexes) {
    sheet.getColumn(colIdx).numFmt = "@";
  }
  sheet.getColumn(1).numFmt = "0";
  sheet.getColumn(9).numFmt = "0.00";

  for (const row of SAMPLE_ROWS) {
    sheet.addRow(row);
  }

  sheet.columns.forEach((col, i) => {
    const headerLen = HEADERS[i]?.length ?? 14;
    col.width = Math.max(headerLen + 4, 16);
  });

  await workbook.xlsx.writeFile(OUTPUT_PATH);
  process.stdout.write(`Generated ${OUTPUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
