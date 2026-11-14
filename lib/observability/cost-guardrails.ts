export interface CostMetrics {
  monthPeriod: string; // YYYY-MM
  aiSpendMinor: number; // in paise
  aiSpendBudgetMinor: number;
  aiUsagePercent: number;
  storageBytesUsed: number;
  storageBudgetBytes: number;
  storageUsagePercent: number;
  emailCountUsed: number;
  emailBudgetCount: number;
  emailUsagePercent: number;
  isOverBudget: boolean;
  warnings: string[];
}

export const BUDGET_LIMITS = {
  // ₹1,500 / month AI parse fallback cap
  monthlyAiSpendMinor: 1500 * 100,
  // 5 GB storage limit on initial tier
  storageBytes: 5 * 1024 * 1024 * 1024,
  // 3,000 emails per month free tier
  monthlyEmails: 3000,
};

/**
 * Calculates current month tool and infrastructure spend against budget limits.
 */
export function evaluateCostGuardrails(params: {
  aiSpendMinor: number;
  storageBytesUsed: number;
  emailCountUsed: number;
}): CostMetrics {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const aiUsagePercent = Math.min(
    Math.round((params.aiSpendMinor / BUDGET_LIMITS.monthlyAiSpendMinor) * 100),
    100
  );

  const storageUsagePercent = Math.min(
    Math.round((params.storageBytesUsed / BUDGET_LIMITS.storageBytes) * 1024) / 10,
    100
  );

  const emailUsagePercent = Math.min(
    Math.round((params.emailCountUsed / BUDGET_LIMITS.monthlyEmails) * 100),
    100
  );

  const warnings: string[] = [];

  if (params.aiSpendMinor >= BUDGET_LIMITS.monthlyAiSpendMinor * 0.8) {
    warnings.push(`AI parsing spend has reached ${aiUsagePercent}% of the ₹1,500 monthly budget.`);
  }

  if (params.storageBytesUsed >= BUDGET_LIMITS.storageBytes * 0.8) {
    warnings.push(`Document storage volume is at ${storageUsagePercent}% of the 5 GB tier limit.`);
  }

  if (params.emailCountUsed >= BUDGET_LIMITS.monthlyEmails * 0.8) {
    warnings.push(`Monthly email send volume is at ${emailUsagePercent}% of the free allowance.`);
  }

  const isOverBudget =
    params.aiSpendMinor >= BUDGET_LIMITS.monthlyAiSpendMinor ||
    params.storageBytesUsed >= BUDGET_LIMITS.storageBytes ||
    params.emailCountUsed >= BUDGET_LIMITS.monthlyEmails;

  return {
    monthPeriod: currentMonth,
    aiSpendMinor: params.aiSpendMinor,
    aiSpendBudgetMinor: BUDGET_LIMITS.monthlyAiSpendMinor,
    aiUsagePercent,
    storageBytesUsed: params.storageBytesUsed,
    storageBudgetBytes: BUDGET_LIMITS.storageBytes,
    storageUsagePercent,
    emailCountUsed: params.emailCountUsed,
    emailBudgetCount: BUDGET_LIMITS.monthlyEmails,
    emailUsagePercent,
    isOverBudget,
    warnings,
  };
}
