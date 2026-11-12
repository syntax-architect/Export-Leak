import { z } from "zod";

export const EbrcRowInputSchema = z.object({
  rowId: z.string().max(120).optional(),
  matchId: z.string().uuid().optional(),
  shippingBillId: z.string().uuid().optional(),
  remittanceId: z.string().uuid().optional(),
  serialNumber: z.union([z.number().int().min(0).max(9999), z.string().max(10)]),
  iecBranchSlNo: z.string().max(10),
  ifscCode: z.string().max(20),
  adCode: z.string().max(20),
  irmNumber: z.string().max(80),
  irmDate: z.string().max(32),
  irmCurrency: z.string().max(10),
  purposeCode: z.string().max(12),
  amountMinor: z.number().int().min(0).optional(),
  amountInFcc: z.string().max(32),
  portCode: z.string().max(16),
  shippingBillNumber: z.string().max(40),
  shippingBillDate: z.string().max(32),
  expectedCurrency: z.string().max(10).optional(),
  irmAvailableMinor: z.number().int().min(0).optional(),
});

export const EbrcPreviewQuerySchema = z.object({
  iecId: z.string().uuid().nullable().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date")
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date")
    .optional(),
  irmIds: z.array(z.string().uuid()).optional(),
});

export const EbrcActionSchema = z.object({
  action: z.enum(["validate", "autofix", "generate"]),
  iecId: z.string().uuid().nullable().optional(),
  rows: z.array(EbrcRowInputSchema).max(1500),
});
