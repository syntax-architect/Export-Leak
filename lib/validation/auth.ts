import { z } from "zod";

export const iecCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{10}$/, "IEC code must be exactly 10 alphanumeric characters");

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (val) => val === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(val),
    "GSTIN must be 15 valid alphanumeric characters"
  )
  .transform((val) => (val === "" ? null : val));

export const orgRoleChoiceSchema = z.enum(["exporter", "exim_consultant", "ca_firm"]);

export const createOrgSchema = z.object({
  roleChoice: orgRoleChoiceSchema,
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(120, "Organization name must be 120 characters or fewer"),
});

export const createIecSchema = z.object({
  iecCode: iecCodeSchema,
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must be at least 2 characters")
    .max(160, "Legal name must be 160 characters or fewer"),
  gstin: gstinSchema.optional().default(null),
  adBankName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const inviteRoleSchema = z.enum(["admin", "member", "viewer"]);

export const createInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((v) => v.toLowerCase()),
  role: inviteRoleSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(16, "Invalid invitation token"),
});

export const setActiveOrgSchema = z.object({
  orgId: z.string().uuid("Invalid organization id"),
  iecId: z.string().uuid("Invalid IEC id").optional(),
});

export const createDocumentStubSchema = z.object({
  iecId: z.string().uuid("Invalid IEC id"),
  kind: z.enum(["shipping_bill", "irm_export", "scroll", "other"]).default("shipping_bill"),
  originalName: z.string().trim().min(1).max(200),
});

export function mapRoleChoiceToOrgType(
  choice: z.infer<typeof orgRoleChoiceSchema>
): "exporter" | "consultant" {
  return choice === "exporter" ? "exporter" : "consultant";
}

export function sanitizeNextPath(rawNext: string | null | undefined, fallback = "/app"): string {
  if (!rawNext) return fallback;
  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  return trimmed;
}
