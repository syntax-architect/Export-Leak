import {
  type AiExtractorProvider,
  runAiFallbackForMissingFields,
} from "@/lib/documents/parsing/ai-extractor";
import { runDeterministicShippingBillParser } from "@/lib/documents/parsing/deterministic-parser";
import { type OcrProvider, runOcrFallback } from "@/lib/documents/parsing/ocr-fallback";
import { extractPdfPagesText } from "@/lib/documents/parsing/pdf-extract";
import type { ParsePipelineResult } from "@/lib/documents/parsing/types";
import { validateShippingBillDraft } from "@/lib/documents/parsing/validator";

export async function runShippingBillParsePipeline(params: {
  pdfBytes: Uint8Array;
  aiParsingEnabled?: boolean;
  alreadySpentAiPaise?: number;
  maxAiCostPerDocPaise?: number;
  ocrProvider?: OcrProvider;
  aiProvider?: AiExtractorProvider;
}): Promise<ParsePipelineResult> {
  // 1a. Extract text with PDF text library
  const extracted = await extractPdfPagesText(params.pdfBytes);
  let pageTexts = extracted.pageTexts;
  let usedOcrFallback = false;

  if (extracted.isLikelyScanned || params.ocrProvider) {
    if (extracted.isLikelyScanned) {
      const ocr = await runOcrFallback(params.pdfBytes, pageTexts, params.ocrProvider);
      usedOcrFallback = ocr.usedOcr;
      pageTexts = ocr.pageTexts;
    }
  }

  // 1b. Deterministic regex & anchor extraction across multiple layouts
  const draft = runDeterministicShippingBillParser({
    pages: pageTexts,
    usedOcrFallback,
  });

  // 1d (initial pass). Validate extracted fields
  let validation = validateShippingBillDraft(draft);

  // 1c. AI fallback ONLY for missing or validation-failed fields, capped per document
  let aiTokensUsed = 0;
  let aiCostPaise = 0;
  let aiCapExceeded = false;
  let usedAi = false;

  if (validation.needsReviewFields.length > 0) {
    const aiResult = await runAiFallbackForMissingFields({
      draft,
      pages: pageTexts,
      needsReviewFields: validation.needsReviewFields,
      aiParsingEnabled: params.aiParsingEnabled ?? true,
      alreadySpentPaise: params.alreadySpentAiPaise ?? 0,
      maxCapPaise: params.maxAiCostPerDocPaise,
      provider: params.aiProvider,
    });
    aiTokensUsed = aiResult.tokensUsed;
    aiCostPaise = aiResult.costPaise;
    aiCapExceeded = aiResult.capExceeded;
    usedAi = aiResult.applied;

    if (usedAi) {
      validation = validateShippingBillDraft(draft);
    }
  }

  const strategy = usedOcrFallback
    ? "ocr_deterministic"
    : usedAi
      ? "deterministic_plus_ai"
      : "deterministic";

  const finalStatus = validation.needsReviewFields.length === 0 ? "done" : "needs_review";

  return {
    draft,
    validation,
    pageTexts,
    usedOcrFallback,
    strategy,
    aiTokensUsed,
    aiCostPaise,
    aiCapExceeded,
    finalStatus,
  };
}
