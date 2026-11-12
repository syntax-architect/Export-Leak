import { APP_CONFIG } from "@/config/app";
import { DEADLINE_UI_THRESHOLDS, REALISATION_RULE_KEYS } from "@/config/deadlines";

export interface ComplianceRuleInput {
  id?: string;
  key: string;
  value: unknown;
  effective_from: string;
  effective_to: string | null;
}

export type DeadlineTone = "success" | "warning" | "danger" | "neutral";
export type DeadlineBucket = "healthy" | "warning" | "critical" | "overdue" | "unknown";

export interface ResolvedRealisationDeadline {
  dueDate: string | null;
  daysLeft: number | null;
  periodTotalDays: number;
  tone: DeadlineTone;
  bucket: DeadlineBucket;
  isOverdue: boolean;
  ruleKey: string;
  monthsApplied: number | null;
  daysApplied: number | null;
  ruleId: string | null;
  ruleSource: "compliance_rules" | "stored_fallback" | "missing";
  ruleMissing: boolean;
  ruleNote: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Guarantees finite integers and eliminates JavaScript `-0`.
 */
export function sanitizeInteger(value: unknown, fallback = 0): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  const int = Math.trunc(num);
  return Object.is(int, -0) ? 0 : int;
}

/**
 * Guarantees non-negative finite integers (minor units, counts).
 */
export function sanitizeNonNegativeInt(value: unknown): number {
  const safe = sanitizeInteger(value, 0);
  return safe > 0 ? safe : 0;
}

/**
 * Current calendar date (YYYY-MM-DD) in Asia/Kolkata.
 */
export function getIstTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function parseIsoCalendarDate(isoDate: string | null | undefined): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!isoDate || typeof isoDate !== "string") return null;
  const trimmed = isoDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function diffIsoDays(fromIso: string, toIso: string): number | null {
  const from = parseIsoCalendarDate(fromIso);
  const to = parseIsoCalendarDate(toIso);
  if (!from || !to) return null;
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return sanitizeInteger(Math.round((toUtc - fromUtc) / MS_PER_DAY), 0);
}

/**
 * Adds months (with safe month-end clamping, e.g. Jan 31 + 1m -> Feb 28/29)
 * and optional days to an ISO calendar date.
 */
export function addMonthsAndDaysIso(
  isoDate: string,
  months: number | null,
  days: number | null
): string | null {
  const parsed = parseIsoCalendarDate(isoDate);
  if (!parsed) return null;

  let year = parsed.year;
  let monthIndex = parsed.month - 1;
  let day = parsed.day;

  if (typeof months === "number" && Number.isFinite(months) && months !== 0) {
    const totalMonths = year * 12 + monthIndex + Math.trunc(months);
    year = Math.floor(totalMonths / 12);
    monthIndex = ((totalMonths % 12) + 12) % 12;
    const maxDayInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    if (day > maxDayInMonth) {
      day = maxDayInMonth;
    }
  }

  let utcMs = Date.UTC(year, monthIndex, day);
  if (typeof days === "number" && Number.isFinite(days) && days !== 0) {
    utcMs += Math.trunc(days) * MS_PER_DAY;
  }

  const result = new Date(utcMs);
  const y = String(result.getUTCFullYear()).padStart(4, "0");
  const m = String(result.getUTCMonth() + 1).padStart(2, "0");
  const d = String(result.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function classifyDeadlineDays(daysLeft: number | null): {
  tone: DeadlineTone;
  bucket: DeadlineBucket;
  isOverdue: boolean;
} {
  if (daysLeft === null || !Number.isFinite(daysLeft)) {
    return { tone: "neutral", bucket: "unknown", isOverdue: false };
  }
  const safeDays = sanitizeInteger(daysLeft);
  if (safeDays <= 0) {
    return { tone: "danger", bucket: "overdue", isOverdue: true };
  }
  if (safeDays < DEADLINE_UI_THRESHOLDS.warningMinDays) {
    return { tone: "danger", bucket: "critical", isOverdue: false };
  }
  if (safeDays < DEADLINE_UI_THRESHOLDS.healthyMinDays) {
    return { tone: "warning", bucket: "warning", isOverdue: false };
  }
  return { tone: "success", bucket: "healthy", isOverdue: false };
}

function parseRuleDuration(value: unknown): {
  months: number | null;
  days: number | null;
  confirmed: boolean;
  note: string | null;
} {
  if (!value || typeof value !== "object") {
    return { months: null, days: null, confirmed: false, note: null };
  }
  const obj = value as Record<string, unknown>;
  const rawMonths = obj.months;
  const rawDays = obj.days;

  const months =
    typeof rawMonths === "number" && Number.isFinite(rawMonths) && rawMonths > 0
      ? Math.trunc(rawMonths)
      : typeof rawMonths === "string" && /^\d+$/.test(rawMonths) && Number(rawMonths) > 0
        ? Number(rawMonths)
        : null;

  const days =
    typeof rawDays === "number" && Number.isFinite(rawDays) && rawDays > 0
      ? Math.trunc(rawDays)
      : typeof rawDays === "string" && /^\d+$/.test(rawDays) && Number(rawDays) > 0
        ? Number(rawDays)
        : null;

  const explicitFalse = obj.confirmed === false;
  const hasDuration = months !== null || days !== null;
  const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : null;

  return {
    months,
    days,
    confirmed: !explicitFalse && hasDuration,
    note,
  };
}

/**
 * Resolves the effective FEMA realisation deadline for a shipment from `compliance_rules`.
 * - INR-invoiced shipments look up `realisation_months_inr` first.
 * - All other currencies look up `realisation_months`.
 * - Never falls back to any hard-coded statutory period.
 */
export function resolveRealisationDeadline(params: {
  sbDate: string;
  currency: string;
  storedDueDate?: string | null;
  rules: readonly ComplianceRuleInput[];
  todayIso?: string;
}): ResolvedRealisationDeadline {
  const todayIso = params.todayIso ?? getIstTodayIso();
  const normalizedCurrency = params.currency.trim().toUpperCase();
  const ruleKey =
    normalizedCurrency === "INR" ? REALISATION_RULE_KEYS.inr : REALISATION_RULE_KEYS.general;

  const sbIso = params.sbDate.slice(0, 10);

  const matchingRules = params.rules
    .filter((r) => {
      if (r.key !== ruleKey) return false;
      const from = r.effective_from.slice(0, 10);
      const to = r.effective_to ? r.effective_to.slice(0, 10) : null;
      return from <= sbIso && (to === null || sbIso <= to);
    })
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  for (const rule of matchingRules) {
    const duration = parseRuleDuration(rule.value);
    if (!duration.confirmed) {
      continue;
    }
    const dueDate = addMonthsAndDaysIso(sbIso, duration.months, duration.days);
    if (!dueDate) {
      continue;
    }
    const daysLeft = diffIsoDays(todayIso, dueDate);
    const totalSpan = diffIsoDays(sbIso, dueDate);
    const classification = classifyDeadlineDays(daysLeft);
    return {
      dueDate,
      daysLeft,
      periodTotalDays: Math.max(1, totalSpan ?? 1),
      tone: classification.tone,
      bucket: classification.bucket,
      isOverdue: classification.isOverdue,
      ruleKey,
      monthsApplied: duration.months,
      daysApplied: duration.days,
      ruleId: rule.id ?? null,
      ruleSource: "compliance_rules",
      ruleMissing: false,
      ruleNote: duration.note,
    };
  }

  const stored = params.storedDueDate ? params.storedDueDate.slice(0, 10) : null;
  if (stored && parseIsoCalendarDate(stored)) {
    const daysLeft = diffIsoDays(todayIso, stored);
    const totalSpan = diffIsoDays(sbIso, stored);
    const classification = classifyDeadlineDays(daysLeft);
    return {
      dueDate: stored,
      daysLeft,
      periodTotalDays: Math.max(1, totalSpan ?? 1),
      tone: classification.tone,
      bucket: classification.bucket,
      isOverdue: classification.isOverdue,
      ruleKey,
      monthsApplied: null,
      daysApplied: null,
      ruleId: null,
      ruleSource: "stored_fallback",
      ruleMissing: true,
      ruleNote: `No effective ${ruleKey} rule in compliance_rules for ${sbIso}; using recorded due date.`,
    };
  }

  return {
    dueDate: null,
    daysLeft: null,
    periodTotalDays: 1,
    tone: "neutral",
    bucket: "unknown",
    isOverdue: false,
    ruleKey,
    monthsApplied: null,
    daysApplied: null,
    ruleId: null,
    ruleSource: "missing",
    ruleMissing: true,
    ruleNote: `No effective ${ruleKey} rule configured in compliance_rules for ${sbIso}.`,
  };
}
