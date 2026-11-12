import fs from "node:fs/promises";
import path from "node:path";
import { runShippingBillParsePipeline } from "@/lib/documents/parsing/pipeline";

export interface FixtureGroundTruthItem {
  hsCode: string;
  fobMinor: number;
  quantity: string;
  uqc: string;
}

export interface FixtureGroundTruthEntry {
  file: string;
  layout: string;
  truth: {
    sbNumber: string | null;
    sbDate: string | null;
    portCode: string | null;
    leoDate: string | null;
    invoiceNo: string | null;
    buyerName: string | null;
    currency: string | null;
    fobMinor: number | null;
    schemesClaimed: string[];
    expectedStatus: "done" | "needs_review";
    items: FixtureGroundTruthItem[];
  };
}

export interface FieldAccuracyRow {
  field: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  flaggedForReview: number;
  totalCases: number;
  precision: number;
  recall: number;
  safeCoverage: number;
}

export interface BenchmarkFileResult {
  file: string;
  layout: string;
  expectedStatus: "done" | "needs_review";
  actualStatus: "done" | "needs_review";
  usedOcrFallback: boolean;
  aiCostPaise: number;
  needsReviewFields: string[];
  mismatches: string[];
}

export interface BenchmarkReport {
  totalFiles: number;
  fields: FieldAccuracyRow[];
  files: BenchmarkFileResult[];
  markdown: string;
}

const TRACKED_FIELDS = [
  "sbNumber",
  "sbDate",
  "portCode",
  "leoDate",
  "invoiceNo",
  "buyerName",
  "currency",
  "fobMinor",
  "itemHsCodes",
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

export async function runShippingBillFixtureBenchmark(
  fixturesDir = path.resolve(process.cwd(), "fixtures", "shipping-bills")
): Promise<BenchmarkReport> {
  const gtRaw = await fs.readFile(path.join(fixturesDir, "ground-truth.json"), "utf8");
  const entries = JSON.parse(gtRaw) as FixtureGroundTruthEntry[];

  const metrics: Record<
    TrackedField,
    { tp: number; fp: number; fn: number; flagged: number; total: number }
  > = {
    sbNumber: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    sbDate: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    portCode: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    leoDate: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    invoiceNo: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    buyerName: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    currency: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    fobMinor: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
    itemHsCodes: { tp: 0, fp: 0, fn: 0, flagged: 0, total: 0 },
  };

  const fileResults: BenchmarkFileResult[] = [];

  for (const entry of entries) {
    const pdfBytes = new Uint8Array(await fs.readFile(path.join(fixturesDir, entry.file)));
    const result = await runShippingBillParsePipeline({
      pdfBytes,
      aiParsingEnabled: false,
      alreadySpentAiPaise: 0,
    });

    const mismatches: string[] = [];
    const needsSet = new Set(result.validation.needsReviewFields);

    const scoreScalar = (
      field: Exclude<TrackedField, "itemHsCodes">,
      actual: string | number | null,
      expected: string | number | null
    ) => {
      const m = metrics[field];
      const normalizedActual = typeof actual === "string" ? actual.trim().toUpperCase() : actual;
      const normalizedExpected =
        typeof expected === "string" ? expected.trim().toUpperCase() : expected;

      if (normalizedExpected === null) {
        if (normalizedActual !== null) {
          m.fp += 1;
          mismatches.push(`${field}: unexpected "${String(actual)}"`);
        }
        return;
      }

      m.total += 1;
      const isFlagged = needsSet.has(field) || result.finalStatus === "needs_review";
      if (normalizedActual === normalizedExpected) {
        m.tp += 1;
      } else if (isFlagged) {
        m.flagged += 1;
        m.fn += 1;
      } else if (normalizedActual !== null) {
        m.fp += 1;
        m.fn += 1;
        mismatches.push(`${field}: expected "${String(expected)}", got "${String(actual)}"`);
      } else {
        m.fn += 1;
        mismatches.push(`${field}: missing (expected "${String(expected)}")`);
      }
    };

    scoreScalar("sbNumber", result.draft.sbNumber, entry.truth.sbNumber);
    scoreScalar("sbDate", result.draft.sbDate, entry.truth.sbDate);
    scoreScalar("portCode", result.draft.portCode, entry.truth.portCode);
    scoreScalar("leoDate", result.draft.leoDate, entry.truth.leoDate);
    scoreScalar("invoiceNo", result.draft.invoiceNo, entry.truth.invoiceNo);
    scoreScalar("buyerName", result.draft.buyerName, entry.truth.buyerName);
    scoreScalar("currency", result.draft.currency, entry.truth.currency);
    scoreScalar("fobMinor", result.draft.fobMinor, entry.truth.fobMinor);

    // Line items HS code check
    const hsMetric = metrics.itemHsCodes;
    hsMetric.total += entry.truth.items.length;
    for (let idx = 0; idx < entry.truth.items.length; idx++) {
      const expectedItem = entry.truth.items[idx]!;
      const actualItem = result.draft.items[idx];
      const itemFlagged =
        result.finalStatus === "needs_review" || needsSet.has(`items[${idx}].hsCode`);

      if (actualItem && actualItem.hsCode === expectedItem.hsCode) {
        hsMetric.tp += 1;
      } else if (itemFlagged) {
        hsMetric.flagged += 1;
        hsMetric.fn += 1;
      } else if (actualItem) {
        hsMetric.fp += 1;
        hsMetric.fn += 1;
        mismatches.push(
          `items[${idx}].hsCode: expected ${expectedItem.hsCode}, got ${actualItem.hsCode}`
        );
      } else {
        hsMetric.fn += 1;
        mismatches.push(`items[${idx}].hsCode: missing`);
      }
    }

    if (result.finalStatus !== entry.truth.expectedStatus) {
      mismatches.push(`status: expected ${entry.truth.expectedStatus}, got ${result.finalStatus}`);
    }

    fileResults.push({
      file: entry.file,
      layout: entry.layout,
      expectedStatus: entry.truth.expectedStatus,
      actualStatus: result.finalStatus,
      usedOcrFallback: result.usedOcrFallback,
      aiCostPaise: result.aiCostPaise,
      needsReviewFields: result.validation.needsReviewFields,
      mismatches,
    });
  }

  const fields: FieldAccuracyRow[] = TRACKED_FIELDS.map((field) => {
    const m = metrics[field];
    const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 1;
    const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 1;
    const safeCoverage = m.total > 0 ? (m.tp + m.flagged) / m.total : 1;
    return {
      field,
      truePositives: m.tp,
      falsePositives: m.fp,
      falseNegatives: m.fn,
      flaggedForReview: m.flagged,
      totalCases: m.total,
      precision,
      recall,
      safeCoverage,
    };
  });

  const markdownLines = [
    "# Shipping Bill Parser Accuracy Report",
    "",
    `Generated from \`fixtures/shipping-bills\` (${entries.length} multi-layout synthetic fixture PDFs).`,
    "",
    "> **Note:** Fixtures in \`fixtures/shipping-bills\` are synthetic multi-layout prints created until real anonymised consultant/exporter PDFs are dropped in.",
    "",
    "## Field-Level Precision, Recall & Safe Coverage",
    "",
    "| Field | Cases | TP | FP | FN | Flagged for Review | Precision | Recall | Correct or Flagged |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...fields.map(
      (f) =>
        `| \`${f.field}\` | ${f.totalCases} | ${f.truePositives} | ${f.falsePositives} | ${f.falseNegatives} | ${f.flaggedForReview} | ${(f.precision * 100).toFixed(1)}% | ${(f.recall * 100).toFixed(1)}% | ${(f.safeCoverage * 100).toFixed(1)}% |`
    ),
    "",
    "## Document Results",
    "",
    "| Fixture | Layout | Expected | Actual | OCR Fallback | Review Fields | Mismatches |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...fileResults.map(
      (r) =>
        `| \`${r.file}\` | ${r.layout} | \`${r.expectedStatus}\` | \`${r.actualStatus}\` | ${r.usedOcrFallback ? "Yes" : "No"} | ${r.needsReviewFields.length > 0 ? r.needsReviewFields.join(", ") : "None"} | ${r.mismatches.length > 0 ? r.mismatches.join("; ") : "None"} |`
    ),
    "",
  ];

  return {
    totalFiles: entries.length,
    fields,
    files: fileResults,
    markdown: markdownLines.join("\n"),
  };
}
