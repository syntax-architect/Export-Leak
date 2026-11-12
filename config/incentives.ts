import type { IncentiveScheme } from "@/lib/database.types";

/**
 * Configuration-only constants for the incentive engine.
 * Hard Rule 3: NEVER hard-code or invent any RoDTEP, Drawback, or RoSCTL rate numbers
 * or statutory duration constants here. Rates live in `incentive_rates` (admin CSV import)
 * and expiry rules live in `compliance_rules`.
 */

export const INCENTIVE_SCHEMES = [
  "rodtep",
  "drawback",
  "rosctl",
] as const satisfies readonly IncentiveScheme[];

export const INCENTIVE_SCHEME_LABELS: Record<IncentiveScheme, string> = {
  rodtep: "RoDTEP",
  drawback: "Duty Drawback",
  rosctl: "RoSCTL",
};

export type ReferenceDateStrategy = "leo_date_or_sb_date" | "sb_date_only";

export const INCENTIVE_REFERENCE_DATE_CONFIG: Record<
  IncentiveScheme,
  {
    strategy: ReferenceDateStrategy;
    description: string;
  }
> = {
  rodtep: {
    strategy: "leo_date_or_sb_date",
    description: "Uses Let Export Order (LEO) date when present; falls back to Shipping Bill date.",
  },
  drawback: {
    strategy: "leo_date_or_sb_date",
    description: "Uses Let Export Order (LEO) date when present; falls back to Shipping Bill date.",
  },
  rosctl: {
    strategy: "leo_date_or_sb_date",
    description: "Uses Let Export Order (LEO) date when present; falls back to Shipping Bill date.",
  },
};

export const INCENTIVE_ROUNDING_POLICY = "half_up_per_item_integer_sum" as const;

export const INCENTIVE_COMPARISON_STATUSES = [
  "ok",
  "short",
  "missing",
  "not_claimed",
  "unknown_rate",
] as const;

export const SCRIP_VALIDITY_COMPLIANCE_KEY = "scrip_validity_months" as const;
