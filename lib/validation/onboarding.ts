import { z } from "zod";
import { gstinSchema, iecCodeSchema, orgRoleChoiceSchema } from "@/lib/validation/auth";

export const onboardingPreferencesSchema = z.object({
  checkRodtep: z.boolean().default(true),
  checkDeadlines: z.boolean().default(true),
  checkEbrc: z.boolean().default(true),
});

export type OnboardingPreferences = z.infer<typeof onboardingPreferencesSchema>;

const optionalIecCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (val) => val === "" || iecCodeSchema.safeParse(val).success,
    "IEC code must be exactly 10 alphanumeric characters"
  )
  .transform((val) => (val === "" ? null : val));

export const onboardingStepOneSchema = z.object({
  roleChoice: orgRoleChoiceSchema,
  name: z
    .string()
    .trim()
    .min(2, "Company or firm name must be at least 2 characters")
    .max(120, "Company or firm name must be 120 characters or fewer"),
  iecCode: optionalIecCodeSchema.optional().default(null),
  gstin: gstinSchema.optional().default(null),
});

export const onboardingEventTypeSchema = z.enum([
  "step_viewed",
  "step_completed",
  "step_skipped",
  "wizard_completed",
  "wizard_skipped",
  "demo_created",
  "demo_deleted",
  "tour_started",
  "tour_completed",
  "tour_dismissed",
]);

export const onboardingUpdateSchema = z.object({
  currentStep: z.number().int().min(1).max(4).optional(),
  preferences: onboardingPreferencesSchema.optional(),
  markCompleted: z.boolean().optional(),
  markSkipped: z.boolean().optional(),
  markTourCompleted: z.boolean().optional(),
  replayTour: z.boolean().optional(),
  dismissChecklist: z.boolean().optional(),
  eventType: onboardingEventTypeSchema.optional(),
  eventStep: z.number().int().min(1).max(4).optional(),
  eventMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
