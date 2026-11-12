import { extractText } from "unpdf";
import type { ParsedPageText } from "@/lib/documents/parsing/types";

export interface PdfTextExtractionResult {
  pageTexts: ParsedPageText[];
  totalPages: number;
  totalMeaningfulChars: number;
  isLikelyScanned: boolean;
}

const SCANNED_CHAR_THRESHOLD = 60;

export async function extractPdfPagesText(pdfBytes: Uint8Array): Promise<PdfTextExtractionResult> {
  const result = await extractText(new Uint8Array(pdfBytes), { mergePages: false });
  const rawPages = Array.isArray(result.text) ? result.text : [String(result.text ?? "")];
  const pageTexts: ParsedPageText[] = rawPages.map((text, idx) => ({
    page: idx + 1,
    text: text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trim(),
  }));

  const totalMeaningfulChars = pageTexts.reduce(
    (sum, page) => sum + page.text.replace(/\s+/g, "").length,
    0
  );

  return {
    pageTexts,
    totalPages: result.totalPages || pageTexts.length || 1,
    totalMeaningfulChars,
    isLikelyScanned: totalMeaningfulChars < SCANNED_CHAR_THRESHOLD,
  };
}
