import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const OUTPUT_DIR = path.resolve(process.cwd(), "fixtures", "irm");

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // 1. Synthetic DGFT EDPMS-style .xlsx export with 2 preamble banner rows before headers
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("IRM_Details");

  sheet.addRow(["DGFT EDPMS - Inward Remittance Message (IRM) Export (Synthetic Fixture)"]);
  sheet.addRow(["IEC: AAACT1234K | Period: 01 Oct 2026 to 12 Nov 2026 | Generated: 12 Nov 2026"]);
  sheet.addRow([
    "IRM No",
    "AD Bank Name",
    "IRM Issue Date",
    "FCC",
    "IRM Amount",
    "Utilised Amt",
    "Remitter / Buyer Name",
    "Remarks / Ref",
    "AD Code",
  ]);

  const xlsxRows = [
    [
      "IRM-HDFC-26001",
      "HDFC Bank Ltd",
      "18-Oct-2026",
      "USD",
      14250.0,
      0,
      "NORDIC APPAREL AB",
      "EXPORT PMT INV EXP/26/101 GARMENTS",
      "0510001",
    ],
    [
      "IRM-HDFC-26002",
      "HDFC Bank Ltd",
      "21-Oct-2026",
      "USD",
      11975.0,
      0,
      "MIDLANDS PHARMA UK LTD",
      "WIRE SETTLEMENT INV-2231 LESS USD 25 BANK CHG",
      "0510001",
    ],
    [
      "IRM-ICICI-26003",
      "ICICI Bank Ltd",
      "28-Oct-2026",
      "USD",
      18000.0,
      0,
      "PACIFIC HOME TEXTILES INC",
      "BATCH REMITTANCE INV/26/301 AND INV/26/302",
      "0230018",
    ],
    [
      "IRM-AXIS-26004",
      "Axis Bank Ltd",
      "30-Oct-2026",
      "USD",
      6000.0,
      0,
      "BAVARIA LEATHER GMBH",
      "PARTIAL 60PCT INV/26/401",
      "0180044",
    ],
    [
      "IRM-AXIS-26005",
      "Axis Bank Ltd",
      "04-Nov-2026",
      "USD",
      4000.0,
      0,
      "BAVARIA LEATHER GMBH",
      "BALANCE 40PCT INV/26/401",
      "0180044",
    ],
    [
      "IRM-SBI-26006",
      "State Bank of India",
      "05-Nov-2026",
      "EUR",
      9500.0,
      0,
      "NORDIC APPAREL AB",
      "EUR ORDER REF-EUR-9500",
      "0002109",
    ],
  ];

  for (const row of xlsxRows) {
    sheet.addRow(row);
  }

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  await fs.writeFile(path.join(OUTPUT_DIR, "irm-dgft-edpms-sample.xlsx"), Buffer.from(xlsxBuffer));

  // 2. Bank portal CSV export with varied header names, Indian commas, date formats, and 1 error row
  const csvLines = [
    '"FIRC / IRM Ref","Bank","Credit Date","Currency","Remittance Value","Already Utilised","Remitter","Payment Narration"',
    '"IRM-HDFC-26007","HDFC Bank","25/10/2026","INR","4,20,000.00","0.00","KAVERI OVERSEAS TRADING","INR Vostro Inv EXP-INR-881"',
    '"IRM-KOTAK-26008","Kotak Mahindra Bank","06-11-2026","USD","8,500.00","0.00","ALPS MACHINERY AG","ADVANCE OR DUPLICATE INV/DUP/900"',
    '"IRM-KOTAK-26009","Kotak Mahindra Bank","08-11-2026","USD","7,150.00","0.00","ALPS MACHINERY AG","SETTLEMENT AGAINST INV/DUP/900"',
    '"IRM-BAD-ROW","Kotak Mahindra Bank","31/02/2026","USD","0.00","0.00","INVALID DATE CORP","SHOULD REPORT ROW ERROR"',
  ];

  await fs.writeFile(
    path.join(OUTPUT_DIR, "irm-hdfc-bank-export.csv"),
    csvLines.join("\n"),
    "utf8"
  );

  // 3. Expected fixture Shipping Bills for matching benchmark report
  const expectedScenario = {
    description:
      "Synthetic baseline IRM matching scenarios covering exact, near-equal bank charges, 1-to-many split, many-to-1 partial, currency mismatch, and duplicate invoice disambiguation.",
    shippingBills: [
      {
        id: "sb-fx-01",
        iecId: "iec-demo",
        sbNumber: "7458210",
        sbDate: "2026-10-12",
        invoiceNo: "EXP/26/101",
        buyerName: "NORDIC APPAREL AB",
        currency: "USD",
        fobMinor: 1425000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "auto_confirmed",
      },
      {
        id: "sb-fx-02",
        iecId: "iec-demo",
        sbNumber: "7458225",
        sbDate: "2026-10-15",
        invoiceNo: "INV-2231",
        buyerName: "MIDLANDS PHARMA UK LTD",
        currency: "USD",
        fobMinor: 1200000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "auto_confirmed",
      },
      {
        id: "sb-fx-03",
        iecId: "iec-demo",
        sbNumber: "7458301",
        sbDate: "2026-10-19",
        invoiceNo: "INV/26/301",
        buyerName: "PACIFIC HOME TEXTILES INC",
        currency: "USD",
        fobMinor: 1000000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "auto_confirmed",
      },
      {
        id: "sb-fx-04",
        iecId: "iec-demo",
        sbNumber: "7458302",
        sbDate: "2026-10-20",
        invoiceNo: "INV/26/302",
        buyerName: "PACIFIC HOME TEXTILES INC",
        currency: "USD",
        fobMinor: 800000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "auto_confirmed",
      },
      {
        id: "sb-fx-05",
        iecId: "iec-demo",
        sbNumber: "7458401",
        sbDate: "2026-10-22",
        invoiceNo: "INV/26/401",
        buyerName: "BAVARIA LEATHER GMBH",
        currency: "USD",
        fobMinor: 1000000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "auto_confirmed",
      },
      {
        id: "sb-fx-06",
        iecId: "iec-demo",
        sbNumber: "7458501",
        sbDate: "2026-10-20",
        invoiceNo: "EXP-INR-881",
        buyerName: "KAVERI OVERSEAS TRADING",
        currency: "INR",
        fobMinor: 42000000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "auto_confirmed",
      },
      {
        id: "sb-fx-07",
        iecId: "iec-demo",
        sbNumber: "7458601",
        sbDate: "2026-10-28",
        invoiceNo: "INV/DUP/900",
        buyerName: "ALPS MACHINERY AG",
        currency: "USD",
        fobMinor: 850000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "needs_review",
      },
      {
        id: "sb-fx-08",
        iecId: "iec-demo",
        sbNumber: "7458602",
        sbDate: "2026-10-29",
        invoiceNo: "INV/DUP/900",
        buyerName: "ALPS MACHINERY AG",
        currency: "USD",
        fobMinor: 715000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "needs_review",
      },
      {
        id: "sb-fx-09-eur-guard",
        iecId: "iec-demo",
        sbNumber: "7458999",
        sbDate: "2026-10-29",
        invoiceNo: "NO-EUR-MATCH",
        buyerName: "NORDIC APPAREL AB",
        currency: "USD",
        fobMinor: 950000,
        alreadyMatchedMinor: 0,
        calculationEligible: true,
        status: "parsed",
        expectedOutcome: "unmatched_currency_mismatch",
      },
    ],
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, "irm-expected-bills.json"),
    JSON.stringify(expectedScenario, null, 2),
    "utf8"
  );

  const readme = `# Bank IRM / EDPMS Fixtures

> **Synthetic Baseline Notice:** These sample exports in \`fixtures/irm/\` are synthetic test files modelling DGFT EDPMS and Indian AD-bank IRM export columns until real anonymised consultant/exporter IRM files are added here.

## Included Files
- \`irm-dgft-edpms-sample.xlsx\`: Multi-row banner + header auto-detection test covering exact 1:1 USD match, near-equal after wire bank charges, 1-to-many split payment, many-to-1 partial payments, and EUR currency non-clubbing test.
- \`irm-hdfc-bank-export.csv\`: Alternative bank portal CSV header names, \`DD/MM/YYYY\` and \`DD-MM-YYYY\` dates, Indian comma grouping (\`4,20,000.00\`), duplicate invoice numbers, and 1 malformed row (\`IRM-BAD-ROW\`) to verify loud row-error reporting.
- \`irm-expected-bills.json\`: Ground-truth Shipping Bill scenario set used by automated unit tests and \`docs/irm-matching-report.md\`.
`;

  await fs.writeFile(path.join(OUTPUT_DIR, "README.md"), readme, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
