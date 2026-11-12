import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { runShippingBillFixtureBenchmark } from "@/lib/documents/parsing/benchmark";
import { runShippingBillParsePipeline } from "@/lib/documents/parsing/pipeline";
import { parseDecimalMoneyToMinorUnits } from "@/lib/documents/parsing/types";
import { isShippingBillCalculationEligible } from "@/lib/documents/parsing/validator";

describe("Prompt 6 Shipping Bill Parser Pipeline", () => {
  it("converts decimal FOB strings to exact integer minor units without floating point", () => {
    expect(parseDecimalMoneyToMinorUnits("20,250.50")).toBe(2025050);
    expect(parseDecimalMoneyToMinorUnits("85509.5")).toBe(8550950);
    expect(parseDecimalMoneyToMinorUnits("19.995")).toBe(2000);
    expect(parseDecimalMoneyToMinorUnits("2125000.00")).toBe(212500000);
  });

  it("achieves >= 95% correct-or-flagged accuracy across /fixtures/shipping-bills/ and generates markdown report", async () => {
    const report = await runShippingBillFixtureBenchmark();
    expect(report.totalFiles).toBe(12);

    const reportPath = path.resolve(process.cwd(), "docs", "shipping-bill-parser-accuracy.md");
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, report.markdown, "utf8");

    for (const fileResult of report.files) {
      expect(fileResult.mismatches, `Fixture ${fileResult.file}`).toEqual([]);
      expect(fileResult.actualStatus, `Status ${fileResult.file}`).toBe(fileResult.expectedStatus);
    }

    for (const row of report.fields) {
      expect(row.precision, `Precision for ${row.field}`).toBeGreaterThanOrEqual(0.95);
      expect(row.safeCoverage, `Safe coverage for ${row.field}`).toBeGreaterThanOrEqual(0.95);
    }
  }, 15000);

  it("caps AI spend strictly per document across retries and falls back to needs_review", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawText(
      "INDIAN CUSTOMS EXPORT PRINT | PORT CODE: INNSA1 | SHIPPING BILL NO: 7123456 | CURRENCY: USD",
      {
        x: 40,
        y: 780,
        size: 11,
      }
    );
    const pdfBytes = new Uint8Array(await doc.save());

    const buildPatchResponse = async () => ({
      patch: {
        sbDate: "2026-10-14",
        invoiceNo: "INV-AI-01",
        buyerName: "AI BUYER LTD",
        fobAmount: "1500.00",
        items: [
          {
            hsCode: "62052000",
            description: "COTTON SHIRTS",
            quantity: "100",
            uqc: "PCS",
            fobAmount: "1500.00",
          },
        ],
      },
      tokensUsed: 900,
      costPaise: 120,
    });
    const mockAi = vi.fn(buildPatchResponse);

    // Run 1: spends 120 paise out of 150 paise cap
    const first = await runShippingBillParsePipeline({
      pdfBytes,
      aiParsingEnabled: true,
      alreadySpentAiPaise: 0,
      maxAiCostPerDocPaise: 150,
      aiProvider: mockAi,
    });
    expect(mockAi).toHaveBeenCalledTimes(1);
    expect(first.aiCostPaise).toBe(120);
    // AI fields have low confidence (<0.85) so bill STILL requires human review before calculation
    expect(first.finalStatus).toBe("needs_review");
    expect(
      isShippingBillCalculationEligible({
        status: first.finalStatus,
        needsReviewFields: first.validation.needsReviewFields,
      })
    ).toBe(false);

    // Run 2 (retry): alreadySpent = 120 leaves only 30 paise (< base threshold 35) -> cap blocks second AI call
    const mockAiRetry = vi.fn(buildPatchResponse);
    const second = await runShippingBillParsePipeline({
      pdfBytes,
      aiParsingEnabled: true,
      alreadySpentAiPaise: 120,
      maxAiCostPerDocPaise: 150,
      aiProvider: mockAiRetry,
    });
    expect(mockAiRetry).not.toHaveBeenCalled();
    expect(second.aiCostPaise).toBe(0);
    expect(second.aiCapExceeded).toBe(true);
    expect(second.finalStatus).toBe("needs_review");
  });

  it("never calls AI provider when organization disables AI parsing fallback", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawText("PORT CODE: INNSA1 | SHIPPING BILL NO: 7123456 | CURRENCY: USD", {
      x: 40,
      y: 780,
      size: 11,
    });
    const pdfBytes = new Uint8Array(await doc.save());

    const mockAi = vi.fn(async () => ({
      patch: { buyerName: "SHOULD NOT RUN" },
      tokensUsed: 100,
      costPaise: 10,
    }));

    const res = await runShippingBillParsePipeline({
      pdfBytes,
      aiParsingEnabled: false,
      alreadySpentAiPaise: 0,
      maxAiCostPerDocPaise: 200,
      aiProvider: mockAi,
    });

    expect(mockAi).not.toHaveBeenCalled();
    expect(res.aiCostPaise).toBe(0);
    expect(res.finalStatus).toBe("needs_review");
  });

  it("flags OCR fallback results with low confidence until human confirmation", async () => {
    const blankDoc = await PDFDocument.create();
    blankDoc.addPage([595, 842]);
    const pdfBytes = new Uint8Array(await blankDoc.save());

    const res = await runShippingBillParsePipeline({
      pdfBytes,
      aiParsingEnabled: false,
      ocrProvider: async () => [
        {
          page: 1,
          text: "Port Code: INNSA1 | SB No: 8899112 | SB Date: 05/11/2026 | Inv No: OCR-1 | Buyer: OCR TEST CO | Currency: USD | 1 62052000 SHIRTS 100 PCS 1000.00 | Total FOB: USD 1000.00",
        },
      ],
    });

    expect(res.usedOcrFallback).toBe(true);
    expect(res.strategy).toBe("ocr_deterministic");
    expect(res.finalStatus).toBe("needs_review");
    expect(res.draft.fieldConfidence.sbNumber?.confidence).toBeLessThan(0.85);
    expect(
      isShippingBillCalculationEligible({
        status: res.finalStatus,
        needsReviewFields: res.validation.needsReviewFields,
      })
    ).toBe(false);
    expect(
      isShippingBillCalculationEligible({
        status: "parsed",
        needsReviewFields: [],
        confidenceConfirmedAt: "2026-11-12T08:00:00Z",
      })
    ).toBe(true);
  });
});
