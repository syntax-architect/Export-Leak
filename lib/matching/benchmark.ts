import fs from "node:fs/promises";
import path from "node:path";
import { parseIrmSheetForImport } from "@/lib/matching/irm-importer";
import { runMatchingEngine } from "@/lib/matching/matching-engine";
import type {
  IrmRowError,
  MatchingEngineResult,
  MatchingRemittanceInput,
  MatchingShippingBillInput,
} from "@/lib/matching/types";

interface FixtureBillsFile {
  description: string;
  shippingBills: Array<MatchingShippingBillInput & { expectedOutcome: string }>;
}

export interface IrmFixtureBenchmarkSummary {
  validRemittancesCount: number;
  failedRows: IrmRowError[];
  result: MatchingEngineResult;
  markdown: string;
}

export async function runIrmFixtureBenchmark(params?: {
  fixturesDir?: string;
  reportPath?: string;
}): Promise<IrmFixtureBenchmarkSummary> {
  const fixturesDir = params?.fixturesDir ?? path.resolve(process.cwd(), "fixtures", "irm");
  const reportPath =
    params?.reportPath ?? path.resolve(process.cwd(), "docs", "irm-matching-report.md");

  const xlsxBytes = await fs.readFile(path.join(fixturesDir, "irm-dgft-edpms-sample.xlsx"));
  const csvBytes = await fs.readFile(path.join(fixturesDir, "irm-hdfc-bank-export.csv"));
  const billsRaw = await fs.readFile(path.join(fixturesDir, "irm-expected-bills.json"), "utf8");
  const scenario = JSON.parse(billsRaw) as FixtureBillsFile;

  const xlsxResult = await parseIrmSheetForImport({
    filename: "irm-dgft-edpms-sample.xlsx",
    bytes: new Uint8Array(xlsxBytes),
  });
  const csvResult = await parseIrmSheetForImport({
    filename: "irm-hdfc-bank-export.csv",
    bytes: new Uint8Array(csvBytes),
  });

  const combinedValid = [...xlsxResult.validRows, ...csvResult.validRows];
  const combinedFailed = [...xlsxResult.failedRows, ...csvResult.failedRows];

  const remittances: MatchingRemittanceInput[] = combinedValid.map((row, idx) => ({
    id: `rem-fx-${String(idx + 1).padStart(2, "0")}`,
    iecId: "iec-demo",
    irmNumber: row.irmNumber,
    bankName: row.bankName,
    remittanceDate: row.remittanceDate,
    currency: row.currency,
    amountMinor: row.amountMinor,
    utilisedMinor: row.utilisedMinor,
    remitterName: row.remitterName,
    invoiceReference: row.invoiceReference,
  }));

  const engineResult = runMatchingEngine({
    shippingBills: scenario.shippingBills,
    remittances,
  });

  const lines: string[] = [
    "# IRM Import & Matching Report",
    "",
    `Generated from \`fixtures/irm\` (\`irm-dgft-edpms-sample.xlsx\` and \`irm-hdfc-bank-export.csv\`).`,
    "",
    "> **Note:** Sample files in \`fixtures/irm\` are synthetic baseline exports created until real anonymised DGFT/bank IRM exports are dropped in.",
    "",
    "## Summary Counts",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Total Shipping Bills | ${scenario.shippingBills.length} |`,
    `| Imported Valid Remittances | ${remittances.length} |`,
    `| Failed Import Rows Reported | ${combinedFailed.length} |`,
    `| Auto-Confirmed Matches | ${engineResult.autoConfirmed.length} |`,
    `| Review Matches Suggestions | ${engineResult.reviewSuggestions.length} |`,
    "",
    "## Auto-Confirmed Matches",
    "",
    "| SB # | IRM # | Currency | Allocated (minor) | Confidence | Pattern | Explanation |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
  ];

  for (const m of engineResult.autoConfirmed) {
    lines.push(
      `| \`${m.sbNumber}\` | \`${m.irmNumber}\` | ${m.currency} | ${m.proposedMinor} | ${m.confidence.toFixed(4)} | \`${m.signals.pattern}\` | ${m.explanation} |`
    );
  }

  lines.push(
    "",
    "## Sent to Review Matches",
    "",
    "| SB # | IRM # | Currency | Proposed (minor) | Confidence | Pattern | Explanation |",
    "| --- | --- | --- | ---: | ---: | --- | --- |"
  );

  for (const s of engineResult.reviewSuggestions) {
    lines.push(
      `| \`${s.sbNumber}\` | \`${s.irmNumber}\` | ${s.currency} | ${s.proposedMinor} | ${s.confidence.toFixed(4)} | \`${s.signals.pattern}\` | ${s.explanation} |`
    );
  }

  lines.push(
    "",
    "## Failed Rows Reported During Import",
    "",
    "| Row # | IRM # | Failure Reason |",
    "| ---: | --- | --- |"
  );

  for (const err of combinedFailed) {
    lines.push(
      `| ${err.rowNumber} | ${err.irmNumber ? `\`${err.irmNumber}\`` : "N/A"} | ${err.reason} |`
    );
  }

  const markdown = `${lines.join("\n")}\n`;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, markdown, "utf8");

  return {
    validRemittancesCount: remittances.length,
    failedRows: combinedFailed,
    result: engineResult,
    markdown,
  };
}
