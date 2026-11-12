import { describe, expect, it } from "vitest";
import {
  addMonthsAndDaysIso,
  classifyDeadlineDays,
  diffIsoDays,
  resolveRealisationDeadline,
  sanitizeInteger,
  sanitizeNonNegativeInt,
  type ComplianceRuleInput,
} from "@/lib/deadlines/engine";

describe("Prompt 9: Realisation deadline engine (effective-dated compliance_rules)", () => {
  const sampleRules: ComplianceRuleInput[] = [
    {
      id: "rule-gen-old",
      key: "realisation_months",
      value: { months: 15, confirmed: true, note: "Synthetic prior period" },
      effective_from: "2026-01-01",
      effective_to: "2026-09-30",
    },
    {
      id: "rule-gen-oct",
      key: "realisation_months",
      value: { months: 9, confirmed: true, note: "Synthetic Oct rule" },
      effective_from: "2026-10-01",
      effective_to: null,
    },
    {
      id: "rule-inr-unconfirmed",
      key: "realisation_months_inr",
      value: { months: null, confirmed: false, note: "Unconfirmed INR placeholder" },
      effective_from: "2026-01-01",
      effective_to: null,
    },
  ];

  it("applies effective-dated compliance_rules without hard-coded statutory periods", () => {
    const beforeOct = resolveRealisationDeadline({
      sbDate: "2026-08-15",
      currency: "USD",
      rules: sampleRules,
      todayIso: "2026-11-12",
    });
    expect(beforeOct.ruleKey).toBe("realisation_months");
    expect(beforeOct.monthsApplied).toBe(15);
    expect(beforeOct.dueDate).toBe("2027-11-15");
    expect(beforeOct.ruleMissing).toBe(false);

    const onOrAfterOct = resolveRealisationDeadline({
      sbDate: "2026-10-15",
      currency: "USD",
      rules: sampleRules,
      todayIso: "2026-11-12",
    });
    expect(onOrAfterOct.ruleId).toBe("rule-gen-oct");
    expect(onOrAfterOct.monthsApplied).toBe(9);
    expect(onOrAfterOct.dueDate).toBe("2027-07-15");
    expect(onOrAfterOct.daysLeft).toBe(diffIsoDays("2026-11-12", "2027-07-15"));
    expect(onOrAfterOct.tone).toBe("success");
  });

  it("handles month-end clamping and leap years deterministically", () => {
    expect(addMonthsAndDaysIso("2026-05-31", 9, null)).toBe("2027-02-28");
    expect(addMonthsAndDaysIso("2023-05-31", 9, null)).toBe("2024-02-29");
    expect(addMonthsAndDaysIso("2026-01-31", 1, null)).toBe("2026-02-28");
  });

  it("uses separate INR rule key and never guesses an unconfirmed INR duration", () => {
    const inrMissing = resolveRealisationDeadline({
      sbDate: "2026-10-15",
      currency: "INR",
      rules: sampleRules,
      todayIso: "2026-11-12",
    });
    expect(inrMissing.ruleKey).toBe("realisation_months_inr");
    expect(inrMissing.ruleMissing).toBe(true);
    expect(inrMissing.dueDate).toBeNull();
    expect(inrMissing.daysLeft).toBeNull();

    // Once admin confirms an INR rule, INR shipments use it automatically
    const withConfirmedInr: ComplianceRuleInput[] = [
      ...sampleRules,
      {
        id: "rule-inr-confirmed",
        key: "realisation_months_inr",
        value: { months: 12, confirmed: true, note: "Admin confirmed INR period" },
        effective_from: "2026-10-01",
        effective_to: null,
      },
    ];
    const inrResolved = resolveRealisationDeadline({
      sbDate: "2026-10-15",
      currency: "INR",
      rules: withConfirmedInr,
      todayIso: "2026-11-12",
    });
    expect(inrResolved.ruleMissing).toBe(false);
    expect(inrResolved.monthsApplied).toBe(12);
    expect(inrResolved.dueDate).toBe("2027-10-15");
  });

  it("updates deadlines dynamically when compliance_rules values change", () => {
    const changedRules: ComplianceRuleInput[] = [
      {
        id: "rule-gen-oct",
        key: "realisation_months",
        value: { months: 12, confirmed: true },
        effective_from: "2026-10-01",
        effective_to: null,
      },
    ];

    const updated = resolveRealisationDeadline({
      sbDate: "2026-10-15",
      currency: "EUR",
      rules: changedRules,
      todayIso: "2026-11-12",
    });
    expect(updated.monthsApplied).toBe(12);
    expect(updated.dueDate).toBe("2027-10-15");
  });

  it("classifies days remaining into exact UI color tones (>90 green, 30-90 amber, <30 red, <=0 overdue)", () => {
    expect(classifyDeadlineDays(91)).toEqual({
      tone: "success",
      bucket: "healthy",
      isOverdue: false,
    });
    expect(classifyDeadlineDays(90)).toEqual({
      tone: "warning",
      bucket: "warning",
      isOverdue: false,
    });
    expect(classifyDeadlineDays(30)).toEqual({
      tone: "warning",
      bucket: "warning",
      isOverdue: false,
    });
    expect(classifyDeadlineDays(29)).toEqual({
      tone: "danger",
      bucket: "critical",
      isOverdue: false,
    });
    expect(classifyDeadlineDays(0)).toEqual({
      tone: "danger",
      bucket: "overdue",
      isOverdue: true,
    });
    expect(classifyDeadlineDays(-14)).toEqual({
      tone: "danger",
      bucket: "overdue",
      isOverdue: true,
    });
  });

  it("eliminates NaN, Infinity, and -0 in numeric sanitizers", () => {
    expect(Object.is(sanitizeInteger(-0), 0)).toBe(true);
    expect(sanitizeInteger(Number.NaN)).toBe(0);
    expect(sanitizeInteger(Number.POSITIVE_INFINITY)).toBe(0);
    expect(Object.is(sanitizeNonNegativeInt(-500), 0)).toBe(true);
    expect(Object.is(sanitizeNonNegativeInt(-0), 0)).toBe(true);
  });
});
