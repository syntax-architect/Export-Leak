import { z } from "zod";
import { REALISATION_RULE_KEYS } from "@/config/deadlines";

export const alertActionSchema = z
  .object({
    action: z.enum(["resolve", "snooze", "reopen"]),
    snoozeDays: z.coerce.number().int().min(1).max(90).optional(),
  })
  .strict();

export const dashboardPresetSchema = z.enum([
  "all",
  "unclaimed",
  "at_risk",
  "matched_closed",
  "expiring_scrips",
  "overdue",
]);

export const dashboardSortBySchema = z.enum([
  "days_left",
  "sb_date",
  "fob_minor",
  "expected_incentive",
  "unclaimed_incentive",
  "sb_number",
]);

export const dashboardSortDirSchema = z.enum(["asc", "desc"]);

export const dashboardFilterStateSchema = z
  .object({
    preset: dashboardPresetSchema.optional(),
    search: z.string().trim().max(120).optional(),
    status: z.string().trim().max(40).optional(),
    deadlineBucket: z
      .enum(["all", "overdue", "critical", "warning", "healthy", "unknown"])
      .optional(),
    iecId: z.string().uuid().or(z.literal("all")).optional(),
  })
  .strict();

export const createSavedViewSchema = z
  .object({
    name: z.string().trim().min(1, "View name is required").max(80, "Max 80 characters"),
    filters: dashboardFilterStateSchema.default({}),
    sortBy: dashboardSortBySchema.default("days_left"),
    sortDir: dashboardSortDirSchema.default("asc"),
  })
  .strict();

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const upsertComplianceRuleSchema = z
  .object({
    id: z.string().uuid().optional(),
    key: z.enum([
      REALISATION_RULE_KEYS.general,
      REALISATION_RULE_KEYS.inr,
      "scrip_validity_months",
    ]),
    months: z.coerce.number().int().min(1).max(120).nullable().optional(),
    days: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    confirmed: z.boolean().default(true),
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema.nullable().optional(),
    note: z.string().trim().max(300).optional(),
    orgId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (val) =>
      !val.confirmed ||
      val.months !== null ||
      val.days !== null ||
      val.months !== undefined ||
      val.days !== undefined,
    { message: "Confirmed compliance rules require months or days." }
  );
