export const TRIAL_DURATION_DAYS = 7;

export interface TrialCountdown {
  isActive: boolean;
  daysLeft: number;
  label: string;
  trialEndsAt: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getTrialCountdown(
  trialEndsAt: string | null | undefined,
  now: Date = new Date()
): TrialCountdown {
  if (!trialEndsAt) {
    return {
      isActive: false,
      daysLeft: 0,
      label: "",
      trialEndsAt: null,
    };
  }

  const endMs = new Date(trialEndsAt).getTime();
  const remainingMs = endMs - now.getTime();
  if (!Number.isFinite(endMs) || remainingMs <= 0) {
    return {
      isActive: false,
      daysLeft: 0,
      label: "",
      trialEndsAt,
    };
  }

  const daysLeft = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
  const unit = daysLeft === 1 ? "day" : "days";

  return {
    isActive: true,
    daysLeft,
    label: `Pro trial: ${daysLeft} ${unit} left`,
    trialEndsAt,
  };
}
