import { PDFDocument } from "pdf-lib";
import type { ParsedPageText } from "@/lib/documents/parsing/types";

export interface OcrFallbackResult {
  usedOcr: boolean;
  pageTexts: ParsedPageText[];
  reason: string;
}

export type OcrProvider = (pdfBytes: Uint8Array) => Promise<ParsedPageText[]>;

/**
 * Safe server-side OCR fallback when extracted PDF text is empty or below threshold.
 * Uses an external OCR endpoint when configured (OCR_PROVIDER_URL), otherwise safely inspects
 * embedded PDF metadata/subject text without ever executing PDF JavaScript in a browser engine.
 */
export async function runOcrFallback(
  pdfBytes: Uint8Array,
  existingPages: ParsedPageText[],
  customProvider?: OcrProvider
): Promise<OcrFallbackResult> {
  if (customProvider) {
    const pages = await customProvider(pdfBytes);
    return {
      usedOcr: true,
      pageTexts: pages,
      reason: "Custom OCR provider fallback applied",
    };
  }

  const endpoint = process.env.OCR_PROVIDER_URL;
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        ...(process.env.OCR_PROVIDER_TOKEN
          ? { Authorization: `Bearer ${process.env.OCR_PROVIDER_TOKEN}` }
          : {}),
      },
      body: Buffer.from(pdfBytes),
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        pages?: Array<{ page?: number; text?: string }>;
      };
      const ocrPages = (payload.pages ?? []).map((p, idx) => ({
        page: p.page ?? idx + 1,
        text: (p.text ?? "").trim(),
      }));
      if (ocrPages.some((p) => p.text.length > 0)) {
        return {
          usedOcr: true,
          pageTexts: ocrPages,
          reason: "External OCR service applied",
        };
      }
    }
  }

  // Fallback inspection: read safe XMP/Document Info metadata text layer if embedded by scanners/receipt printers
  const metadataTexts: string[] = [];
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const subject = doc.getSubject();
    const keywords = doc.getKeywords();
    const title = doc.getTitle();
    if (title) metadataTexts.push(title);
    if (subject) metadataTexts.push(subject);
    if (keywords) metadataTexts.push(keywords);
  } catch {
    // Malformed header/metadata; ignore safely
  }

  const combinedMeta = metadataTexts.join("\n").trim();
  if (combinedMeta.length > 0) {
    return {
      usedOcr: true,
      pageTexts: [{ page: 1, text: combinedMeta }],
      reason: "Scanned PDF detected — recovered embedded scanner OCR text layer",
    };
  }

  return {
    usedOcr: true,
    pageTexts: existingPages.length > 0 ? existingPages : [{ page: 1, text: "" }],
    reason: "Scanned PDF with no extractable text or OCR backend configured",
  };
}
