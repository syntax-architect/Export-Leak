/**
 * Configuration-only constants for the FEMA realisation deadline engine & dashboard thresholds.
 * Hard Rule 3: NEVER hard-code statutory FEMA realisation durations (months/days) here.
 * Realisation periods MUST be read dynamically from `public.compliance_rules`.
 */

export const REALISATION_RULE_KEYS = {
  general: "realisation_months",
  inr: "realisation_months_inr",
} as const;

export const DEADLINE_UI_THRESHOLDS = {
  healthyMinDays: 91,
  warningMinDays: 30,
  atRiskDays: 60,
  scripExpiringDays: 90,
} as const;

export const DASHBOARD_DEFAULT_PAGE_SIZE = 25;
export const REPORT_FOOTER_TEXT = "Prepared with ExportLeak";
