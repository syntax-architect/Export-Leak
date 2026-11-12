import { z } from "zod";
import type { IncentiveScheme } from "@/lib/database.types";
import { KNOWN_ISO_CURRENCIES } from "@/lib/documents/parsing/types";

export const ReviewItemSchema = z.object({
  id: z.string().uuid().optional(),
  hsCode: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "HS code must be 8 digits"),
  description: z.string().trim().min(1, "Description is required").max(240),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/, "Quantity must be a positive number")
    .refine((v) => Number(v) > 0, "Quantity must be greater than zero"),
  uqc: z.string().trim().toUpperCase().min(2, "UQC is required").max(10),
  fobAmount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, "Item FOB must be a valid decimal amount")
    .refine((v) => Number(v) > 0, "Item FOB must be greater than zero"),
});

export const ConfirmShippingBillReviewSchema = z.object({
  sbNumber: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/, "Shipping Bill number must be 6 to 8 digits"),
  sbDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "SB Date must be YYYY-MM-DD"),
  portCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9A-Z]$/, "Port code must match 6-character customs code (e.g. INNSA1)"),
  leoDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "LEO Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  invoiceNo: z.string().trim().min(1, "Invoice number is required").max(80),
  buyerName: z.string().trim().min(1, "Buyer name is required").max(160),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => KNOWN_ISO_CURRENCIES.has(v), "Invalid 3-letter ISO currency code"),
  fobAmount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, "Total FOB must be a valid decimal amount")
    .refine((v) => Number(v) > 0, "Total FOB must be greater than zero"),
  exchangeRate: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,6})?$/, "Exchange rate must be numeric")
    .nullable()
    .optional(),
  schemesClaimed: z
    .array(z.enum(["rodtep", "drawback", "rosctl"] satisfies readonly IncentiveScheme[]))
    .default([]),
  items: z.array(ReviewItemSchema).min(1, "At least one line item is required").max(100),
  confirmedFields: z.array(z.string().min(1).max(80)).default([]),
  confirmAll: z.boolean().default(false),
});

export type ConfirmShippingBillReviewInput = z.infer<typeof ConfirmShippingBillReviewSchema>;

export const OrgSettingsPatchSchema = z.object({
  aiParsingEnabled: z.boolean(),
});
