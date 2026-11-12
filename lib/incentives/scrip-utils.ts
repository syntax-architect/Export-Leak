import type { ScripValidityRuleConfig } from "@/lib/incentives/types";

function addMonthsAndDaysIso(isoDate: string, months: number, days: number): string {
  const [yStr, mStr, dStr] = isoDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(Date.UTC(y, m - 1 + months, d + days));
  const outY = dt.getUTCFullYear();
  const outM = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const outD = String(dt.getUTCDate()).padStart(2, "0");
  return `${outY}-${outM}-${outD}`;
}

export function getTodayIstIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function resolveScripExpiry(params: {
  generatedOn: string;
  manualExpiresOn?: string | null;
  validityRule: ScripValidityRuleConfig | null;
}): {
  expiresOn: string | null;
  expirySource: "manual" | "compliance_rule" | "unconfirmed";
} {
  if (params.manualExpiresOn) {
    return {
      expiresOn: params.manualExpiresOn,
      expirySource: "manual",
    };
  }

  const rule = params.validityRule;
  if (rule && rule.confirmed && ((rule.months ?? 0) > 0 || (rule.days ?? 0) > 0)) {
    return {
      expiresOn: addMonthsAndDaysIso(params.generatedOn, rule.months ?? 0, rule.days ?? 0),
      expirySource: "compliance_rule",
    };
  }

  return {
    expiresOn: null,
    expirySource: "unconfirmed",
  };
}

export function computeDaysToExpiry(
  expiresOn: string | null,
  todayIso = getTodayIstIsoDate()
): number | null {
  if (!expiresOn) return null;
  const expMs = Date.parse(`${expiresOn}T00:00:00Z`);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(expMs) || !Number.isFinite(todayMs)) return null;
  return Math.floor((expMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function parseComplianceScripValidityValue(raw: unknown): ScripValidityRuleConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const confirmed = obj.confirmed === true;
  const months = typeof obj.months === "number" && Number.isFinite(obj.months) ? obj.months : null;
  const days = typeof obj.days === "number" && Number.isFinite(obj.days) ? obj.days : null;
  const sourceNote = typeof obj.source_note === "string" ? obj.source_note : "";
  return {
    confirmed,
    months,
    days,
    sourceNote,
    effectiveFrom: null,
  };
}
