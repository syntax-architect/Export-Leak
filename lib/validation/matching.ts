import { z } from "zod";
import { parseDecimalMoneyToMinorUnits } from "@/lib/documents/parsing/types";
import type { IrmColumnMapping } from "@/lib/matching/types";

const nullableHeader = z.string().trim().min(1).nullable().optional();

export const IrmColumnMappingSchema = z
  .object({
    irmNumber: nullableHeader,
    bankName: nullableHeader,
    remittanceDate: nullableHeader,
    currency: nullableHeader,
    amount: nullableHeader,
    utilisedAmount: nullableHeader,
    remitterName: nullableHeader,
    invoiceReference: nullableHeader,
    adCode: nullableHeader,
  })
  .transform((v): Partial<IrmColumnMapping> => ({
    ...(v.irmNumber !== undefined ? { irmNumber: v.irmNumber } : {}),
    ...(v.bankName !== undefined ? { bankName: v.bankName } : {}),
    ...(v.remittanceDate !== undefined ? { remittanceDate: v.remittanceDate } : {}),
    ...(v.currency !== undefined ? { currency: v.currency } : {}),
    ...(v.amount !== undefined ? { amount: v.amount } : {}),
    ...(v.utilisedAmount !== undefined ? { utilisedAmount: v.utilisedAmount } : {}),
    ...(v.remitterName !== undefined ? { remitterName: v.remitterName } : {}),
    ...(v.invoiceReference !== undefined ? { invoiceReference: v.invoiceReference } : {}),
    ...(v.adCode !== undefined ? { adCode: v.adCode } : {}),
  }));

export const MatchPairInputSchema = z
  .object({
    shippingBillId: z.string().uuid(),
    remittanceId: z.string().uuid(),
    allocatedMinor: z.number().int().positive().optional(),
    allocatedAmount: z.string().trim().min(1).optional(),
    method: z.enum(["auto", "manual"]).default("manual"),
    confidence: z.number().min(0).max(1).default(1),
    explanation: z.string().trim().max(500).default("Manually matched"),
  })
  .superRefine((val, ctx) => {
    if (val.allocatedMinor === undefined && val.allocatedAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Specify a positive allocation amount.",
      });
    }
    if (val.allocatedAmount !== undefined) {
      const parsed = parseDecimalMoneyToMinorUnits(val.allocatedAmount);
      if (parsed === null || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Allocation amount must be a valid positive number with up to 2 decimals.",
        });
      }
    }
  });

export const MatchesActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("auto_match"),
    iecId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("confirm"),
    pair: MatchPairInputSchema,
  }),
  z.object({
    action: z.literal("bulk_confirm"),
    pairs: z.array(MatchPairInputSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal("reject"),
    shippingBillId: z.string().uuid(),
    remittanceId: z.string().uuid(),
    reason: z.string().trim().max(300).default("Rejected in Review Matches"),
  }),
]);
