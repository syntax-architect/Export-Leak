export type PlanKey =
  | "free"
  | "trial_pro"
  | "exporter_monthly"
  | "exporter_annual"
  | "consultant_monthly"
  | "consultant_annual";

export type BillingPeriod = "none" | "trial" | "monthly" | "annual";

export type AlertChannel = "in_app" | "email" | "whatsapp";

export interface PlanEntitlements {
  maxIecs: number;
  shippingBillsPerMonth: number;
  canGenerateEbrc: boolean;
  canExportReports: boolean;
  alertsChannels: readonly AlertChannel[];
  teamSeats: number;
  retentionDays: number;
}

export interface PlanConfig {
  key: PlanKey;
  displayName: string;
  pricePaise: number;
  billingPeriod: BillingPeriod;
  razorpayPlanIdEnvVar: string | null;
  entitlements: PlanEntitlements;
}

export type PlanRegistry = Record<PlanKey, PlanConfig>;

export type GatedAction = "upload" | "add_iec" | "generate_ebrc" | "invite_seat" | "export_report";

export type PlanLimitKey =
  "shippingBillsPerMonth" | "maxIecs" | "teamSeats" | "canGenerateEbrc" | "canExportReports";

export const BILLING_GRACE_PERIOD_DAYS = 3;

export const PLANS: PlanRegistry = {
  free: {
    key: "free",
    displayName: "Free",
    pricePaise: 0,
    billingPeriod: "none",
    razorpayPlanIdEnvVar: null,
    entitlements: {
      maxIecs: 1,
      shippingBillsPerMonth: 5,
      canGenerateEbrc: false,
      canExportReports: false,
      alertsChannels: ["in_app"],
      teamSeats: 1,
      retentionDays: 90,
    },
  },
  trial_pro: {
    key: "trial_pro",
    displayName: "7-day Pro Trial",
    pricePaise: 0,
    billingPeriod: "trial",
    razorpayPlanIdEnvVar: null,
    entitlements: {
      maxIecs: 1,
      shippingBillsPerMonth: 50,
      canGenerateEbrc: true,
      canExportReports: true,
      alertsChannels: ["in_app", "email"],
      teamSeats: 3,
      retentionDays: 365,
    },
  },
  exporter_monthly: {
    key: "exporter_monthly",
    displayName: "Exporter Monthly",
    pricePaise: 99900,
    billingPeriod: "monthly",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_EXPORTER_MONTHLY",
    entitlements: {
      maxIecs: 1,
      shippingBillsPerMonth: 50,
      canGenerateEbrc: true,
      canExportReports: true,
      alertsChannels: ["in_app", "email"],
      teamSeats: 3,
      retentionDays: 1095,
    },
  },
  exporter_annual: {
    key: "exporter_annual",
    displayName: "Exporter Annual",
    pricePaise: 999000,
    billingPeriod: "annual",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_EXPORTER_ANNUAL",
    entitlements: {
      maxIecs: 1,
      shippingBillsPerMonth: 50,
      canGenerateEbrc: true,
      canExportReports: true,
      alertsChannels: ["in_app", "email"],
      teamSeats: 3,
      retentionDays: 1095,
    },
  },
  consultant_monthly: {
    key: "consultant_monthly",
    displayName: "Consultant Monthly",
    pricePaise: 299900,
    billingPeriod: "monthly",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_CONSULTANT_MONTHLY",
    entitlements: {
      maxIecs: 25,
      shippingBillsPerMonth: 500,
      canGenerateEbrc: true,
      canExportReports: true,
      alertsChannels: ["in_app", "email"],
      teamSeats: 10,
      retentionDays: 1095,
    },
  },
  consultant_annual: {
    key: "consultant_annual",
    displayName: "Consultant Annual",
    pricePaise: 2999000,
    billingPeriod: "annual",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_CONSULTANT_ANNUAL",
    entitlements: {
      maxIecs: 25,
      shippingBillsPerMonth: 500,
      canGenerateEbrc: true,
      canExportReports: true,
      alertsChannels: ["in_app", "email"],
      teamSeats: 10,
      retentionDays: 1095,
    },
  },
};

export function getPlanConfig(planKey: string | null | undefined): PlanConfig {
  if (planKey && planKey in PLANS) {
    return PLANS[planKey as PlanKey];
  }
  return PLANS.free;
}

export function getRazorpayPlanId(planKey: PlanKey): string | null {
  const plan = PLANS[planKey];
  if (!plan?.razorpayPlanIdEnvVar) return null;
  const envKey = plan.razorpayPlanIdEnvVar;
  const altKey = envKey.replace("RAZORPAY_PLAN_", "RAZORPAY_PLAN_ID_");
  return process.env[envKey] ?? process.env[altKey] ?? null;
}

export function getRecommendedUpgradePlanKey(
  currentPlanKey: PlanKey,
  limitKey: PlanLimitKey
): PlanKey {
  if (limitKey === "maxIecs" || limitKey === "teamSeats") {
    return "consultant_monthly";
  }
  if (
    currentPlanKey === "exporter_monthly" ||
    currentPlanKey === "exporter_annual" ||
    currentPlanKey === "consultant_monthly" ||
    currentPlanKey === "consultant_annual"
  ) {
    return "consultant_monthly";
  }
  return "exporter_monthly";
}
