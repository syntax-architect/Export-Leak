import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures", "shipping-bills");

const FIXTURES = [
  {
    file: "sb-01-icegate-garment.pdf",
    layout: "ICEGATE Web Print",
    pages: [
      [
        "INDIAN CUSTOMS EDI SYSTEM (ICES) - SHIPPING BILL FOR EXPORT",
        "Port Code: INNSA1 | Shipping Bill No: 7458210 | SB Date: 14/10/2026",
        "LEO Date: 16/10/2026 | Invoice No: EXP/26-27/1041 | Currency: USD | Exch Rate: 84.2500",
        "Buyer's Name: NORDIC APPAREL TRADING AB",
        "Schemes Claimed: RoDTEP, Duty Drawback",
        "Item Details:",
        "1  62052000  MEN COTTON WOVEN SHIRTS  1200  PCS  14400.00",
        "2  62046200  WOMEN COTTON TROUSERS  800  PCS  10600.00",
        "Total FOB Value (FC): USD 25,000.00",
      ],
    ],
    truth: {
      sbNumber: "7458210",
      sbDate: "2026-10-14",
      portCode: "INNSA1",
      leoDate: "2026-10-16",
      invoiceNo: "EXP/26-27/1041",
      buyerName: "NORDIC APPAREL TRADING AB",
      currency: "USD",
      fobMinor: 2500000,
      schemesClaimed: ["rodtep", "drawback"],
      expectedStatus: "done",
      items: [
        { hsCode: "62052000", fobMinor: 1440000, quantity: "1200", uqc: "PCS" },
        { hsCode: "62046200", fobMinor: 1060000, quantity: "800", uqc: "PCS" },
      ],
    },
  },
  {
    file: "sb-02-icegate-pharma-multipage.pdf",
    layout: "ICEGATE Multi-Page Print",
    pages: [
      [
        "ICEGATE EXPORT SHIPPING BILL (EXPORTER COPY) - PAGE 1 OF 2",
        "Custom Station: INBOM4",
        "Shipping Bill Number: 8120394",
        "Shipping Bill Date: 21-10-2026",
        "Let Export Date: 22-10-2026",
        "Inv. No.: PH-2026-883",
        "Consignee Name: HELVETICA PHARMA GMBH",
        "Invoice Currency: EUR | Exchange Rate: 91.40",
        "Export Scheme: RoDTEP: YES | Drawback: NO",
        "Item No: 1",
        "RITC / HS Code: 30049099",
        "Description: TABLETS ANTIBIOTIC FORMULATION",
        "Quantity: 5000 BOX",
        "FOB Value (FC): EUR 18500.00",
      ],
      [
        "ICEGATE EXPORT SHIPPING BILL - CONTINUATION PAGE 2 OF 2",
        "Item No: 2",
        "RITC / HS Code: 30042099",
        "Description: CAPSULES PENICILLIN DERIVATIVE",
        "Quantity: 2500 BOX",
        "FOB Value (FC): EUR 9250.00",
        "Item No: 3",
        "RITC / HS Code: 30039090",
        "Description: STERILE BULK GRANULES",
        "Quantity: 450 KGS",
        "FOB Value (FC): EUR 4250.00",
        "Total FOB Value: EUR 32,000.00",
      ],
    ],
    truth: {
      sbNumber: "8120394",
      sbDate: "2026-10-21",
      portCode: "INBOM4",
      leoDate: "2026-10-22",
      invoiceNo: "PH-2026-883",
      buyerName: "HELVETICA PHARMA GMBH",
      currency: "EUR",
      fobMinor: 3200000,
      schemesClaimed: ["rodtep"],
      expectedStatus: "done",
      items: [
        { hsCode: "30049099", fobMinor: 1850000, quantity: "5000", uqc: "BOX" },
        { hsCode: "30042099", fobMinor: 925000, quantity: "2500", uqc: "BOX" },
        { hsCode: "30039090", fobMinor: 425000, quantity: "450", uqc: "KGS" },
      ],
    },
  },
  {
    file: "sb-03-cha-summary-tiles.pdf",
    layout: "CHA Generated Checklist Summary",
    pages: [
      [
        "CUSTOMS BROKER CHECKLIST / SUMMARY SHIPPING BILL",
        "Port: INMUN1 | S/B No: 6391820 | S/B Dt: 05/11/2026 | LEO Dt: 06/11/2026",
        "Invoice No: MORBI/26/402 | Buyer: GULF CERAMIC IMPORTS LLC",
        "Currency: USD | Exchange Rate: 84.50",
        "Schemes Claimed: RoDTEP",
        "Sr | HS Code | Description | Qty | UQC | FOB (FC)",
        "1 | 69072100 | GLAZED PORCELAIN TILES 600X600 | 4200 | SQM | 21000.00",
        "2 | 69072200 | VITRIFIED SLAB PANELS | 1500 | SQM | 11500.00",
        "Total FOB: USD 32,500.00",
      ],
    ],
    truth: {
      sbNumber: "6391820",
      sbDate: "2026-11-05",
      portCode: "INMUN1",
      leoDate: "2026-11-06",
      invoiceNo: "MORBI/26/402",
      buyerName: "GULF CERAMIC IMPORTS LLC",
      currency: "USD",
      fobMinor: 3250000,
      schemesClaimed: ["rodtep"],
      expectedStatus: "done",
      items: [
        { hsCode: "69072100", fobMinor: 2100000, quantity: "4200", uqc: "SQM" },
        { hsCode: "69072200", fobMinor: 1150000, quantity: "1500", uqc: "SQM" },
      ],
    },
  },
  {
    file: "sb-04-cha-engineering-inr.pdf",
    layout: "CHA INR Invoice Summary",
    pages: [
      [
        "CHA POST-SHIPMENT SUMMARY COPY",
        "S/B No.: 5541209",
        "S/B Date: 08-10-2026",
        "LEO Date: 10-10-2026",
        "Port Code: INMAA1",
        "Invoice No: ENG-INR-26-091",
        "Buyer's Name: SAARC PRECISION DISTRIBUTORS",
        "Currency Code: INR",
        "Scheme Details: RoDTEP, DBK",
        "1  87089900  PRECISION CNC AXLE BRACKETS  1500  NOS  975000.00",
        "Total FOB Value: INR 975,000.00",
      ],
    ],
    truth: {
      sbNumber: "5541209",
      sbDate: "2026-10-08",
      portCode: "INMAA1",
      leoDate: "2026-10-10",
      invoiceNo: "ENG-INR-26-091",
      buyerName: "SAARC PRECISION DISTRIBUTORS",
      currency: "INR",
      fobMinor: 97500000,
      schemesClaimed: ["rodtep", "drawback"],
      expectedStatus: "done",
      items: [{ hsCode: "87089900", fobMinor: 97500000, quantity: "1500", uqc: "NOS" }],
    },
  },
  {
    file: "sb-05-ices-edi-textiles.pdf",
    layout: "ICES EDI Condensed Print",
    pages: [
      [
        "ICES 1.5 SHIPPING BILL EXPORT PRINT",
        "Port of Loading: INTUT1 | SB No: 9012478 | Date of Filing: 12/10/2026",
        "LEO Date: 13/10/2026 | Inv No: TIR-KNIT-9912 | Currency: GBP | Exch Rate: 108.15",
        "Buyer Name: HIGH STREET TEXTILES LTD",
        "Incentive Claimed: RoSCTL: YES",
        "1  61091000  KNITTED COTTON T-SHIRTS DYED  3000  PCS  12000.00",
        "2  61051020  KNITTED POLO SHIRTS MEN  1500  PCS  8250.50",
        "FOB Amount: GBP 20,250.50",
      ],
    ],
    truth: {
      sbNumber: "9012478",
      sbDate: "2026-10-12",
      portCode: "INTUT1",
      leoDate: "2026-10-13",
      invoiceNo: "TIR-KNIT-9912",
      buyerName: "HIGH STREET TEXTILES LTD",
      currency: "GBP",
      fobMinor: 2025050,
      schemesClaimed: ["rosctl"],
      expectedStatus: "done",
      items: [
        { hsCode: "61091000", fobMinor: 1200000, quantity: "3000", uqc: "PCS" },
        { hsCode: "61051020", fobMinor: 825050, quantity: "1500", uqc: "PCS" },
      ],
    },
  },
  {
    file: "sb-06-icegate-leather.pdf",
    layout: "ICEGATE DD-MMM-YYYY Print",
    pages: [
      [
        "INDIAN CUSTOMS ICEGATE SHIPPING BILL COPY",
        "Port Code: INCCU1 | Shipping Bill No: 4419802 | SB Date: 03-NOV-2026",
        "LEO Date: 04-NOV-2026 | Invoice No: CAL-LTH-508 | Currency: EUR | Exch Rate: 91.10",
        "Consignee: MILANO PELLETTERIA SRL",
        "Schemes Claimed: Duty Drawback, RoDTEP",
        "1  42022110  GENUINE LEATHER HAND BAGS  600  NOS  18600.00",
        "2  42031010  LEATHER JACKETS FINISHED  150  NOS  9400.00",
        "Total FOB Value (FC): EUR 28,000.00",
      ],
    ],
    truth: {
      sbNumber: "4419802",
      sbDate: "2026-11-03",
      portCode: "INCCU1",
      leoDate: "2026-11-04",
      invoiceNo: "CAL-LTH-508",
      buyerName: "MILANO PELLETTERIA SRL",
      currency: "EUR",
      fobMinor: 2800000,
      schemesClaimed: ["rodtep", "drawback"],
      expectedStatus: "done",
      items: [
        { hsCode: "42022110", fobMinor: 1860000, quantity: "600", uqc: "NOS" },
        { hsCode: "42031010", fobMinor: 940000, quantity: "150", uqc: "NOS" },
      ],
    },
  },
  {
    file: "sb-07-cha-spices-bulk.pdf",
    layout: "CHA Bulk Spices Format",
    pages: [
      [
        "CHA DOCUMENT COPY - AGRICULTURAL EXPORT",
        "Port: INCOK1 | S/B No: 3829104 | S/B Date: 28/10/2026 | LEO Dt: 29/10/2026",
        "Invoice No: KOC-SP-2201 | Buyer: AL-MAHA SPICE TRADERS",
        "Currency: AED | Exchange Rate: 22.95",
        "Scheme Code: RoDTEP: YES",
        "1 | 09041130 | BLACK PEPPER WHOLE GARBLED | 4500.5 | KGS | 85509.50",
        "Total FOB Value: AED 85,509.50",
      ],
    ],
    truth: {
      sbNumber: "3829104",
      sbDate: "2026-10-28",
      portCode: "INCOK1",
      leoDate: "2026-10-29",
      invoiceNo: "KOC-SP-2201",
      buyerName: "AL-MAHA SPICE TRADERS",
      currency: "AED",
      fobMinor: 8550950,
      schemesClaimed: ["rodtep"],
      expectedStatus: "done",
      items: [{ hsCode: "09041130", fobMinor: 8550950, quantity: "4500.5", uqc: "KGS" }],
    },
  },
  {
    file: "sb-08-icegate-machinery.pdf",
    layout: "ICEGATE Copy Before LEO",
    pages: [
      [
        "ICEGATE PROVISIONAL SHIPPING BILL PRINT",
        "Port Code: INPAV1 | Shipping Bill No: 7781235 | SB Date: 09/11/2026",
        "Invoice No: RAJKOT-PUMP-771 | Consignee: PACIFIC FLOW SYSTEMS PTE LTD",
        "Currency: SGD | Exch Rate: 62.80",
        "Schemes Claimed: Duty Drawback",
        "1  84137099  SUBMERSIBLE CENTRIFUGAL PUMPS  80  SET  24800.00",
        "Total FOB Value: SGD 24,800.00",
      ],
    ],
    truth: {
      sbNumber: "7781235",
      sbDate: "2026-11-09",
      portCode: "INPAV1",
      leoDate: null,
      invoiceNo: "RAJKOT-PUMP-771",
      buyerName: "PACIFIC FLOW SYSTEMS PTE LTD",
      currency: "SGD",
      fobMinor: 2480000,
      schemesClaimed: ["drawback"],
      expectedStatus: "done",
      items: [{ hsCode: "84137099", fobMinor: 2480000, quantity: "80", uqc: "SET" }],
    },
  },
  {
    file: "sb-09-cha-chemicals.pdf",
    layout: "CHA DD MMM YYYY Layout",
    pages: [
      [
        "EXPORT SHIPPING BILL ANNEXURE",
        "Custom Station: INHAZ1 | S/B No: 5190441 | SB Date: 18 Oct 2026 | LEO Date: 20 Oct 2026",
        "Inv No: GUJ-CHEM-309 | Buyer Name: EUROCHEM INDUSTRIAL BV",
        "Invoice Currency: USD | Exchange Rate: 84.30",
        "Export Scheme: RoDTEP: YES | Drawback: YES",
        "1  29173990  ORGANIC INTERMEDIATE ESTER  12000  KGS  26400.00",
        "2  32041739  PHTHALOCYANINE BLUE PIGMENT  4000  KGS  19600.00",
        "Total FOB: USD 46,000.00",
      ],
    ],
    truth: {
      sbNumber: "5190441",
      sbDate: "2026-10-18",
      portCode: "INHAZ1",
      leoDate: "2026-10-20",
      invoiceNo: "GUJ-CHEM-309",
      buyerName: "EUROCHEM INDUSTRIAL BV",
      currency: "USD",
      fobMinor: 4600000,
      schemesClaimed: ["rodtep", "drawback"],
      expectedStatus: "done",
      items: [
        { hsCode: "29173990", fobMinor: 2640000, quantity: "12000", uqc: "KGS" },
        { hsCode: "32041739", fobMinor: 1960000, quantity: "4000", uqc: "KGS" },
      ],
    },
  },
  {
    file: "sb-10-icegate-agri-rice.pdf",
    layout: "ICEGATE Export Print",
    pages: [
      [
        "INDIAN CUSTOMS EDI SHIPPING BILL",
        "Port Code: INNSA1 | Shipping Bill No: 6904321 | SB Date: 2026-10-25",
        "LEO Date: 2026-10-26 | Invoice No: KRN-RICE-812",
        "Buyer's Name: RED SEA FOODS EST",
        "Currency: INR",
        "Schemes Claimed: RoDTEP",
        "1  10063020  BASMATI RICE SELLA PARBOILED  25  MTS  2125000.00",
        "Total FOB Value (INR): 2,125,000.00",
      ],
    ],
    truth: {
      sbNumber: "6904321",
      sbDate: "2026-10-25",
      portCode: "INNSA1",
      leoDate: "2026-10-26",
      invoiceNo: "KRN-RICE-812",
      buyerName: "RED SEA FOODS EST",
      currency: "INR",
      fobMinor: 212500000,
      schemesClaimed: ["rodtep"],
      expectedStatus: "done",
      items: [{ hsCode: "10063020", fobMinor: 212500000, quantity: "25", uqc: "MTS" }],
    },
  },
  {
    file: "sb-11-scanned-lowtext.pdf",
    layout: "Scanned Image-Only PDF (OCR Fallback)",
    pages: [[]],
    metadataTitle:
      "Port Code: INNSA1 | SB No: 9981122 | SB Date: 02/11/2026 | Invoice No: SCAN-001 | Buyer Name: SCANNED IMPORTS CO | Currency: USD | 1 62052000 SCANNED COTTON SHIRTS 500 PCS 6000.00 | Total FOB Value: USD 6000.00",
    truth: {
      sbNumber: "9981122",
      sbDate: "2026-11-02",
      portCode: "INNSA1",
      leoDate: null,
      invoiceNo: "SCAN-001",
      buyerName: "SCANNED IMPORTS CO",
      currency: "USD",
      fobMinor: 600000,
      schemesClaimed: [],
      expectedStatus: "needs_review",
      items: [{ hsCode: "62052000", fobMinor: 600000, quantity: "500", uqc: "PCS" }],
    },
  },
  {
    file: "sb-12-uncertain-edge.pdf",
    layout: "Uncertain Edge Case (Partial HS + FOB Mismatch -> Review Required)",
    pages: [
      [
        "CUSTOMS PRINT - EDGE CASE CHECK",
        "Port Code: INBOM4 | Shipping Bill No: 4100998 | SB Date: 01/11/2026",
        "Invoice No: EDGE/26/009 | Currency: USD",
        "Schemes Claimed: RoDTEP",
        "1  848190  VALVE PART SHORT HS  200  NOS  5000.00",
        "Total FOB Value: USD 6,500.00",
      ],
    ],
    truth: {
      sbNumber: "4100998",
      sbDate: "2026-11-01",
      portCode: "INBOM4",
      leoDate: null,
      invoiceNo: "EDGE/26/009",
      buyerName: null,
      currency: "USD",
      fobMinor: 650000,
      schemesClaimed: ["rodtep"],
      expectedStatus: "needs_review",
      items: [{ hsCode: "848190", fobMinor: 500000, quantity: "200", uqc: "NOS" }],
    },
  },
];

async function generateFixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const groundTruth = [];

  for (const fixture of FIXTURES) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Courier);

    if (fixture.metadataTitle) {
      doc.setTitle(fixture.metadataTitle);
    }

    for (const lines of fixture.pages) {
      const page = doc.addPage([595, 842]);
      let y = 790;
      for (const line of lines) {
        page.drawText(line, { x: 40, y, size: 10, font });
        y -= 18;
      }
    }

    const pdfBytes = await doc.save();
    await fs.writeFile(path.join(FIXTURES_DIR, fixture.file), pdfBytes);

    groundTruth.push({
      file: fixture.file,
      layout: fixture.layout,
      truth: fixture.truth,
    });
  }

  await fs.writeFile(
    path.join(FIXTURES_DIR, "ground-truth.json"),
    JSON.stringify(groundTruth, null, 2)
  );

  await fs.writeFile(
    path.join(FIXTURES_DIR, "README.md"),
    `# Shipping Bill Fixture Pack (Synthetic Multi-Layout Baseline)

These 12 PDF fixtures are **SYNTHETIC** test documents created to benchmark multi-layout Indian Customs Shipping Bill parsing (ICEGATE Web Print, ICES 1.5 condensed copy, multi-page Continuation items, CHA Checklist summaries, INR & multi-currency exports, scanned OCR-fallback PDFs, and validation edge cases).

When you obtain real, anonymised Shipping Bill PDFs from partner exporters or EXIM consultants, place them in this folder, add their expected values to \`ground-truth.json\`, and re-run the parser benchmark test to update \`docs/shipping-bill-parser-accuracy.md\`.
`
  );
}

generateFixtures().catch((error) => {
  console.error(error);
  process.exit(1);
});
