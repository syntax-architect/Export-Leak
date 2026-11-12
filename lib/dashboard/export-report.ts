import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { REPORT_FOOTER_TEXT } from "@/config/deadlines";
import { formatDate, formatMoney } from "@/lib/format";
import type { LeakageDashboardData } from "@/lib/dashboard/repository";

function sanitizeSpreadsheetCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0) ? value : 0;
  }
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function formatPdfMoney(minorUnits: number, currency = "INR"): string {
  // Helvetica StandardFont uses WinAnsi encoding which lacks U+20B9 (₹),
  // so normalize currency symbols to ASCII-safe representations for PDF output.
  return formatMoney(minorUnits, currency, { showCode: true })
    .replaceAll("₹", "INR ")
    .replaceAll("€", "EUR ")
    .replaceAll("£", "GBP ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(input: string, maxLen: number): string {
  const clean = input.replace(/[^\x20-\x7E]/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 3))}...`;
}

export async function buildLeakageReportPdf(data: LeakageDashboardData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`ExportLeak Leakage & Deadlines Report - ${data.summary.orgName}`);
  doc.setCreator("ExportLeak");
  doc.setProducer("ExportLeak");
  doc.setSubject(REPORT_FOOTER_TEXT);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4 width
  const pageHeight = 841.89; // A4 height
  const margin = 42;
  const pages: PDFPage[] = [];

  function addPage(): { page: PDFPage; y: number } {
    const page = doc.addPage([pageWidth, pageHeight]);
    pages.push(page);
    return { page, y: pageHeight - margin };
  }

  // Cover & Summary Page
  let { page, y } = addPage();

  page.drawRectangle({
    x: 0,
    y: pageHeight - 118,
    width: pageWidth,
    height: 118,
    color: rgb(0.06, 0.23, 0.2),
  });

  page.drawText("ExportLeak Leakage & Deadlines Report", {
    x: margin,
    y: pageHeight - 54,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(
    truncateText(
      `Organization: ${data.summary.orgName}  |  Generated: ${formatDate(data.summary.todayIso)} IST`,
      95
    ),
    {
      x: margin,
      y: pageHeight - 82,
      size: 10,
      font: fontRegular,
      color: rgb(0.84, 0.94, 0.92),
    }
  );

  y = pageHeight - 152;
  page.drawText("Executive Financial Summary", {
    x: margin,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.09, 0.12, 0.14),
  });
  y -= 24;

  const summaryMetrics: Array<[string, string]> = [
    [
      "Unclaimed incentive (Missing + Short + Not Claimed)",
      formatPdfMoney(data.summary.unclaimedIncentivePaise, "INR"),
    ],
    ["  - Missing scroll credits", formatPdfMoney(data.summary.missingIncentivePaise, "INR")],
    ["  - Short incentive credits", formatPdfMoney(data.summary.shortIncentivePaise, "INR")],
    [
      "  - Not claimed on Shipping Bill",
      formatPdfMoney(data.summary.notClaimedIncentivePaise, "INR"),
    ],
    [
      "At risk (realisation deadline in under 60 days)",
      `${data.summary.atRiskCount} shipments (FOB ${formatPdfMoney(data.summary.atRiskFobMinor, "INR")})`,
    ],
    [
      "Matched and closed shipments",
      `${data.summary.matchedAndClosedCount} of ${data.summary.totalShipmentsCount}`,
    ],
    [
      "Scrips expiring in 90 days",
      `${data.summary.scripsExpiring90Count} scrips (${formatPdfMoney(data.summary.scripsExpiring90Paise, "INR")})`,
    ],
    ["Open alerts needing attention", `${data.summary.activeAlertsCount}`],
    ["Unmatched inward remittances (IRMs)", `${data.summary.unmatchedPaymentsCount}`],
  ];

  for (const [label, value] of summaryMetrics) {
    page.drawRectangle({
      x: margin,
      y: y - 6,
      width: pageWidth - margin * 2,
      height: 22,
      color: rgb(0.96, 0.97, 0.97),
    });
    page.drawText(label, {
      x: margin + 8,
      y: y + 1,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.2, 0.24, 0.28),
    });
    page.drawText(value, {
      x: pageWidth - margin - fontBold.widthOfTextAtSize(value, 9.5) - 8,
      y: y + 1,
      size: 9.5,
      font: fontBold,
      color: rgb(0.06, 0.23, 0.2),
    });
    y -= 26;
  }

  if (data.consultantClients.length > 1) {
    y -= 14;
    page.drawText("Client IEC Summary", {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.09, 0.12, 0.14),
    });
    y -= 18;
    for (const client of data.consultantClients.slice(0, 8)) {
      if (y < 90) break;
      const line = truncateText(
        `${client.iecCode} (${client.legalName}) - Unclaimed: ${formatPdfMoney(
          client.unclaimedIncentivePaise,
          "INR"
        )} | At Risk: ${client.atRiskCount} | Next Due: ${
          client.nextDeadlineDate ? formatDate(client.nextDeadlineDate) : "N/A"
        }`,
        98
      );
      page.drawText(line, {
        x: margin + 4,
        y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.25, 0.29, 0.33),
      });
      y -= 16;
    }
  }

  // Per-shipment Table (starts on new page cleanly)
  ({ page, y } = addPage());

  const drawTableHeader = (targetPage: PDFPage, startY: number): number => {
    targetPage.drawText("Per-Shipment Leakage & Realisation Status", {
      x: margin,
      y: startY,
      size: 13,
      font: fontBold,
      color: rgb(0.09, 0.12, 0.14),
    });

    const headerY = startY - 22;
    targetPage.drawRectangle({
      x: margin,
      y: headerY - 5,
      width: pageWidth - margin * 2,
      height: 18,
      color: rgb(0.06, 0.23, 0.2),
    });

    const cols: Array<{ text: string; x: number }> = [
      { text: "SB #", x: margin + 4 },
      { text: "Date", x: margin + 70 },
      { text: "Buyer", x: margin + 128 },
      { text: "FOB", x: margin + 236 },
      { text: "Unclaimed", x: margin + 318 },
      { text: "Days", x: margin + 408 },
      { text: "Status", x: margin + 452 },
    ];
    for (const col of cols) {
      targetPage.drawText(col.text, {
        x: col.x,
        y: headerY,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
    }
    return headerY - 20;
  };

  y = drawTableHeader(page, y);

  if (data.shipments.length === 0) {
    page.drawText("No shipping bills available in this workspace scope.", {
      x: margin,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.5),
    });
  } else {
    for (let idx = 0; idx < data.shipments.length; idx += 1) {
      const sb = data.shipments[idx]!;
      if (y < 70) {
        ({ page, y } = addPage());
        y = drawTableHeader(page, y);
      }

      if (idx % 2 === 1) {
        page.drawRectangle({
          x: margin,
          y: y - 4,
          width: pageWidth - margin * 2,
          height: 16,
          color: rgb(0.97, 0.98, 0.98),
        });
      }

      const daysLabel =
        sb.daysToDeadline === null
          ? "N/A"
          : sb.daysToDeadline <= 0
            ? `${Math.abs(sb.daysToDeadline)}d over`
            : `${sb.daysToDeadline}d`;

      page.drawText(truncateText(sb.sbNumber, 12), {
        x: margin + 4,
        y,
        size: 7.5,
        font: fontBold,
        color: rgb(0.1, 0.14, 0.18),
      });
      page.drawText(formatDate(sb.sbDate), {
        x: margin + 70,
        y,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.25, 0.3, 0.35),
      });
      page.drawText(truncateText(sb.buyerName, 20), {
        x: margin + 128,
        y,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.25, 0.3, 0.35),
      });
      page.drawText(truncateText(formatPdfMoney(sb.fobMinor, sb.currency), 16), {
        x: margin + 236,
        y,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.1, 0.14, 0.18),
      });
      page.drawText(truncateText(formatPdfMoney(sb.unclaimedIncentivePaise, "INR"), 16), {
        x: margin + 318,
        y,
        size: 7.5,
        font: sb.unclaimedIncentivePaise > 0 ? fontBold : fontRegular,
        color: sb.unclaimedIncentivePaise > 0 ? rgb(0.65, 0.18, 0.12) : rgb(0.25, 0.3, 0.35),
      });
      page.drawText(daysLabel, {
        x: margin + 408,
        y,
        size: 7.5,
        font: fontRegular,
        color: sb.isOverdue ? rgb(0.65, 0.1, 0.1) : rgb(0.25, 0.3, 0.35),
      });
      page.drawText(truncateText(sb.status.replace(/_/g, " "), 12), {
        x: margin + 452,
        y,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.25, 0.3, 0.35),
      });

      y -= 17;
    }
  }

  // Footer on every page
  const totalPages = pages.length;
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: margin, y: 38 },
      end: { x: pageWidth - margin, y: 38 },
      thickness: 0.6,
      color: rgb(0.84, 0.87, 0.89),
    });
    p.drawText(REPORT_FOOTER_TEXT, {
      x: margin,
      y: 22,
      size: 8.5,
      font: fontBold,
      color: rgb(0.25, 0.33, 0.31),
    });
    const pageLabel = `Page ${index + 1} of ${totalPages}`;
    p.drawText(pageLabel, {
      x: pageWidth - margin - fontRegular.widthOfTextAtSize(pageLabel, 8.5),
      y: 22,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.45, 0.49, 0.53),
    });
  });

  return doc.save();
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE6F2EF" },
    };
  });
}

export async function buildLeakageReportWorkbook(data: LeakageDashboardData): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ExportLeak";
  workbook.created = new Date();

  // 1. Summary
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 44 },
    { header: "Value", key: "value", width: 32 },
  ];
  summarySheet.addRows([
    { metric: "Organization", value: sanitizeSpreadsheetCell(data.summary.orgName) },
    { metric: "Generated Date (IST)", value: formatDate(data.summary.todayIso) },
    {
      metric: "Unclaimed Incentive (INR)",
      value: sanitizeSpreadsheetCell(data.summary.unclaimedIncentivePaise / 100),
    },
    {
      metric: "Missing Incentives (INR)",
      value: sanitizeSpreadsheetCell(data.summary.missingIncentivePaise / 100),
    },
    {
      metric: "Short Credits (INR)",
      value: sanitizeSpreadsheetCell(data.summary.shortIncentivePaise / 100),
    },
    {
      metric: "Not Claimed Incentives (INR)",
      value: sanitizeSpreadsheetCell(data.summary.notClaimedIncentivePaise / 100),
    },
    {
      metric: "At Risk (< 60 Days) Shipments",
      value: sanitizeSpreadsheetCell(data.summary.atRiskCount),
    },
    {
      metric: "Matched & Closed Shipments",
      value: sanitizeSpreadsheetCell(data.summary.matchedAndClosedCount),
    },
    {
      metric: "Scrips Expiring in 90 Days Count",
      value: sanitizeSpreadsheetCell(data.summary.scripsExpiring90Count),
    },
    {
      metric: "Scrips Expiring in 90 Days Value (INR)",
      value: sanitizeSpreadsheetCell(data.summary.scripsExpiring90Paise / 100),
    },
    { metric: "Note", value: REPORT_FOOTER_TEXT },
  ]);
  styleHeaderRow(summarySheet);

  // 2. Missing Incentives
  const missingSheet = workbook.addWorksheet("Missing Incentives");
  missingSheet.columns = [
    { header: "IEC Code", key: "iecCode", width: 16 },
    { header: "Shipping Bill", key: "sbNumber", width: 18 },
    { header: "SB Date", key: "sbDate", width: 14 },
    { header: "Buyer", key: "buyerName", width: 28 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "FOB", key: "fob", width: 16 },
    { header: "Expected (INR)", key: "expected", width: 16 },
    { header: "Credited (INR)", key: "credited", width: 16 },
    { header: "Missing Gap (INR)", key: "missing", width: 18 },
  ];
  for (const sb of data.shipments.filter((s) => s.missingIncentivePaise > 0)) {
    missingSheet.addRow({
      iecCode: sanitizeSpreadsheetCell(sb.iecCode),
      sbNumber: sanitizeSpreadsheetCell(sb.sbNumber),
      sbDate: sanitizeSpreadsheetCell(sb.sbDate),
      buyerName: sanitizeSpreadsheetCell(sb.buyerName),
      currency: sanitizeSpreadsheetCell(sb.currency),
      fob: sanitizeSpreadsheetCell(sb.fobMinor / 100),
      expected: sanitizeSpreadsheetCell(sb.expectedIncentivePaise / 100),
      credited: sanitizeSpreadsheetCell(sb.creditedIncentivePaise / 100),
      missing: sanitizeSpreadsheetCell(sb.missingIncentivePaise / 100),
    });
  }
  styleHeaderRow(missingSheet);

  // 3. Short Credits (includes short + not claimed gaps)
  const shortSheet = workbook.addWorksheet("Short Credits");
  shortSheet.columns = [
    { header: "IEC Code", key: "iecCode", width: 16 },
    { header: "Shipping Bill", key: "sbNumber", width: 18 },
    { header: "SB Date", key: "sbDate", width: 14 },
    { header: "Buyer", key: "buyerName", width: 28 },
    { header: "Expected (INR)", key: "expected", width: 16 },
    { header: "Credited (INR)", key: "credited", width: 16 },
    { header: "Shortfall (INR)", key: "short", width: 16 },
    { header: "Not Claimed (INR)", key: "notClaimed", width: 16 },
  ];
  for (const sb of data.shipments.filter(
    (s) => s.shortIncentivePaise > 0 || s.notClaimedIncentivePaise > 0
  )) {
    shortSheet.addRow({
      iecCode: sanitizeSpreadsheetCell(sb.iecCode),
      sbNumber: sanitizeSpreadsheetCell(sb.sbNumber),
      sbDate: sanitizeSpreadsheetCell(sb.sbDate),
      buyerName: sanitizeSpreadsheetCell(sb.buyerName),
      expected: sanitizeSpreadsheetCell(sb.expectedIncentivePaise / 100),
      credited: sanitizeSpreadsheetCell(sb.creditedIncentivePaise / 100),
      short: sanitizeSpreadsheetCell(sb.shortIncentivePaise / 100),
      notClaimed: sanitizeSpreadsheetCell(sb.notClaimedIncentivePaise / 100),
    });
  }
  styleHeaderRow(shortSheet);

  // 4. At-Risk Deadlines
  const riskSheet = workbook.addWorksheet("At-Risk Deadlines");
  riskSheet.columns = [
    { header: "IEC Code", key: "iecCode", width: 16 },
    { header: "Shipping Bill", key: "sbNumber", width: 18 },
    { header: "SB Date", key: "sbDate", width: 14 },
    { header: "Due Date", key: "dueDate", width: 14 },
    { header: "Days Left", key: "daysLeft", width: 12 },
    { header: "Buyer", key: "buyerName", width: 28 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Outstanding FOB", key: "outstanding", width: 18 },
    { header: "Status", key: "status", width: 18 },
  ];
  for (const sb of data.shipments.filter(
    (s) => s.isAtRisk || (s.isOverdue && !s.isMatchedAndClosed)
  )) {
    riskSheet.addRow({
      iecCode: sanitizeSpreadsheetCell(sb.iecCode),
      sbNumber: sanitizeSpreadsheetCell(sb.sbNumber),
      sbDate: sanitizeSpreadsheetCell(sb.sbDate),
      dueDate: sanitizeSpreadsheetCell(sb.realisationDueDate ?? ""),
      daysLeft: sanitizeSpreadsheetCell(sb.daysToDeadline ?? ""),
      buyerName: sanitizeSpreadsheetCell(sb.buyerName),
      currency: sanitizeSpreadsheetCell(sb.currency),
      outstanding: sanitizeSpreadsheetCell(sb.outstandingMinor / 100),
      status: sanitizeSpreadsheetCell(sb.status),
    });
  }
  styleHeaderRow(riskSheet);

  // 5. Expiring Scrips
  const scripsSheet = workbook.addWorksheet("Expiring Scrips");
  scripsSheet.columns = [
    { header: "IEC Code", key: "iecCode", width: 16 },
    { header: "Scrip Number", key: "scripNumber", width: 20 },
    { header: "Scheme", key: "scheme", width: 12 },
    { header: "Face Value (INR)", key: "faceValue", width: 18 },
    { header: "Generated On", key: "generatedOn", width: 14 },
    { header: "Expires On", key: "expiresOn", width: 14 },
    { header: "Days Remaining", key: "daysToExpiry", width: 15 },
  ];
  for (const scrip of data.expiringScrips) {
    scripsSheet.addRow({
      iecCode: sanitizeSpreadsheetCell(scrip.iecCode),
      scripNumber: sanitizeSpreadsheetCell(scrip.scripNumber),
      scheme: sanitizeSpreadsheetCell(scrip.scheme.toUpperCase()),
      faceValue: sanitizeSpreadsheetCell(scrip.faceMinor / 100),
      generatedOn: sanitizeSpreadsheetCell(scrip.generatedOn),
      expiresOn: sanitizeSpreadsheetCell(scrip.expiresOn),
      daysToExpiry: sanitizeSpreadsheetCell(scrip.daysToExpiry),
    });
  }
  styleHeaderRow(scripsSheet);

  // 6. Unmatched Payments
  const paymentsSheet = workbook.addWorksheet("Unmatched Payments");
  paymentsSheet.columns = [
    { header: "IEC Code", key: "iecCode", width: 16 },
    { header: "IRM Number", key: "irmNumber", width: 22 },
    { header: "Bank", key: "bankName", width: 24 },
    { header: "Date", key: "remittanceDate", width: 14 },
    { header: "Remitter", key: "remitterName", width: 28 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Total Amount", key: "amount", width: 16 },
    { header: "Unutilised Balance", key: "unutilised", width: 18 },
  ];
  for (const rem of data.unmatchedPayments) {
    paymentsSheet.addRow({
      iecCode: sanitizeSpreadsheetCell(rem.iecCode),
      irmNumber: sanitizeSpreadsheetCell(rem.irmNumber),
      bankName: sanitizeSpreadsheetCell(rem.bankName),
      remittanceDate: sanitizeSpreadsheetCell(rem.remittanceDate),
      remitterName: sanitizeSpreadsheetCell(rem.remitterName),
      currency: sanitizeSpreadsheetCell(rem.currency),
      amount: sanitizeSpreadsheetCell(rem.amountMinor / 100),
      unutilised: sanitizeSpreadsheetCell(rem.unutilisedMinor / 100),
    });
  }
  styleHeaderRow(paymentsSheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
