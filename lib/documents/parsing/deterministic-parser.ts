import type { IncentiveScheme } from "@/lib/database.types";
import {
  type ExtractionMethod,
  type FieldConfidenceEntry,
  type FieldSourceSpan,
  KNOWN_ISO_CURRENCIES,
  normalizeDateStringToIso,
  type ParsedPageText,
  type ParsedShippingBillDraft,
  type ParsedShippingBillItemDraft,
  parseDecimalMoneyToMinorUnits,
} from "@/lib/documents/parsing/types";

interface AnchorMatch {
  value: string;
  confidence: number;
  span: FieldSourceSpan;
}

const KNOWN_UQC_LIST = [
  "PCS",
  "NOS",
  "KGS",
  "KGM",
  "SET",
  "MTR",
  "MTS",
  "SQM",
  "DOZ",
  "PAR",
  "PRS",
  "PAC",
  "BOX",
  "CTN",
  "LTR",
  "TON",
  "MMT",
  "GRM",
  "BAG",
  "BTL",
  "UNT",
  "ROL",
];

function createFieldConfidence(params: {
  confidence: number;
  span: FieldSourceSpan | null;
  usedOcrFallback: boolean;
  warnings?: string[];
}): FieldConfidenceEntry {
  const method: ExtractionMethod = params.usedOcrFallback ? "ocr_deterministic" : "deterministic";
  const cappedConfidence = params.usedOcrFallback
    ? Math.min(params.confidence, 0.62)
    : params.confidence;
  const warnings = [...(params.warnings ?? [])];
  if (params.usedOcrFallback && !warnings.includes("OCR fallback used — confirm against PDF")) {
    warnings.push("OCR fallback used — confirm against PDF");
  }
  return {
    confidence: Number(cappedConfidence.toFixed(2)),
    source: params.span,
    method,
    confirmed: false,
    warnings,
  };
}

function findFirstAcrossPages(
  pages: ParsedPageText[],
  patterns: Array<{ regex: RegExp; confidence: number; groupIndex?: number }>
): AnchorMatch | null {
  for (const { regex, confidence, groupIndex = 1 } of patterns) {
    for (const page of pages) {
      const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}`;
      const r = new RegExp(regex.source, flags);
      const m = r.exec(page.text);
      if (m && m[groupIndex]) {
        const rawGroup = m[groupIndex]!.trim();
        const fullStart = m.index;
        const groupOffset = m[0].indexOf(rawGroup);
        const start = groupOffset >= 0 ? fullStart + groupOffset : fullStart;
        const end = start + rawGroup.length;
        const contextStart = Math.max(0, start - 20);
        const contextEnd = Math.min(page.text.length, end + 20);
        return {
          value: rawGroup,
          confidence,
          span: {
            page: page.page,
            start,
            end,
            snippet: page.text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim(),
          },
        };
      }
    }
  }
  return null;
}

function cleanFieldText(raw: string): string {
  return (raw.split(/\r?\n/)[0] ?? "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s{2,}.*$/, "")
    .replace(/^[:\-#\s]+/, "")
    .trim();
}

function parseSchemesAcrossPages(pages: ParsedPageText[]): {
  schemes: IncentiveScheme[];
  span: FieldSourceSpan | null;
} {
  const found = new Set<IncentiveScheme>();
  let firstSpan: FieldSourceSpan | null = null;

  for (const page of pages) {
    const lineRegex =
      /(?:Schemes?\s*Claimed|Scheme\s*Details|Export\s*Scheme|Incentive\s*Claimed|Scheme\s*Code)[^\n]{0,120}/i;
    const headerMatch = lineRegex.exec(page.text);
    if (headerMatch) {
      firstSpan ??= {
        page: page.page,
        start: headerMatch.index,
        end: headerMatch.index + headerMatch[0].length,
        snippet: headerMatch[0].trim(),
      };
    }

    const rodtepPositive = /\bRoDTEP\b(?:\s*[:\-]\s*(?:YES|Y|CLAIMED|APPLIED))?/i.exec(page.text);
    if (rodtepPositive && !/\bRoDTEP\s*[:\-]\s*(?:NO|N|NIL|NA)\b/i.test(page.text)) {
      found.add("rodtep");
      firstSpan ??= {
        page: page.page,
        start: rodtepPositive.index,
        end: rodtepPositive.index + rodtepPositive[0].length,
        snippet: page.text.slice(
          Math.max(0, rodtepPositive.index - 12),
          Math.min(page.text.length, rodtepPositive.index + 40)
        ),
      };
    }

    const dbkPositive =
      /\b(?:Duty\s*Drawback|Drawback|DBK)\b(?:\s*[:\-]\s*(?:YES|Y|CLAIMED))?/i.exec(page.text);
    if (
      dbkPositive &&
      !/\b(?:Duty\s*Drawback|Drawback|DBK)\s*[:\-]\s*(?:NO|N|NIL|NA)\b/i.test(page.text)
    ) {
      found.add("drawback");
      firstSpan ??= {
        page: page.page,
        start: dbkPositive.index,
        end: dbkPositive.index + dbkPositive[0].length,
        snippet: page.text.slice(
          Math.max(0, dbkPositive.index - 12),
          Math.min(page.text.length, dbkPositive.index + 40)
        ),
      };
    }

    const rosctlPositive = /\bRoSCTL\b(?:\s*[:\-]\s*(?:YES|Y|CLAIMED))?/i.exec(page.text);
    if (rosctlPositive && !/\bRoSCTL\s*[:\-]\s*(?:NO|N|NIL|NA)\b/i.test(page.text)) {
      found.add("rosctl");
      firstSpan ??= {
        page: page.page,
        start: rosctlPositive.index,
        end: rosctlPositive.index + rosctlPositive[0].length,
        snippet: page.text.slice(
          Math.max(0, rosctlPositive.index - 12),
          Math.min(page.text.length, rosctlPositive.index + 40)
        ),
      };
    }
  }

  return { schemes: Array.from(found), span: firstSpan };
}

function parseLineItemsAcrossPages(
  pages: ParsedPageText[],
  usedOcrFallback: boolean
): ParsedShippingBillItemDraft[] {
  const items: ParsedShippingBillItemDraft[] = [];
  const uqcAlternation = KNOWN_UQC_LIST.join("|");

  // Layout A: Tabular / pipe / whitespace separated rows
  // Examples:
  //   1 | 62052000 | MEN COTTON WOVEN SHIRTS | 1200 | PCS | 14,400.00
  //   1  62052000  MEN COTTON SHIRTS  1200  PCS  14400.00
  const rowRegex = new RegExp(
    `(?:^|\\n)\\s*(?:\\d{1,3}(?:\\s*\\|\\s*|\\t|\\s+))?(\\d{6,8})(?:\\s*\\|\\s*|\\t|\\s+)([A-Za-z0-9][^\\n\\r|]{2,90}?)\\s*(?:\\|\\s*|\\s+)([0-9][0-9,]*(?:\\.[0-9]{1,4})?)\\s*(?:\\|\\s*|\\s+)(${uqcAlternation}|[A-Z]{2,4})\\b\\s*(?:\\|\\s*|\\s+)(?:USD|EUR|GBP|INR|AED|SGD|CHF|JPY|AUD|CAD)?\\s*([0-9][0-9,]*\\.[0-9]{1,2}|[0-9][0-9,]+)(?=\\s*(?:\\||$|\\n|\\r))`,
    "gi"
  );

  // Layout B: ICEGATE vertical item block
  // Examples:
  //   Item No: 1
  //   RITC / HS Code: 62052000
  //   Description: MEN COTTON SHIRTS
  //   Quantity: 1200 PCS
  //   FOB Value: 14400.00
  const blockRegex =
    /(?:Item\s*(?:No|Sr\.?|#)\s*[:\-]?\s*\d{1,3})[\s\S]{0,360}?(?:RITC\s*\/?\s*HS\s*Code|HS\s*Code|RITC)\s*[:\-]?\s*(\d{6,8})[\s\S]{0,180}?(?:Description|Item\s*Desc(?:ription)?)\s*[:\-]?\s*([^\n]+)[\s\S]{0,180}?(?:Qty|Quantity)\s*[:\-]?\s*([0-9][0-9,]*(?:\.[0-9]{1,4})?)\s*([A-Z]{2,4})[\s\S]{0,180}?(?:Item\s*FOB|FOB(?:\s*Value)?(?:\s*\(FC\))?)\s*[:\-]?\s*(?:USD|EUR|GBP|INR|AED|SGD|CHF|JPY|AUD|CAD)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;

  for (const page of pages) {
    const itemsBeforePage = items.length;
    rowRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rowRegex.exec(page.text)) !== null) {
      const hsRaw = (m[1] ?? "").trim();
      const descRaw = cleanFieldText(m[2] ?? "");
      const qtyRaw = (m[3] ?? "").replace(/,/g, "").trim();
      const uqcRaw = (m[4] ?? "").trim().toUpperCase();
      const fobRaw = (m[5] ?? "").trim();

      // Guard against picking up summary/total lines
      if (/^(?:TOTAL|GRAND\s*TOTAL|SUB\s*TOTAL)/i.test(descRaw)) continue;
      if (descRaw.length < 3 || !/^[A-Za-z]/.test(descRaw)) continue;

      const fobMinor = parseDecimalMoneyToMinorUnits(fobRaw);
      if (fobMinor === null) continue;

      const start = m.index;
      const end = m.index + m[0].length;
      const span: FieldSourceSpan = {
        page: page.page,
        start,
        end,
        snippet: m[0].replace(/\s+/g, " ").trim(),
      };

      const hsConfidence = /^\d{8}$/.test(hsRaw) ? 0.96 : 0.45;
      const warnings: string[] = [];
      if (!/^\d{8}$/.test(hsRaw)) {
        warnings.push(`HS code "${hsRaw}" must be 8 digits`);
      }

      items.push({
        hsCode: hsRaw.padEnd(8, "0").slice(0, 8),
        description: descRaw,
        quantity: qtyRaw,
        uqc: uqcRaw,
        fobMinor,
        fieldConfidence: {
          hsCode: createFieldConfidence({
            confidence: hsConfidence,
            span,
            usedOcrFallback,
            warnings,
          }),
          description: createFieldConfidence({ confidence: 0.94, span, usedOcrFallback }),
          quantity: createFieldConfidence({ confidence: 0.94, span, usedOcrFallback }),
          uqc: createFieldConfidence({
            confidence: KNOWN_UQC_LIST.includes(uqcRaw) ? 0.95 : 0.72,
            span,
            usedOcrFallback,
          }),
          fobMinor: createFieldConfidence({ confidence: 0.95, span, usedOcrFallback }),
        },
      });
    }

    if (items.length === itemsBeforePage) {
      blockRegex.lastIndex = 0;
      let b: RegExpExecArray | null;
      while ((b = blockRegex.exec(page.text)) !== null) {
        const hsRaw = (b[1] ?? "").trim();
        const descRaw = cleanFieldText(b[2] ?? "");
        const qtyRaw = (b[3] ?? "").replace(/,/g, "").trim();
        const uqcRaw = (b[4] ?? "").trim().toUpperCase();
        const fobRaw = (b[5] ?? "").trim();
        const fobMinor = parseDecimalMoneyToMinorUnits(fobRaw);
        if (fobMinor === null) continue;

        const span: FieldSourceSpan = {
          page: page.page,
          start: b.index,
          end: b.index + b[0].length,
          snippet: b[0].replace(/\s+/g, " ").trim().slice(0, 180),
        };
        const warnings = /^\d{8}$/.test(hsRaw) ? [] : [`HS code "${hsRaw}" must be 8 digits`];

        items.push({
          hsCode: hsRaw.padEnd(8, "0").slice(0, 8),
          description: descRaw,
          quantity: qtyRaw,
          uqc: uqcRaw,
          fobMinor,
          fieldConfidence: {
            hsCode: createFieldConfidence({
              confidence: /^\d{8}$/.test(hsRaw) ? 0.95 : 0.45,
              span,
              usedOcrFallback,
              warnings,
            }),
            description: createFieldConfidence({ confidence: 0.93, span, usedOcrFallback }),
            quantity: createFieldConfidence({ confidence: 0.93, span, usedOcrFallback }),
            uqc: createFieldConfidence({
              confidence: KNOWN_UQC_LIST.includes(uqcRaw) ? 0.94 : 0.7,
              span,
              usedOcrFallback,
            }),
            fobMinor: createFieldConfidence({ confidence: 0.94, span, usedOcrFallback }),
          },
        });
      }
    }
  }

  return items;
}

export function runDeterministicShippingBillParser(params: {
  pages: ParsedPageText[];
  usedOcrFallback: boolean;
}): ParsedShippingBillDraft {
  const { pages, usedOcrFallback } = params;
  const fieldConfidence: Record<string, FieldConfidenceEntry> = {};

  const sbMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /(?:Shipping\s*Bill\s*(?:No|Number)\.?|S\/?B\s*(?:No|Number)\.?)\s*[:\-]?\s*([0-9]{5,10})\b/i,
      confidence: 0.97,
    },
    {
      regex: /\bSB\s*#\s*([0-9]{5,10})\b/i,
      confidence: 0.93,
    },
  ]);
  const sbNumber = sbMatch ? sbMatch.value : null;
  fieldConfidence.sbNumber = createFieldConfidence({
    confidence: sbMatch ? sbMatch.confidence : 0,
    span: sbMatch?.span ?? null,
    usedOcrFallback,
    warnings: sbMatch ? [] : ["Shipping Bill number not detected"],
  });

  const sbDateMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /(?:Shipping\s*Bill\s*Date|S\/?B\s*(?:Date|Dt\.?)|Date\s*of\s*Filing)\s*[:\-]?\s*([0-9]{1,4}[\/\-\s](?:[0-9]{1,2}|[A-Za-z]{3,4})[\/\-\s][0-9]{2,4})/i,
      confidence: 0.96,
    },
  ]);
  const sbDate = sbDateMatch ? normalizeDateStringToIso(sbDateMatch.value) : null;
  fieldConfidence.sbDate = createFieldConfidence({
    confidence: sbDate ? sbDateMatch!.confidence : sbDateMatch ? 0.45 : 0,
    span: sbDateMatch?.span ?? null,
    usedOcrFallback,
    warnings: sbDate
      ? []
      : sbDateMatch
        ? [`Unrecognized SB Date format "${sbDateMatch.value}"`]
        : ["Shipping Bill date not detected"],
  });

  const portMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /\b(?:Port\s*Code|Port\s*of\s*Loading|Custom\s*Station|Port)\b\s*[:\-]?\s*([A-Z]{4,5}[0-9A-Z])\b/i,
      confidence: 0.96,
    },
    {
      regex: /\b(IN[A-Z]{3}[0-9A-Z])\b/,
      confidence: 0.9,
    },
  ]);
  const portCode = portMatch ? portMatch.value.toUpperCase() : null;
  fieldConfidence.portCode = createFieldConfidence({
    confidence: portMatch ? portMatch.confidence : 0,
    span: portMatch?.span ?? null,
    usedOcrFallback,
    warnings: portMatch ? [] : ["Port code not detected"],
  });

  const leoMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /(?:LEO\s*(?:Date|Dt\.?)|Let\s*Export\s*(?:Order)?\s*Date)\s*[:\-]?\s*([0-9]{1,4}[\/\-\s](?:[0-9]{1,2}|[A-Za-z]{3,4})[\/\-\s][0-9]{2,4})/i,
      confidence: 0.94,
    },
  ]);
  const leoDate = leoMatch ? normalizeDateStringToIso(leoMatch.value) : null;
  fieldConfidence.leoDate = createFieldConfidence({
    confidence: leoDate ? leoMatch!.confidence : leoMatch ? 0.45 : 0.7,
    span: leoMatch?.span ?? null,
    usedOcrFallback,
    warnings:
      leoMatch && !leoDate
        ? [`Unrecognized LEO Date format "${leoMatch.value}"`]
        : !leoMatch
          ? ["LEO Date not found (optional if not yet granted)"]
          : [],
  });

  const invoiceMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /(?:Invoice\s*(?:No|Number)\.?|Inv\.?\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-\._]{1,40})/i,
      confidence: 0.95,
    },
  ]);
  const invoiceNo = invoiceMatch ? cleanFieldText(invoiceMatch.value) : null;
  fieldConfidence.invoiceNo = createFieldConfidence({
    confidence: invoiceNo ? invoiceMatch!.confidence : 0,
    span: invoiceMatch?.span ?? null,
    usedOcrFallback,
    warnings: invoiceNo ? [] : ["Invoice number not detected"],
  });

  const buyerMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /(?:Buyer(?:'s)?\s*(?:Name(?:\s*&\s*Address)?)?|Consignee\s*(?:Name)?)\s*[:\-]?\s*([A-Za-z0-9][^\n\r|]{2,90})/i,
      confidence: 0.92,
    },
  ]);
  const buyerName = buyerMatch ? cleanFieldText(buyerMatch.value) : null;
  fieldConfidence.buyerName = createFieldConfidence({
    confidence: buyerName ? buyerMatch!.confidence : 0,
    span: buyerMatch?.span ?? null,
    usedOcrFallback,
    warnings: buyerName ? [] : ["Buyer name not detected"],
  });

  const currencyMatch = findFirstAcrossPages(pages, [
    {
      regex: /(?:Invoice\s*Currency|Currency\s*Code|Currency)\s*[:\-]?\s*([A-Z]{3})\b/i,
      confidence: 0.96,
    },
    {
      regex: /(?:Total\s*FOB|FOB\s*(?:Value)?(?:\s*\(FC\))?)\s*[:\-]?\s*([A-Z]{3})\s*[0-9]/i,
      confidence: 0.92,
    },
  ]);
  const currency = currencyMatch ? currencyMatch.value.toUpperCase() : null;
  fieldConfidence.currency = createFieldConfidence({
    confidence:
      currency && KNOWN_ISO_CURRENCIES.has(currency)
        ? currencyMatch!.confidence
        : currency
          ? 0.4
          : 0,
    span: currencyMatch?.span ?? null,
    usedOcrFallback,
    warnings:
      currency && !KNOWN_ISO_CURRENCIES.has(currency)
        ? [`Unknown currency code "${currency}"`]
        : !currency
          ? ["Currency code not detected"]
          : [],
  });

  const exchangeRateMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /(?:Exchange\s*Rate|Exch\.?\s*Rate)\s*[:\-]?\s*(?:1\s*[A-Z]{3}\s*=\s*(?:INR|Rs\.?)?\s*)?([0-9]{1,5}(?:\.[0-9]{1,6})?)/i,
      confidence: 0.94,
    },
  ]);
  const exchangeRate = exchangeRateMatch ? exchangeRateMatch.value.replace(/,/g, "") : null;
  fieldConfidence.exchangeRate = createFieldConfidence({
    confidence: exchangeRate ? exchangeRateMatch!.confidence : currency === "INR" ? 0.95 : 0.72,
    span: exchangeRateMatch?.span ?? null,
    usedOcrFallback,
    warnings:
      !exchangeRate && currency !== "INR"
        ? ["Exchange rate not found — review if INR conversion is needed"]
        : [],
  });

  const fobMatch = findFirstAcrossPages(pages, [
    {
      regex:
        /Total\s*FOB\s*(?:Value|Amount)?(?:\s*\((?:FC|Foreign\s*Currency|INR)\))?\s*[:\-]?\s*(?:[A-Z]{3}\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      confidence: 0.96,
    },
    {
      regex:
        /(?:FOB\s*Amount|(?<!Item\s)FOB\s*(?:Value|Amount)(?:\s*\(FC\))?)\s*[:\-]?\s*(?:[A-Z]{3}\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
      confidence: 0.94,
    },
  ]);
  const fobMinor = fobMatch ? parseDecimalMoneyToMinorUnits(fobMatch.value) : null;
  fieldConfidence.fobMinor = createFieldConfidence({
    confidence: fobMinor !== null ? fobMatch!.confidence : 0,
    span: fobMatch?.span ?? null,
    usedOcrFallback,
    warnings: fobMinor !== null ? [] : ["Total FOB value not detected"],
  });

  const schemesParsed = parseSchemesAcrossPages(pages);
  fieldConfidence.schemesClaimed = createFieldConfidence({
    confidence: schemesParsed.span ? 0.92 : 0.75,
    span: schemesParsed.span,
    usedOcrFallback,
    warnings: schemesParsed.span
      ? []
      : ["No explicit scheme header matched — verify claimed schemes"],
  });

  const items = parseLineItemsAcrossPages(pages, usedOcrFallback);
  if (items.length === 0) {
    fieldConfidence.items = createFieldConfidence({
      confidence: 0,
      span: null,
      usedOcrFallback,
      warnings: ["No line items with HS code and FOB value were detected"],
    });
  }

  return {
    sbNumber,
    sbDate,
    portCode,
    leoDate,
    invoiceNo,
    buyerName,
    currency,
    fobMinor,
    exchangeRate,
    schemesClaimed: schemesParsed.schemes,
    items,
    fieldConfidence,
  };
}
