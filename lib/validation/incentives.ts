import { z } from "zod";
import { INCENTIVE_SCHEMES } from "@/config/incentives";

export const incentiveSchemeSchema = z.enum(INCENTIVE_SCHEMES);

export const rateImportRowSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    scheme: incentiveSchemeSchema,
    hsCode: z.string().regex(/^[0-9]{8}$/, "HS code must be an exact 8-digit code"),
    rateBps: z.number().int().min(0).max(50_000),
    capPerUnitMinor: z.number().int().min(0).nullable(),
    uqc: z.string().trim().max(16).nullable(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    sourceNote: z.string().trim().max(300),
  })
  .refine((row) => !row.effectiveTo || row.effectiveTo >= row.effectiveFrom, {
    message: "effectiveTo cannot precede effectiveFrom",
  });

export const commitRateImportSchema = z.object({
  action: z.literal("commit"),
  orgId: z.string().uuid().optional(),
  rows: z.array(rateImportRowSchema).min(1, "Provide at least one validated rate row to import."),
});

export const updateScripValidityRuleSchema = z
  .object({
    confirmed: z.boolean(),
    months: z.number().int().min(1).max(120).nullable(),
    days: z.number().int().min(0).max(3650).nullable().optional(),
    sourceNote: z.string().trim().min(1).max(300),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    orgId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      !data.confirmed ||
      (data.months !== null && data.months > 0) ||
      (data.days !== null && data.days !== undefined && data.days > 0),
    {
      message: "When confirmed is true, provide positive validity months or days.",
    }
  );

export const scrollCommitRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  sbNumber: z.string().trim().min(1),
  scheme: incentiveSchemeSchema,
  creditedMinor: z.number().int().min(0),
  creditedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  scrollNumber: z.string().trim().max(100),
  raw: z.record(z.string(), z.string()),
});

export const commitScrollImportSchema = z.object({
  action: z.literal("commit"),
  iecId: z.string().uuid(),
  rows: z.array(scrollCommitRowSchema).min(1, "Provide at least one scroll credit row to import."),
});

export const recalculateIncentivesSchema = z.object({
  iecId: z.string().uuid().optional(),
  shippingBillId: z.string().uuid().optional(),
});

export const createScripItemSchema = z.object({
  iecId: z.string().uuid(),
  scripNumber: z.string().trim().min(1).max(80),
  scheme: incentiveSchemeSchema,
  faceAmountInr: z.string().trim().min(1),
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  status: z.enum(["active", "utilised", "transferred", "expired"]).default("active"),
  notes: z.string().trim().max(300).optional(),
});

export const batchImportScripsSchema = z.object({
  iecId: z.string().uuid(),
  scrips: z.array(createScripItemSchema.omit({ iecId: true })).min(1),
});

export const updateScripSchema = z.object({
  status: z.enum(["active", "utilised", "transferred", "expired"]).optional(),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().max(300).optional(),
});
