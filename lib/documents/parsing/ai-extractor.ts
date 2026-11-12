import { z } from "zod";
import {
  getAiMaxCostPerDocPaise,
  KNOWN_ISO_CURRENCIES,
  normalizeDateStringToIso,
  type ParsedPageText,
  type ParsedShippingBillDraft,
  parseDecimalMoneyToMinorUnits,
  REVIEW_CONFIDENCE_THRESHOLD,
} from "@/lib/documents/parsing/types";

const AiItemPatchSchema = z.object({
  hsCode: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
  description: z.string().min(1).max(200).optional(),
  quantity: z
    .string()
    .regex(/^\d+(?:\.\d{1,4})?$/)
    .optional(),
  uqc: z.string().min(2).max(10).optional(),
  fobAmount: z
    .string()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .optional(),
});

export const AiExtractionPatchSchema = z.object({
  sbNumber: z
    .string()
    .regex(/^\d{6,8}$/)
    .optional(),
  sbDate: z.string().optional(),
  portCode: z
    .string()
    .regex(/^[A-Z]{5}[0-9A-Z]$/)
    .optional(),
  leoDate: z.string().optional(),
  invoiceNo: z.string().min(2).max(60).optional(),
  buyerName: z.string().min(2).max(120).optional(),
  currency: z
    .string()
    .toUpperCase()
    .refine((v) => KNOWN_ISO_CURRENCIES.has(v))
    .optional(),
  fobAmount: z
    .string()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .optional(),
  exchangeRate: z
    .string()
    .regex(/^\d+(?:\.\d{1,6})?$/)
    .optional(),
  items: z.array(AiItemPatchSchema).max(25).optional(),
});

export type AiExtractionPatch = z.infer<typeof AiExtractionPatchSchema>;

export interface AiExtractorResponse {
  patch: AiExtractionPatch;
  tokensUsed: number;
  costPaise: number;
}

export type AiExtractorProvider = (input: {
  missingFields: string[];
  minimalContextText: string;
  maxBudgetPaise: number;
}) => Promise<AiExtractorResponse>;

export interface RunAiFallbackResult {
  applied: boolean;
  tokensUsed: number;
  costPaise: number;
  capExceeded: boolean;
  reason?: string;
}

const MIN_CONTEXT_MAX_CHARS = 1800;
const ESTIMATED_BASE_CALL_COST_PAISE = 35;

/**
 * Builds only the minimum text slice required for missing fields to minimize cost and PII exposure.
 */
export function buildMinimalAiContext(pages: ParsedPageText[]): string {
  const joined = pages
    .map((p) => `[P${p.page}] ${p.text}`)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return joined.slice(0, MIN_CONTEXT_MAX_CHARS);
}

/**
 * Estimates call cost in integer paise from prompt/completion tokens (~₹0.0005/token conservatively scaled).
 */
export function estimateAiCostPaise(tokensUsed: number): number {
  if (tokensUsed <= 0) return 0;
  return Math.max(1, Math.ceil(tokensUsed * 0.05));
}

async function defaultOpenAiCompatibleProvider(input: {
  missingFields: string[];
  minimalContextText: string;
  maxBudgetPaise: number;
}): Promise<AiExtractorResponse> {
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey || apiKey === "your-ai-provider-key") {
    return { patch: {}, tokensUsed: 0, costPaise: 0 };
  }

  const endpoint = process.env.AI_PROVIDER_URL ?? "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_PROVIDER_MODEL ?? "gpt-4o-mini";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 450,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract ONLY the requested missing Indian Customs Shipping Bill fields into valid JSON. Never invent values.",
        },
        {
          role: "user",
          content: JSON.stringify({
            missingFields: input.missingFields,
            excerpt: input.minimalContextText,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return { patch: {}, tokensUsed: 0, costPaise: 0 };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const tokensUsed = data.usage?.total_tokens ?? 300;
  const costPaise = Math.min(input.maxBudgetPaise, estimateAiCostPaise(tokensUsed));
  const rawJsonText = data.choices?.[0]?.message?.content ?? "{}";
  const parsedJson = JSON.parse(rawJsonText) as unknown;
  const validated = AiExtractionPatchSchema.safeParse(parsedJson);

  return {
    patch: validated.success ? validated.data : {},
    tokensUsed,
    costPaise,
  };
}

export async function runAiFallbackForMissingFields(params: {
  draft: ParsedShippingBillDraft;
  pages: ParsedPageText[];
  needsReviewFields: string[];
  aiParsingEnabled: boolean;
  alreadySpentPaise: number;
  maxCapPaise?: number;
  provider?: AiExtractorProvider;
}): Promise<RunAiFallbackResult> {
  const capPaise = params.maxCapPaise ?? getAiMaxCostPerDocPaise();
  const remainingPaise = Math.max(0, capPaise - params.alreadySpentPaise);

  if (!params.aiParsingEnabled) {
    return {
      applied: false,
      tokensUsed: 0,
      costPaise: 0,
      capExceeded: false,
      reason: "AI fallback disabled by organization setting",
    };
  }

  if (params.needsReviewFields.length === 0) {
    return { applied: false, tokensUsed: 0, costPaise: 0, capExceeded: false };
  }

  if (remainingPaise <= 0 || remainingPaise < ESTIMATED_BASE_CALL_COST_PAISE) {
    return {
      applied: false,
      tokensUsed: 0,
      costPaise: 0,
      capExceeded: true,
      reason: `Per-document AI cap (${capPaise} paise) reached`,
    };
  }

  const provider = params.provider ?? defaultOpenAiCompatibleProvider;
  const minimalContextText = buildMinimalAiContext(params.pages);
  if (!minimalContextText) {
    return {
      applied: false,
      tokensUsed: 0,
      costPaise: 0,
      capExceeded: false,
      reason: "No text excerpt available for AI extraction",
    };
  }

  let response: AiExtractorResponse;
  try {
    response = await provider({
      missingFields: params.needsReviewFields,
      minimalContextText,
      maxBudgetPaise: remainingPaise,
    });
  } catch {
    return {
      applied: false,
      tokensUsed: 0,
      costPaise: 0,
      capExceeded: false,
      reason: "AI provider call failed — routed to human review",
    };
  }

  const boundedCost = Math.min(remainingPaise, Math.max(0, Math.round(response.costPaise)));
  if (response.costPaise > remainingPaise) {
    // Reject patch if provider overshoot budget; hard enforce spend cap
    return {
      applied: false,
      tokensUsed: response.tokensUsed,
      costPaise: remainingPaise,
      capExceeded: true,
      reason: "AI spend cap reached — remaining uncertain fields routed to human review",
    };
  }

  const validated = AiExtractionPatchSchema.safeParse(response.patch);
  if (!validated.success) {
    return {
      applied: false,
      tokensUsed: response.tokensUsed,
      costPaise: boundedCost,
      capExceeded: false,
      reason: "AI structured output failed Zod schema validation",
    };
  }

  const patch = validated.data;
  // AI fields always receive conservative confidence < REVIEW_CONFIDENCE_THRESHOLD so human confirmation is required
  const aiConfidence = Number(Math.min(0.74, REVIEW_CONFIDENCE_THRESHOLD - 0.11).toFixed(2));
  const aiSourceSpan =
    params.pages.length > 0
      ? {
          page: params.pages[0]!.page,
          start: 0,
          end: Math.min(params.pages[0]!.text.length, 160),
          snippet: params.pages[0]!.text.slice(0, 120).replace(/\s+/g, " ").trim(),
        }
      : null;

  const setAiField = (key: string, warning = "AI extracted — confirm before calculation") => {
    params.draft.fieldConfidence[key] = {
      confidence: aiConfidence,
      source: aiSourceSpan,
      method: "ai",
      confirmed: false,
      warnings: [warning],
    };
  };

  let patchedAny = false;
  if (patch.sbNumber && params.needsReviewFields.includes("sbNumber")) {
    params.draft.sbNumber = patch.sbNumber;
    setAiField("sbNumber");
    patchedAny = true;
  }
  if (patch.sbDate && params.needsReviewFields.includes("sbDate")) {
    const iso = normalizeDateStringToIso(patch.sbDate);
    if (iso) {
      params.draft.sbDate = iso;
      setAiField("sbDate");
      patchedAny = true;
    }
  }
  if (patch.portCode && params.needsReviewFields.includes("portCode")) {
    params.draft.portCode = patch.portCode.toUpperCase();
    setAiField("portCode");
    patchedAny = true;
  }
  if (patch.leoDate && params.needsReviewFields.includes("leoDate")) {
    const iso = normalizeDateStringToIso(patch.leoDate);
    if (iso) {
      params.draft.leoDate = iso;
      setAiField("leoDate");
      patchedAny = true;
    }
  }
  if (patch.invoiceNo && params.needsReviewFields.includes("invoiceNo")) {
    params.draft.invoiceNo = patch.invoiceNo.trim();
    setAiField("invoiceNo");
    patchedAny = true;
  }
  if (patch.buyerName && params.needsReviewFields.includes("buyerName")) {
    params.draft.buyerName = patch.buyerName.trim();
    setAiField("buyerName");
    patchedAny = true;
  }
  if (patch.currency && params.needsReviewFields.includes("currency")) {
    params.draft.currency = patch.currency.toUpperCase();
    setAiField("currency");
    patchedAny = true;
  }
  if (patch.fobAmount && params.needsReviewFields.includes("fobMinor")) {
    const minor = parseDecimalMoneyToMinorUnits(patch.fobAmount);
    if (minor !== null && minor > 0) {
      params.draft.fobMinor = minor;
      setAiField("fobMinor");
      patchedAny = true;
    }
  }
  if (patch.exchangeRate && !params.draft.exchangeRate) {
    params.draft.exchangeRate = patch.exchangeRate;
    setAiField("exchangeRate");
    patchedAny = true;
  }
  if (patch.items && patch.items.length > 0 && params.draft.items.length === 0) {
    for (const item of patch.items) {
      if (item.hsCode && item.fobAmount && item.quantity) {
        const itemFob = parseDecimalMoneyToMinorUnits(item.fobAmount);
        if (itemFob !== null && itemFob > 0) {
          params.draft.items.push({
            hsCode: item.hsCode,
            description: item.description ?? "Export Item",
            quantity: item.quantity,
            uqc: (item.uqc ?? "NOS").toUpperCase(),
            fobMinor: itemFob,
            fieldConfidence: {
              hsCode: {
                confidence: aiConfidence,
                source: aiSourceSpan,
                method: "ai",
                confirmed: false,
                warnings: ["AI extracted — confirm before calculation"],
              },
              description: {
                confidence: aiConfidence,
                source: aiSourceSpan,
                method: "ai",
                confirmed: false,
                warnings: [],
              },
              quantity: {
                confidence: aiConfidence,
                source: aiSourceSpan,
                method: "ai",
                confirmed: false,
                warnings: [],
              },
              uqc: {
                confidence: aiConfidence,
                source: aiSourceSpan,
                method: "ai",
                confirmed: false,
                warnings: [],
              },
              fobMinor: {
                confidence: aiConfidence,
                source: aiSourceSpan,
                method: "ai",
                confirmed: false,
                warnings: ["AI extracted — confirm before calculation"],
              },
            },
          });
          patchedAny = true;
        }
      }
    }
  }

  return {
    applied: patchedAny,
    tokensUsed: response.tokensUsed,
    costPaise: boundedCost,
    capExceeded: false,
  };
}
