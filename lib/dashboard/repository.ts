import crypto from "node:crypto";
import { DEADLINE_UI_THRESHOLDS, REALISATION_RULE_KEYS } from "@/config/deadlines";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import {
  getAuthenticatedUser,
  requireOrgAccess,
  requirePlatformAdmin,
} from "@/lib/auth/org-access";
import type {
  AlertSeverity,
  IncentiveScheme,
  Json,
  OrganizationType,
  ShippingBillStatus,
} from "@/lib/database.types";
import {
  diffIsoDays,
  getIstTodayIso,
  resolveRealisationDeadline,
  sanitizeNonNegativeInt,
  type ComplianceRuleInput,
  type DeadlineBucket,
  type DeadlineTone,
} from "@/lib/deadlines/engine";

export type IncentiveComparisonBadgeStatus =
  "matched" | "short" | "missing" | "not_claimed" | "none";

export type ShipmentPaymentStatus = "full" | "partial" | "unpaid";

export interface DashboardLeakageShipmentRow {
  id: string;
  iecId: string;
  iecCode: string;
  iecLegalName: string;
  isDemo: boolean;
  sbNumber: string;
  sbDate: string;
  leoDate: string | null;
  portCode: string;
  invoiceNo: string | null;
  buyerName: string;
  currency: string;
  fobMinor: number;
  exchangeRate: number;
  expectedIncentivePaise: number;
  creditedIncentivePaise: number;
  unclaimedIncentivePaise: number;
  missingIncentivePaise: number;
  shortIncentivePaise: number;
  notClaimedIncentivePaise: number;
  incentiveStatus: IncentiveComparisonBadgeStatus;
  matchedMinor: number;
  outstandingMinor: number;
  paymentStatus: ShipmentPaymentStatus;
  realisationDueDate: string | null;
  daysToDeadline: number | null;
  periodTotalDays: number;
  deadlineTone: DeadlineTone;
  deadlineBucket: DeadlineBucket;
  isOverdue: boolean;
  isAtRisk: boolean;
  isMatchedAndClosed: boolean;
  ruleKey: string;
  monthsApplied: number | null;
  ruleSource: "compliance_rules" | "stored_fallback" | "missing";
  ruleMissing: boolean;
  ruleNote: string | null;
  status: ShippingBillStatus;
  ebrcReady: boolean;
}

export interface DashboardAlertItem {
  id: string;
  iecId: string;
  iecCode: string;
  isDemo: boolean;
  kind: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  shippingBillId: string | null;
  sbNumber: string | null;
  dueOn: string | null;
  snoozedUntil: string | null;
  isSnoozed: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ExpiringScripRow {
  id: string;
  iecId: string;
  iecCode: string;
  scripNumber: string;
  scheme: IncentiveScheme;
  faceMinor: number;
  generatedOn: string;
  expiresOn: string;
  daysToExpiry: number;
}

export interface UnmatchedPaymentRow {
  id: string;
  iecId: string;
  iecCode: string;
  irmNumber: string;
  bankName: string;
  remittanceDate: string;
  currency: string;
  amountMinor: number;
  utilisedMinor: number;
  unutilisedMinor: number;
  remitterName: string;
}

export interface ConsultantClientIecRow {
  iecId: string;
  iecCode: string;
  legalName: string;
  isDemo: boolean;
  shipmentCount: number;
  unclaimedIncentivePaise: number;
  atRiskCount: number;
  matchedAndClosedCount: number;
  openAlertsCount: number;
  nextDeadlineDate: string | null;
  nextDeadlineDaysLeft: number | null;
  nextDeadlineTone: DeadlineTone;
}

export interface DashboardSavedViewRow {
  id: string;
  orgId: string;
  name: string;
  filters: {
    preset?: string;
    search?: string;
    status?: string;
    deadlineBucket?: string;
    iecId?: string;
  };
  sortBy:
    | "days_left"
    | "sb_date"
    | "fob_minor"
    | "expected_incentive"
    | "unclaimed_incentive"
    | "sb_number";
  sortDir: "asc" | "desc";
  createdAt: string;
}

export interface ComplianceRuleRow {
  id: string;
  key: string;
  value: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface LeakageDashboardSummaryMetrics {
  orgId: string;
  orgName: string;
  orgType: OrganizationType;
  planKey: string;
  trialEndsAt: string | null;
  hasDemoData: boolean;
  totalShipmentsCount: number;
  unclaimedIncentivePaise: number;
  missingIncentivePaise: number;
  shortIncentivePaise: number;
  notClaimedIncentivePaise: number;
  totalExpectedIncentivePaise: number;
  totalCreditedIncentivePaise: number;
  atRiskCount: number;
  atRiskFobMinor: number;
  matchedAndClosedCount: number;
  scripsExpiring90Count: number;
  scripsExpiring90Paise: number;
  openAlertsCount: number;
  activeAlertsCount: number;
  unmatchedPaymentsCount: number;
  todayIso: string;
}

export interface LeakageDashboardData {
  summary: LeakageDashboardSummaryMetrics;
  shipments: DashboardLeakageShipmentRow[];
  alerts: DashboardAlertItem[];
  expiringScrips: ExpiringScripRow[];
  unmatchedPayments: UnmatchedPaymentRow[];
  consultantClients: ConsultantClientIecRow[];
  savedViews: DashboardSavedViewRow[];
  complianceRules: ComplianceRuleRow[];
}

export interface RawIecRecord {
  id: string;
  iec_code: string;
  legal_name: string;
  is_demo: boolean;
}

export interface RawSbRecord {
  id: string;
  iec_id: string;
  sb_number: string;
  sb_date: string;
  leo_date: string | null;
  port_code: string;
  invoice_no: string | null;
  buyer_name: string | null;
  currency: string;
  fob_minor: number | string;
  exchange_rate: number | string;
  schemes_claimed: IncentiveScheme[];
  status: ShippingBillStatus;
  realisation_due_date: string | null;
}

export interface RawExpectationRecord {
  shipping_bill_id: string;
  scheme: IncentiveScheme;
  expected_minor: number | string;
}

export interface RawCreditRecord {
  shipping_bill_id: string;
  scheme: IncentiveScheme;
  credited_minor: number | string;
  credited_on: string | null;
}

export interface RawMatchRecord {
  shipping_bill_id: string;
  matched_minor: number | string;
  created_at: string;
}

export interface RawRemittanceRecord {
  id: string;
  iec_id: string;
  irm_number: string;
  bank_name: string;
  remittance_date: string;
  currency: string;
  amount_minor: number | string;
  utilised_minor: number | string;
  remitter_name: string;
}

export interface RawScripRecord {
  id: string;
  iec_id: string;
  scrip_number: string;
  scheme: IncentiveScheme;
  face_minor: number | string;
  generated_on: string;
  expires_on: string | null;
  status: string;
}

export interface RawAlertRecord {
  id: string;
  iec_id: string;
  kind: string;
  severity: AlertSeverity;
  title?: string | null;
  message?: string | null;
  shipping_bill_id: string | null;
  due_on: string | null;
  snoozed_until?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface RawSavedViewRecord {
  id: string;
  org_id: string;
  name: string;
  filters: unknown;
  sort_by: string;
  sort_dir: "asc" | "desc";
  created_at: string;
}

const CLOSED_SB_STATUSES = new Set<ShippingBillStatus>(["matched", "ebrc_ready", "closed"]);

function buildAlertDefaultCopy(
  kind: string,
  sbNumber: string | null
): { title: string; message: string } {
  const ref = sbNumber ? `Shipping Bill #${sbNumber}` : "this workspace";
  switch (kind) {
    case "realisation_deadline":
      return {
        title: `FEMA realisation deadline approaching (${sbNumber ?? "SB"})`,
        message: `Match an inward remittance (IRM) against ${ref} before the deadline to stay eBRC-eligible.`,
      };
    case "unclaimed_incentive":
    case "missing_incentive":
      return {
        title: `Unclaimed export incentive (${sbNumber ?? "SB"})`,
        message: `Expected RoDTEP / Drawback / RoSCTL credit has not been received in DGFT scroll for ${ref}.`,
      };
    case "short_incentive":
      return {
        title: `Short incentive credit detected (${sbNumber ?? "SB"})`,
        message: `DGFT scroll credited less than expected for ${ref}. Verify FOB and HS rate.`,
      };
    case "expiring_scrip":
      return {
        title: `Duty credit scrip expiring soon`,
        message: `Utilise or transfer active duty credit scrip before expiry so credit does not lapse.`,
      };
    default:
      return {
        title: `Compliance alert (${kind.replace(/_/g, " ")})`,
        message: `Review ${ref} to resolve open compliance or financial leakage items.`,
      };
  }
}

export function computeLeakageDashboard(input: {
  org: {
    id: string;
    name: string;
    type: OrganizationType;
    plan_key: string;
    trial_ends_at: string | null;
  };
  iecs: RawIecRecord[];
  activeIecId: string | null;
  shippingBills: RawSbRecord[];
  expectations: RawExpectationRecord[];
  credits: RawCreditRecord[];
  matches: RawMatchRecord[];
  remittances: RawRemittanceRecord[];
  scrips: RawScripRecord[];
  alerts: RawAlertRecord[];
  complianceRules: ComplianceRuleInput[];
  savedViews: RawSavedViewRecord[];
  todayIso?: string;
  nowIso?: string;
}): LeakageDashboardData {
  const todayIso = input.todayIso ?? getIstTodayIso();
  const nowIso = input.nowIso ?? new Date().toISOString();
  const iecMap = new Map(input.iecs.map((i) => [i.id, i]));
  const allSbMap = new Map(input.shippingBills.map((sb) => [sb.id, sb]));

  const scopedIecs =
    input.activeIecId && iecMap.has(input.activeIecId)
      ? input.iecs.filter((i) => i.id === input.activeIecId)
      : input.iecs;
  const scopedIecSet = new Set(scopedIecs.map((i) => i.id));

  // Index expectations & credits per (shipping_bill_id, scheme)
  const expBySbScheme = new Map<string, Map<IncentiveScheme, number>>();
  for (const row of input.expectations) {
    let schemeMap = expBySbScheme.get(row.shipping_bill_id);
    if (!schemeMap) {
      schemeMap = new Map();
      expBySbScheme.set(row.shipping_bill_id, schemeMap);
    }
    schemeMap.set(
      row.scheme,
      (schemeMap.get(row.scheme) ?? 0) + sanitizeNonNegativeInt(row.expected_minor)
    );
  }

  const credBySbScheme = new Map<string, Map<IncentiveScheme, number>>();
  for (const row of input.credits) {
    let schemeMap = credBySbScheme.get(row.shipping_bill_id);
    if (!schemeMap) {
      schemeMap = new Map();
      credBySbScheme.set(row.shipping_bill_id, schemeMap);
    }
    schemeMap.set(
      row.scheme,
      (schemeMap.get(row.scheme) ?? 0) + sanitizeNonNegativeInt(row.credited_minor)
    );
  }

  const matchedBySb = new Map<string, number>();
  for (const row of input.matches) {
    matchedBySb.set(
      row.shipping_bill_id,
      (matchedBySb.get(row.shipping_bill_id) ?? 0) + sanitizeNonNegativeInt(row.matched_minor)
    );
  }

  // Compute all SB rows once (so Consultant Home & Scoped Dashboard stay 100% consistent)
  const allComputedSbs: DashboardLeakageShipmentRow[] = input.shippingBills.map((sb) => {
    const iec = iecMap.get(sb.iec_id);
    const fobMinor = sanitizeNonNegativeInt(sb.fob_minor);
    const matchedMinor = sanitizeNonNegativeInt(matchedBySb.get(sb.id) ?? 0);
    const outstandingMinor = Math.max(0, fobMinor - matchedMinor);

    const paymentStatus: ShipmentPaymentStatus =
      fobMinor > 0 && matchedMinor >= fobMinor ? "full" : matchedMinor > 0 ? "partial" : "unpaid";

    const expSchemeMap = expBySbScheme.get(sb.id) ?? new Map<IncentiveScheme, number>();
    const credSchemeMap = credBySbScheme.get(sb.id) ?? new Map<IncentiveScheme, number>();
    const allSchemes = new Set<IncentiveScheme>([...expSchemeMap.keys(), ...credSchemeMap.keys()]);

    let expectedTotal = 0;
    let creditedTotal = 0;
    let missingPaise = 0;
    let shortPaise = 0;
    let notClaimedPaise = 0;
    const claimedSet = new Set(sb.schemes_claimed ?? []);

    for (const scheme of allSchemes) {
      const exp = sanitizeNonNegativeInt(expSchemeMap.get(scheme) ?? 0);
      const cred = sanitizeNonNegativeInt(credSchemeMap.get(scheme) ?? 0);
      expectedTotal += exp;
      creditedTotal += cred;
      const gap = Math.max(0, exp - cred);
      if (gap > 0) {
        if (!claimedSet.has(scheme)) {
          notClaimedPaise += gap;
        } else if (cred === 0) {
          missingPaise += gap;
        } else {
          shortPaise += gap;
        }
      }
    }

    const unclaimedTotal = missingPaise + shortPaise + notClaimedPaise;
    let incentiveStatus: IncentiveComparisonBadgeStatus = "none";
    if (expectedTotal === 0 && creditedTotal === 0) {
      incentiveStatus = "none";
    } else if (unclaimedTotal === 0) {
      incentiveStatus = "matched";
    } else if (notClaimedPaise > 0 && missingPaise === 0 && shortPaise === 0) {
      incentiveStatus = "not_claimed";
    } else if (missingPaise > 0 && shortPaise === 0) {
      incentiveStatus = "missing";
    } else {
      incentiveStatus = "short";
    }

    const deadline = resolveRealisationDeadline({
      sbDate: sb.sb_date,
      currency: sb.currency,
      storedDueDate: sb.realisation_due_date,
      rules: input.complianceRules,
      todayIso,
    });

    const isMatchedAndClosed = CLOSED_SB_STATUSES.has(sb.status);
    const isAtRisk =
      !isMatchedAndClosed &&
      matchedMinor < fobMinor &&
      deadline.daysLeft !== null &&
      deadline.daysLeft < DEADLINE_UI_THRESHOLDS.atRiskDays;

    return {
      id: sb.id,
      iecId: sb.iec_id,
      iecCode: iec?.iec_code ?? "",
      iecLegalName: iec?.legal_name ?? "",
      isDemo: iec?.is_demo ?? false,
      sbNumber: sb.sb_number,
      sbDate: sb.sb_date.slice(0, 10),
      leoDate: sb.leo_date ? sb.leo_date.slice(0, 10) : null,
      portCode: sb.port_code,
      invoiceNo: sb.invoice_no,
      buyerName: sb.buyer_name?.trim() || "Export buyer",
      currency: sb.currency,
      fobMinor,
      exchangeRate: Number.isFinite(Number(sb.exchange_rate)) ? Number(sb.exchange_rate) : 0,
      expectedIncentivePaise: expectedTotal,
      creditedIncentivePaise: creditedTotal,
      unclaimedIncentivePaise: unclaimedTotal,
      missingIncentivePaise: missingPaise,
      shortIncentivePaise: shortPaise,
      notClaimedIncentivePaise: notClaimedPaise,
      incentiveStatus,
      matchedMinor,
      outstandingMinor,
      paymentStatus,
      realisationDueDate: deadline.dueDate,
      daysToDeadline: deadline.daysLeft,
      periodTotalDays: deadline.periodTotalDays,
      deadlineTone: deadline.tone,
      deadlineBucket: deadline.bucket,
      isOverdue: deadline.isOverdue,
      isAtRisk,
      isMatchedAndClosed,
      ruleKey: deadline.ruleKey,
      monthsApplied: deadline.monthsApplied,
      ruleSource: deadline.ruleSource,
      ruleMissing: deadline.ruleMissing,
      ruleNote: deadline.ruleNote,
      status: sb.status,
      ebrcReady: sb.status === "ebrc_ready" || sb.status === "closed",
    };
  });

  const scopedShipments = allComputedSbs.filter((sb) => scopedIecSet.has(sb.iecId));

  let missingIncentivePaise = 0;
  let shortIncentivePaise = 0;
  let notClaimedIncentivePaise = 0;
  let totalExpectedIncentivePaise = 0;
  let totalCreditedIncentivePaise = 0;
  let atRiskCount = 0;
  let atRiskFobMinor = 0;
  let matchedAndClosedCount = 0;

  for (const sb of scopedShipments) {
    missingIncentivePaise += sb.missingIncentivePaise;
    shortIncentivePaise += sb.shortIncentivePaise;
    notClaimedIncentivePaise += sb.notClaimedIncentivePaise;
    totalExpectedIncentivePaise += sb.expectedIncentivePaise;
    totalCreditedIncentivePaise += sb.creditedIncentivePaise;
    if (sb.isAtRisk) {
      atRiskCount += 1;
      atRiskFobMinor += sb.fobMinor;
    }
    if (sb.isMatchedAndClosed) {
      matchedAndClosedCount += 1;
    }
  }

  const unclaimedIncentivePaise =
    missingIncentivePaise + shortIncentivePaise + notClaimedIncentivePaise;

  // Expiring scrips within 90 days (scoped IECs)
  const expiringScrips: ExpiringScripRow[] = [];
  let scripsExpiring90Paise = 0;
  for (const scrip of input.scrips) {
    if (!scopedIecSet.has(scrip.iec_id)) continue;
    if (scrip.status !== "active" || !scrip.expires_on) continue;
    const daysToExpiry = diffIsoDays(todayIso, scrip.expires_on.slice(0, 10));
    if (daysToExpiry !== null && daysToExpiry <= DEADLINE_UI_THRESHOLDS.scripExpiringDays) {
      const faceMinor = sanitizeNonNegativeInt(scrip.face_minor);
      const iec = iecMap.get(scrip.iec_id);
      scripsExpiring90Paise += faceMinor;
      expiringScrips.push({
        id: scrip.id,
        iecId: scrip.iec_id,
        iecCode: iec?.iec_code ?? "",
        scripNumber: scrip.scrip_number,
        scheme: scrip.scheme,
        faceMinor,
        generatedOn: scrip.generated_on.slice(0, 10),
        expiresOn: scrip.expires_on.slice(0, 10),
        daysToExpiry,
      });
    }
  }
  expiringScrips.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  // Unmatched IRMs
  const unmatchedPayments: UnmatchedPaymentRow[] = [];
  for (const rem of input.remittances) {
    if (!scopedIecSet.has(rem.iec_id)) continue;
    const amountMinor = sanitizeNonNegativeInt(rem.amount_minor);
    const utilisedMinor = sanitizeNonNegativeInt(rem.utilised_minor);
    const unutilisedMinor = Math.max(0, amountMinor - utilisedMinor);
    if (unutilisedMinor > 0) {
      const iec = iecMap.get(rem.iec_id);
      unmatchedPayments.push({
        id: rem.id,
        iecId: rem.iec_id,
        iecCode: iec?.iec_code ?? "",
        irmNumber: rem.irm_number,
        bankName: rem.bank_name,
        remittanceDate: rem.remittance_date.slice(0, 10),
        currency: rem.currency,
        amountMinor,
        utilisedMinor,
        unutilisedMinor,
        remitterName: rem.remitter_name,
      });
    }
  }

  // Alerts (all unresolved alerts)
  const openAlerts: DashboardAlertItem[] = [];
  for (const alert of input.alerts) {
    if (!scopedIecSet.has(alert.iec_id)) continue;
    if (alert.resolved_at) continue;
    const iec = iecMap.get(alert.iec_id);
    const sb = alert.shipping_bill_id ? allSbMap.get(alert.shipping_bill_id) : undefined;
    const defaults = buildAlertDefaultCopy(alert.kind, sb?.sb_number ?? null);
    const snoozedUntil = alert.snoozed_until ?? null;
    const isSnoozed = snoozedUntil !== null && snoozedUntil > nowIso;
    openAlerts.push({
      id: alert.id,
      iecId: alert.iec_id,
      iecCode: iec?.iec_code ?? "",
      isDemo: iec?.is_demo ?? false,
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title?.trim() || defaults.title,
      message: alert.message?.trim() || defaults.message,
      shippingBillId: alert.shipping_bill_id,
      sbNumber: sb?.sb_number ?? null,
      dueOn: alert.due_on ? alert.due_on.slice(0, 10) : null,
      snoozedUntil,
      isSnoozed,
      resolvedAt: alert.resolved_at ?? null,
      createdAt: alert.created_at,
    });
  }
  openAlerts.sort((a, b) => {
    if (a.isSnoozed !== b.isSnoozed) return a.isSnoozed ? 1 : -1;
    if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
    if (a.dueOn) return -1;
    if (b.dueOn) return 1;
    return 0;
  });

  // Consultant client IEC summary across ALL org IECs
  const alertCountByIec = new Map<string, number>();
  for (const a of input.alerts) {
    if (a.resolved_at) continue;
    if (a.snoozed_until && a.snoozed_until > nowIso) continue;
    alertCountByIec.set(a.iec_id, (alertCountByIec.get(a.iec_id) ?? 0) + 1);
  }

  const consultantClients: ConsultantClientIecRow[] = input.iecs.map((iec) => {
    const iecSbs = allComputedSbs.filter((s) => s.iecId === iec.id);
    let iecUnclaimed = 0;
    let iecAtRisk = 0;
    let iecClosed = 0;
    let nextDeadlineDate: string | null = null;
    let nextDeadlineDaysLeft: number | null = null;
    let nextDeadlineTone: DeadlineTone = "neutral";

    for (const s of iecSbs) {
      iecUnclaimed += s.unclaimedIncentivePaise;
      if (s.isAtRisk) iecAtRisk += 1;
      if (s.isMatchedAndClosed) iecClosed += 1;
      if (!s.isMatchedAndClosed && s.realisationDueDate && s.daysToDeadline !== null) {
        if (nextDeadlineDaysLeft === null || s.daysToDeadline < nextDeadlineDaysLeft) {
          nextDeadlineDaysLeft = s.daysToDeadline;
          nextDeadlineDate = s.realisationDueDate;
          nextDeadlineTone = s.deadlineTone;
        }
      }
    }

    return {
      iecId: iec.id,
      iecCode: iec.iec_code,
      legalName: iec.legal_name,
      isDemo: iec.is_demo,
      shipmentCount: iecSbs.length,
      unclaimedIncentivePaise: iecUnclaimed,
      atRiskCount: iecAtRisk,
      matchedAndClosedCount: iecClosed,
      openAlertsCount: alertCountByIec.get(iec.id) ?? 0,
      nextDeadlineDate,
      nextDeadlineDaysLeft,
      nextDeadlineTone,
    };
  });

  const savedViews: DashboardSavedViewRow[] = input.savedViews.map((v) => {
    const rawFilters =
      v.filters && typeof v.filters === "object" ? (v.filters as Record<string, unknown>) : {};
    return {
      id: v.id,
      orgId: v.org_id,
      name: v.name,
      filters: {
        preset: typeof rawFilters.preset === "string" ? rawFilters.preset : undefined,
        search: typeof rawFilters.search === "string" ? rawFilters.search : undefined,
        status: typeof rawFilters.status === "string" ? rawFilters.status : undefined,
        deadlineBucket:
          typeof rawFilters.deadlineBucket === "string" ? rawFilters.deadlineBucket : undefined,
        iecId: typeof rawFilters.iecId === "string" ? rawFilters.iecId : undefined,
      },
      sortBy: (v.sort_by as DashboardSavedViewRow["sortBy"]) || "days_left",
      sortDir: v.sort_dir === "desc" ? "desc" : "asc",
      createdAt: v.created_at,
    };
  });

  const complianceRules: ComplianceRuleRow[] = input.complianceRules.map((r) => ({
    id: r.id ?? "",
    key: r.key,
    value:
      r.value && typeof r.value === "object"
        ? (r.value as Record<string, unknown>)
        : { raw: r.value },
    effectiveFrom: r.effective_from.slice(0, 10),
    effectiveTo: r.effective_to ? r.effective_to.slice(0, 10) : null,
  }));

  const activeAlertsCount = openAlerts.filter((a) => !a.isSnoozed).length;

  return {
    summary: {
      orgId: input.org.id,
      orgName: input.org.name,
      orgType: input.org.type,
      planKey: input.org.plan_key,
      trialEndsAt: input.org.trial_ends_at,
      hasDemoData: scopedIecs.some((i) => i.is_demo),
      totalShipmentsCount: scopedShipments.length,
      unclaimedIncentivePaise,
      missingIncentivePaise,
      shortIncentivePaise,
      notClaimedIncentivePaise,
      totalExpectedIncentivePaise,
      totalCreditedIncentivePaise,
      atRiskCount,
      atRiskFobMinor,
      matchedAndClosedCount,
      scripsExpiring90Count: expiringScrips.length,
      scripsExpiring90Paise,
      openAlertsCount: openAlerts.length,
      activeAlertsCount,
      unmatchedPaymentsCount: unmatchedPayments.length,
      todayIso,
    },
    shipments: scopedShipments,
    alerts: openAlerts,
    expiringScrips,
    unmatchedPayments,
    consultantClients,
    savedViews,
    complianceRules,
  };
}

export async function getLeakageDashboardData(
  orgId: string,
  activeIecId: string | null = null,
  todayIso?: string
): Promise<LeakageDashboardData> {
  const access = await requireOrgAccess(orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const [orgRes, iecsRes, rulesRes, savedRes] = await Promise.all([
        tx.query<{
          id: string;
          name: string;
          type: OrganizationType;
          plan_key: string;
          trial_ends_at: string | null;
        }>(
          `select id, name, type, plan_key, trial_ends_at::text
           from public.organizations where id = $1`,
          [access.orgId]
        ),
        tx.query<RawIecRecord>(
          `select id, iec_code, legal_name, is_demo
           from public.iec_profiles where org_id = $1 order by created_at asc`,
          [access.orgId]
        ),
        tx.query<ComplianceRuleInput>(
          `select id, key, value, effective_from::text, effective_to::text
           from public.compliance_rules
           order by key asc, effective_from desc`
        ),
        tx.query<RawSavedViewRecord>(
          `select id, org_id, name, filters, sort_by, sort_dir, created_at::text
           from public.dashboard_saved_views
           where org_id = $1 and user_id = $2
           order by created_at desc`,
          [access.orgId, access.user.id]
        ),
      ]);

      const orgRow = orgRes.rows[0] ?? {
        id: access.orgId,
        name: "Export Workspace",
        type: "exporter" as OrganizationType,
        plan_key: "free",
        trial_ends_at: null,
      };
      const iecs = iecsRes.rows;
      const allIecIds = iecs.map((i) => i.id);

      if (allIecIds.length === 0) {
        return computeLeakageDashboard({
          org: orgRow,
          iecs,
          activeIecId,
          shippingBills: [],
          expectations: [],
          credits: [],
          matches: [],
          remittances: [],
          scrips: [],
          alerts: [],
          complianceRules: rulesRes.rows,
          savedViews: savedRes.rows,
          todayIso,
        });
      }

      const [sbsRes, expRes, credRes, matchRes, remRes, scripRes, alertRes] = await Promise.all([
        tx.query<RawSbRecord>(
          `select id, iec_id, sb_number, sb_date::text, leo_date::text, port_code, invoice_no,
                  buyer_name, currency, fob_minor::text, exchange_rate::text, schemes_claimed,
                  status, realisation_due_date::text
           from public.shipping_bills
           where iec_id = any($1::uuid[])
           order by sb_date desc, sb_number asc`,
          [allIecIds]
        ),
        tx.query<RawExpectationRecord>(
          `select e.shipping_bill_id, e.scheme, e.expected_minor::text
           from public.incentive_expectations e
           join public.shipping_bills sb on sb.id = e.shipping_bill_id
           where sb.iec_id = any($1::uuid[])`,
          [allIecIds]
        ),
        tx.query<RawCreditRecord>(
          `select c.shipping_bill_id, c.scheme, c.credited_minor::text, c.credited_on::text
           from public.incentive_credits c
           join public.shipping_bills sb on sb.id = c.shipping_bill_id
           where sb.iec_id = any($1::uuid[])`,
          [allIecIds]
        ),
        tx.query<RawMatchRecord>(
          `select m.shipping_bill_id, m.matched_minor::text, m.created_at::text
           from public.sb_remittance_matches m
           join public.shipping_bills sb on sb.id = m.shipping_bill_id
           where sb.iec_id = any($1::uuid[])`,
          [allIecIds]
        ),
        tx.query<RawRemittanceRecord>(
          `select id, iec_id, irm_number, bank_name, remittance_date::text, currency,
                  amount_minor::text, utilised_minor::text, remitter_name
           from public.remittances
           where iec_id = any($1::uuid[])
           order by remittance_date desc`,
          [allIecIds]
        ),
        tx.query<RawScripRecord>(
          `select id, iec_id, scrip_number, scheme, face_minor::text, generated_on::text,
                  expires_on::text, status
           from public.scrips
           where iec_id = any($1::uuid[])`,
          [allIecIds]
        ),
        tx.query<RawAlertRecord>(
          `select id, iec_id, kind, severity, title, message, shipping_bill_id,
                  due_on::text, snoozed_until::text, resolved_at::text, created_at::text
           from public.alerts
           where iec_id = any($1::uuid[]) and resolved_at is null
           order by due_on asc nulls last`,
          [allIecIds]
        ),
      ]);

      return computeLeakageDashboard({
        org: orgRow,
        iecs,
        activeIecId,
        shippingBills: sbsRes.rows,
        expectations: expRes.rows,
        credits: credRes.rows,
        matches: matchRes.rows,
        remittances: remRes.rows,
        scrips: scripRes.rows,
        alerts: alertRes.rows,
        complianceRules: rulesRes.rows,
        savedViews: savedRes.rows,
        todayIso,
      });
    });
  }

  const supabase = await createSupabaseServerClient();
  const [orgRes, iecsRes, rulesRes, savedRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, type, plan_key, trial_ends_at")
      .eq("id", access.orgId)
      .maybeSingle(),
    supabase
      .from("iec_profiles")
      .select("id, iec_code, legal_name, is_demo")
      .eq("org_id", access.orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("compliance_rules")
      .select("id, key, value, effective_from, effective_to")
      .order("key", { ascending: true })
      .order("effective_from", { ascending: false }),
    supabase
      .from("dashboard_saved_views")
      .select("id, org_id, name, filters, sort_by, sort_dir, created_at")
      .eq("org_id", access.orgId)
      .eq("user_id", access.user.id)
      .order("created_at", { ascending: false }),
  ]);

  const orgRow = orgRes.data ?? {
    id: access.orgId,
    name: "Export Workspace",
    type: "exporter" as OrganizationType,
    plan_key: "free",
    trial_ends_at: null,
  };
  const iecs = (iecsRes.data ?? []) as RawIecRecord[];
  const allIecIds = iecs.map((i) => i.id);

  if (allIecIds.length === 0) {
    return computeLeakageDashboard({
      org: orgRow,
      iecs,
      activeIecId,
      shippingBills: [],
      expectations: [],
      credits: [],
      matches: [],
      remittances: [],
      scrips: [],
      alerts: [],
      complianceRules: (rulesRes.data ?? []) as ComplianceRuleInput[],
      savedViews: (savedRes.data ?? []) as RawSavedViewRecord[],
      todayIso,
    });
  }

  const [sbsRes, remRes, scripRes, alertRes] = await Promise.all([
    supabase
      .from("shipping_bills")
      .select(
        "id, iec_id, sb_number, sb_date, leo_date, port_code, invoice_no, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, realisation_due_date"
      )
      .in("iec_id", allIecIds)
      .order("sb_date", { ascending: false }),
    supabase
      .from("remittances")
      .select(
        "id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor, utilised_minor, remitter_name"
      )
      .in("iec_id", allIecIds)
      .order("remittance_date", { ascending: false }),
    supabase
      .from("scrips")
      .select("id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, status")
      .in("iec_id", allIecIds),
    supabase
      .from("alerts")
      .select(
        "id, iec_id, kind, severity, title, message, shipping_bill_id, due_on, snoozed_until, resolved_at, created_at"
      )
      .in("iec_id", allIecIds)
      .is("resolved_at", null)
      .order("due_on", { ascending: true }),
  ]);

  const sbRows = (sbsRes.data ?? []) as RawSbRecord[];
  const sbIds = sbRows.map((s) => s.id);
  let expectations: RawExpectationRecord[] = [];
  let credits: RawCreditRecord[] = [];
  let matches: RawMatchRecord[] = [];

  if (sbIds.length > 0) {
    const [eRes, cRes, mRes] = await Promise.all([
      supabase
        .from("incentive_expectations")
        .select("shipping_bill_id, scheme, expected_minor")
        .in("shipping_bill_id", sbIds),
      supabase
        .from("incentive_credits")
        .select("shipping_bill_id, scheme, credited_minor, credited_on")
        .in("shipping_bill_id", sbIds),
      supabase
        .from("sb_remittance_matches")
        .select("shipping_bill_id, matched_minor, created_at")
        .in("shipping_bill_id", sbIds),
    ]);
    expectations = (eRes.data ?? []) as RawExpectationRecord[];
    credits = (cRes.data ?? []) as RawCreditRecord[];
    matches = (mRes.data ?? []) as RawMatchRecord[];
  }

  return computeLeakageDashboard({
    org: orgRow,
    iecs,
    activeIecId,
    shippingBills: sbRows,
    expectations,
    credits,
    matches,
    remittances: (remRes.data ?? []) as RawRemittanceRecord[],
    scrips: (scripRes.data ?? []) as RawScripRecord[],
    alerts: (alertRes.data ?? []) as RawAlertRecord[],
    complianceRules: (rulesRes.data ?? []) as ComplianceRuleInput[],
    savedViews: (savedRes.data ?? []) as RawSavedViewRecord[],
    todayIso,
  });
}

export async function updateAlertForOrg(
  orgId: string,
  alertId: string,
  input: { action: "resolve" | "snooze" | "reopen"; snoozeDays?: number }
): Promise<{
  id: string;
  resolvedAt: string | null;
  snoozedUntil: string | null;
}> {
  const access = await requireOrgAccess(orgId, "member");
  const now = new Date();
  const nowIso = now.toISOString();

  let resolvedAt: string | null = null;
  let snoozedUntil: string | null = null;
  let auditAction = "resolve_alert";

  if (input.action === "resolve") {
    resolvedAt = nowIso;
    snoozedUntil = null;
    auditAction = "resolve_alert";
  } else if (input.action === "snooze") {
    const days = input.snoozeDays ?? 7;
    resolvedAt = null;
    snoozedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    auditAction = "snooze_alert";
  } else {
    resolvedAt = null;
    snoozedUntil = null;
    auditAction = "reopen_alert";
  }

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const existing = await tx.query<{ id: string; iec_id: string }>(
        `select a.id, a.iec_id
         from public.alerts a
         join public.iec_profiles iec on iec.id = a.iec_id
         where a.id = $1 and iec.org_id = $2`,
        [alertId, access.orgId]
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError("Alert not found in this organization.");
      }

      const updated = await tx.query<{
        id: string;
        resolved_at: string | null;
        snoozed_until: string | null;
      }>(
        `update public.alerts
         set resolved_at = $1, snoozed_until = $2
         where id = $3
         returning id, resolved_at::text, snoozed_until::text`,
        [resolvedAt, snoozedUntil, alertId]
      );

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, $3, 'alerts', $4, $5::jsonb)`,
        [
          access.orgId,
          access.user.id,
          auditAction,
          alertId,
          JSON.stringify({
            action: input.action,
            snoozeDays: input.snoozeDays ?? null,
            resolvedAt,
            snoozedUntil,
          }),
        ]
      );

      const row = updated.rows[0]!;
      return {
        id: row.id,
        resolvedAt: row.resolved_at,
        snoozedUntil: row.snoozed_until,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("alerts")
    .select("id, iec_profiles!inner(org_id)")
    .eq("id", alertId)
    .eq("iec_profiles.org_id", access.orgId)
    .maybeSingle();

  if (!existing) {
    throw new NotFoundError("Alert not found in this organization.");
  }

  const { data: updated, error } = await supabase
    .from("alerts")
    .update({
      resolved_at: resolvedAt,
      snoozed_until: snoozedUntil,
    })
    .eq("id", alertId)
    .select("id, resolved_at, snoozed_until")
    .single();

  if (error || !updated) {
    throw new ForbiddenError("Could not update alert.");
  }

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: auditAction,
    entity: "alerts",
    entity_id: alertId,
    diff: {
      action: input.action,
      snoozeDays: input.snoozeDays ?? null,
      resolvedAt,
      snoozedUntil,
    },
  });

  return {
    id: updated.id,
    resolvedAt: updated.resolved_at,
    snoozedUntil: updated.snoozed_until,
  };
}

export async function createSavedViewForOrg(
  orgId: string,
  input: {
    name: string;
    filters: DashboardSavedViewRow["filters"];
    sortBy: DashboardSavedViewRow["sortBy"];
    sortDir: DashboardSavedViewRow["sortDir"];
  }
): Promise<DashboardSavedViewRow> {
  const access = await requireOrgAccess(orgId, "member");
  const trimmedName = input.name.trim();
  const id = crypto.randomUUID();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<RawSavedViewRecord>(
        `insert into public.dashboard_saved_views (id, org_id, user_id, name, filters, sort_by, sort_dir)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7)
         on conflict (org_id, user_id, name) do update
         set filters = excluded.filters,
             sort_by = excluded.sort_by,
             sort_dir = excluded.sort_dir
         returning id, org_id, name, filters, sort_by, sort_dir, created_at::text`,
        [
          id,
          access.orgId,
          access.user.id,
          trimmedName,
          JSON.stringify(input.filters ?? {}),
          input.sortBy,
          input.sortDir,
        ]
      );
      const row = res.rows[0]!;
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'save_dashboard_view', 'dashboard_saved_views', $3, $4::jsonb)`,
        [access.orgId, access.user.id, row.id, JSON.stringify({ name: row.name })]
      );
      return {
        id: row.id,
        orgId: row.org_id,
        name: row.name,
        filters: input.filters,
        sortBy: row.sort_by as DashboardSavedViewRow["sortBy"],
        sortDir: row.sort_dir,
        createdAt: row.created_at,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("dashboard_saved_views")
    .upsert(
      {
        org_id: access.orgId,
        user_id: access.user.id,
        name: trimmedName,
        filters: input.filters as unknown as Json,
        sort_by: input.sortBy,
        sort_dir: input.sortDir,
      },
      { onConflict: "org_id,user_id,name" }
    )
    .select("id, org_id, name, filters, sort_by, sort_dir, created_at")
    .single();

  if (error || !row) {
    throw new ValidationError("Could not save view.");
  }

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "save_dashboard_view",
    entity: "dashboard_saved_views",
    entity_id: row.id,
    diff: { name: row.name },
  });

  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    filters: input.filters,
    sortBy: row.sort_by as DashboardSavedViewRow["sortBy"],
    sortDir: row.sort_dir,
    createdAt: row.created_at,
  };
}

export async function deleteSavedViewForOrg(orgId: string, viewId: string): Promise<void> {
  const access = await requireOrgAccess(orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const deleted = await tx.query<{ id: string }>(
        `delete from public.dashboard_saved_views
         where id = $1 and org_id = $2 and user_id = $3
         returning id`,
        [viewId, access.orgId, access.user.id]
      );
      if (deleted.rows.length === 0) {
        throw new NotFoundError("Saved view not found.");
      }
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'delete_dashboard_view', 'dashboard_saved_views', $3, '{}'::jsonb)`,
        [access.orgId, access.user.id, viewId]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: deleted, error } = await supabase
    .from("dashboard_saved_views")
    .delete()
    .eq("id", viewId)
    .eq("org_id", access.orgId)
    .eq("user_id", access.user.id)
    .select("id");

  if (error || !deleted || deleted.length === 0) {
    throw new NotFoundError("Saved view not found.");
  }

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "delete_dashboard_view",
    entity: "dashboard_saved_views",
    entity_id: viewId,
    diff: {},
  });
}

export interface ShipmentTimelineStage {
  key: "filed" | "cleared" | "incentive_credited" | "payment_received" | "ebrc_ready";
  label: string;
  status: "done" | "attention" | "pending";
  completedOn: string | null;
  detail: string;
  missingItems: string[];
}

export interface ShipmentWhatToDoNext {
  headline: string;
  urgency: "overdue" | "urgent" | "action" | "complete";
  steps: Array<{
    title: string;
    detail: string;
    href: string;
    ctaLabel: string;
  }>;
}

export interface ShipmentDetailViewData {
  shipment: DashboardLeakageShipmentRow;
  items: Array<{
    id: string;
    hsCode: string;
    description: string;
    quantity: string;
    uqc: string;
    fobMinor: number;
  }>;
  incentivesByScheme: Array<{
    scheme: IncentiveScheme;
    claimed: boolean;
    expectedMinor: number;
    creditedMinor: number;
    gapMinor: number;
    creditedOn: string | null;
  }>;
  remittanceMatches: Array<{
    id: string;
    irmNumber: string;
    bankName: string;
    remittanceDate: string;
    currency: string;
    matchedMinor: number;
    method: string;
  }>;
  openAlerts: DashboardAlertItem[];
  timeline: ShipmentTimelineStage[];
  whatToDoNext: ShipmentWhatToDoNext;
}

export async function getShipmentDetailForOrg(
  orgId: string,
  sbId: string,
  todayIso?: string
): Promise<ShipmentDetailViewData> {
  const access = await requireOrgAccess(orgId, "viewer");
  const resolvedToday = todayIso ?? getIstTodayIso();

  interface DetailItemRow {
    id: string;
    hs_code: string;
    description: string;
    quantity: string;
    uqc: string;
    fob_minor: number | string;
  }

  interface DetailMatchRow {
    id: string;
    matched_minor: number | string;
    method: string;
    created_at: string;
    irm_number: string;
    bank_name: string;
    remittance_date: string;
    currency: string;
  }

  let sbRow: RawSbRecord | null = null;
  let iecRow: RawIecRecord | null = null;
  let itemRows: DetailItemRow[] = [];
  let expRows: RawExpectationRecord[] = [];
  let credRows: RawCreditRecord[] = [];
  let matchRows: DetailMatchRow[] = [];
  let alertRows: RawAlertRecord[] = [];
  let rules: ComplianceRuleInput[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const sbRes = await tx.query<
        RawSbRecord & { legal_name: string; iec_code: string; is_demo: boolean }
      >(
        `select sb.id, sb.iec_id, sb.sb_number, sb.sb_date::text, sb.leo_date::text,
                sb.port_code, sb.invoice_no, sb.buyer_name, sb.currency, sb.fob_minor::text,
                sb.exchange_rate::text, sb.schemes_claimed, sb.status, sb.realisation_due_date::text,
                iec.iec_code, iec.legal_name, iec.is_demo
         from public.shipping_bills sb
         join public.iec_profiles iec on iec.id = sb.iec_id
         where sb.id = $1 and iec.org_id = $2`,
        [sbId, access.orgId]
      );
      if (sbRes.rows.length === 0) {
        throw new NotFoundError("Shipping bill not found.");
      }
      const found = sbRes.rows[0]!;
      sbRow = found;
      iecRow = {
        id: found.iec_id,
        iec_code: found.iec_code,
        legal_name: found.legal_name,
        is_demo: found.is_demo,
      };

      const [iRes, eRes, cRes, mRes, aRes, rRes] = await Promise.all([
        tx.query<DetailItemRow>(
          `select id, hs_code, description, quantity::text, uqc, fob_minor::text
           from public.shipping_bill_items where shipping_bill_id = $1`,
          [sbId]
        ),
        tx.query<RawExpectationRecord>(
          `select shipping_bill_id, scheme, expected_minor::text
           from public.incentive_expectations where shipping_bill_id = $1`,
          [sbId]
        ),
        tx.query<RawCreditRecord>(
          `select shipping_bill_id, scheme, credited_minor::text, credited_on::text
           from public.incentive_credits where shipping_bill_id = $1`,
          [sbId]
        ),
        tx.query<DetailMatchRow>(
          `select m.id, m.matched_minor::text, m.method, m.created_at::text,
                  r.irm_number, r.bank_name, r.remittance_date::text, r.currency
           from public.sb_remittance_matches m
           join public.remittances r on r.id = m.remittance_id
           where m.shipping_bill_id = $1
           order by r.remittance_date asc`,
          [sbId]
        ),
        tx.query<RawAlertRecord>(
          `select id, iec_id, kind, severity, title, message, shipping_bill_id,
                  due_on::text, snoozed_until::text, resolved_at::text, created_at::text
           from public.alerts where shipping_bill_id = $1 and resolved_at is null`,
          [sbId]
        ),
        tx.query<ComplianceRuleInput>(
          `select id, key, value, effective_from::text, effective_to::text
           from public.compliance_rules order by key asc, effective_from desc`
        ),
      ]);

      itemRows = iRes.rows;
      expRows = eRes.rows;
      credRows = cRes.rows;
      matchRows = mRes.rows;
      alertRows = aRes.rows;
      rules = rRes.rows;
    });
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: sb } = await supabase
      .from("shipping_bills")
      .select(
        "id, iec_id, sb_number, sb_date, leo_date, port_code, invoice_no, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, realisation_due_date, iec_profiles!inner(id, org_id, iec_code, legal_name, is_demo)"
      )
      .eq("id", sbId)
      .eq("iec_profiles.org_id", access.orgId)
      .maybeSingle();

    if (!sb) {
      throw new NotFoundError("Shipping bill not found.");
    }

    const iecJoin = Array.isArray(sb.iec_profiles) ? sb.iec_profiles[0] : sb.iec_profiles;
    sbRow = sb as unknown as RawSbRecord;
    iecRow = {
      id: iecJoin.id,
      iec_code: iecJoin.iec_code,
      legal_name: iecJoin.legal_name,
      is_demo: iecJoin.is_demo,
    };

    const [iRes, eRes, cRes, mRes, aRes, rRes] = await Promise.all([
      supabase
        .from("shipping_bill_items")
        .select("id, hs_code, description, quantity, uqc, fob_minor")
        .eq("shipping_bill_id", sbId),
      supabase
        .from("incentive_expectations")
        .select("shipping_bill_id, scheme, expected_minor")
        .eq("shipping_bill_id", sbId),
      supabase
        .from("incentive_credits")
        .select("shipping_bill_id, scheme, credited_minor, credited_on")
        .eq("shipping_bill_id", sbId),
      supabase
        .from("sb_remittance_matches")
        .select(
          "id, matched_minor, method, created_at, remittances!inner(irm_number, bank_name, remittance_date, currency)"
        )
        .eq("shipping_bill_id", sbId),
      supabase
        .from("alerts")
        .select(
          "id, iec_id, kind, severity, title, message, shipping_bill_id, due_on, snoozed_until, resolved_at, created_at"
        )
        .eq("shipping_bill_id", sbId)
        .is("resolved_at", null),
      supabase
        .from("compliance_rules")
        .select("id, key, value, effective_from, effective_to")
        .order("key", { ascending: true })
        .order("effective_from", { ascending: false }),
    ]);

    itemRows = (iRes.data ?? []) as DetailItemRow[];
    expRows = (eRes.data ?? []) as RawExpectationRecord[];
    credRows = (cRes.data ?? []) as RawCreditRecord[];
    matchRows = (
      (mRes.data ?? []) as Array<{
        id: string;
        matched_minor: number;
        method: string;
        created_at: string;
        remittances:
          | { irm_number: string; bank_name: string; remittance_date: string; currency: string }
          | Array<{
              irm_number: string;
              bank_name: string;
              remittance_date: string;
              currency: string;
            }>;
      }>
    ).map((m) => {
      const rem = Array.isArray(m.remittances) ? m.remittances[0]! : m.remittances;
      return {
        id: m.id,
        matched_minor: m.matched_minor,
        method: m.method,
        created_at: m.created_at,
        irm_number: rem.irm_number,
        bank_name: rem.bank_name,
        remittance_date: rem.remittance_date,
        currency: rem.currency,
      };
    });
    alertRows = (aRes.data ?? []) as RawAlertRecord[];
    rules = (rRes.data ?? []) as ComplianceRuleInput[];
  }

  const computed = computeLeakageDashboard({
    org: {
      id: access.orgId,
      name: "",
      type: "exporter",
      plan_key: "free",
      trial_ends_at: null,
    },
    iecs: iecRow ? [iecRow] : [],
    activeIecId: iecRow?.id ?? null,
    shippingBills: sbRow ? [sbRow] : [],
    expectations: expRows,
    credits: credRows,
    matches: matchRows.map((m) => ({
      shipping_bill_id: sbId,
      matched_minor: m.matched_minor,
      created_at: m.created_at,
    })),
    remittances: [],
    scrips: [],
    alerts: alertRows,
    complianceRules: rules,
    savedViews: [],
    todayIso: resolvedToday,
  });

  const shipment = computed.shipments[0]!;
  const claimedSet = new Set(sbRow!.schemes_claimed ?? []);
  const schemeList = Array.from(
    new Set<IncentiveScheme>([...expRows.map((e) => e.scheme), ...credRows.map((c) => c.scheme)])
  );

  const incentivesByScheme = schemeList.map((scheme) => {
    const expectedMinor = expRows
      .filter((e) => e.scheme === scheme)
      .reduce((acc, r) => acc + sanitizeNonNegativeInt(r.expected_minor), 0);
    const credMatches = credRows.filter((c) => c.scheme === scheme);
    const creditedMinor = credMatches.reduce(
      (acc, r) => acc + sanitizeNonNegativeInt(r.credited_minor),
      0
    );
    const creditedOn = credMatches.find((c) => c.credited_on)?.credited_on?.slice(0, 10) ?? null;
    return {
      scheme,
      claimed: claimedSet.has(scheme),
      expectedMinor,
      creditedMinor,
      gapMinor: Math.max(0, expectedMinor - creditedMinor),
      creditedOn,
    };
  });

  const timeline = buildShipmentTimeline(shipment, incentivesByScheme, matchRows);
  const whatToDoNext = buildWhatToDoNext(shipment, incentivesByScheme);

  return {
    shipment,
    items: itemRows.map((it) => ({
      id: it.id,
      hsCode: it.hs_code,
      description: it.description,
      quantity: it.quantity,
      uqc: it.uqc,
      fobMinor: sanitizeNonNegativeInt(it.fob_minor),
    })),
    incentivesByScheme,
    remittanceMatches: matchRows.map((m) => ({
      id: m.id,
      irmNumber: m.irm_number,
      bankName: m.bank_name,
      remittanceDate: m.remittance_date.slice(0, 10),
      currency: m.currency,
      matchedMinor: sanitizeNonNegativeInt(m.matched_minor),
      method: m.method,
    })),
    openAlerts: computed.alerts,
    timeline,
    whatToDoNext,
  };
}

function buildShipmentTimeline(
  shipment: DashboardLeakageShipmentRow,
  schemes: ShipmentDetailViewData["incentivesByScheme"],
  matches: Array<{ remittance_date: string }>
): ShipmentTimelineStage[] {
  const filedDone = shipment.status !== "queued" && shipment.status !== "needs_review";
  const filedMissing: string[] = [];
  if (shipment.status === "needs_review") {
    filedMissing.push("Extracted fields need manual confirmation on review screen.");
  }

  const clearedDone = Boolean(shipment.leoDate);
  const clearedMissing = clearedDone ? [] : ["Let Export Order (LEO) date missing."];

  const hasExpected = shipment.expectedIncentivePaise > 0;
  const incentiveDone = hasExpected && shipment.unclaimedIncentivePaise === 0;
  const incentiveMissing: string[] = [];
  if (shipment.missingIncentivePaise > 0) {
    incentiveMissing.push("DGFT / Customs scroll credit not received yet.");
  }
  if (shipment.shortIncentivePaise > 0) {
    incentiveMissing.push("Credited incentive is lower than expected.");
  }
  if (shipment.notClaimedIncentivePaise > 0) {
    incentiveMissing.push("Eligible scheme(s) not flagged as claimed on Shipping Bill.");
  }
  if (!hasExpected && shipment.creditedIncentivePaise === 0) {
    incentiveMissing.push("Run incentive computation or confirm rate table for item HS codes.");
  }
  const latestCredDate =
    schemes
      .map((s) => s.creditedOn)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;

  const paymentDone = shipment.paymentStatus === "full";
  const paymentMissing: string[] = [];
  if (shipment.paymentStatus === "unpaid") {
    paymentMissing.push("No inward remittance (IRM) matched yet.");
  } else if (shipment.paymentStatus === "partial") {
    paymentMissing.push("Only partial export proceeds matched; remaining FOB still open.");
  }
  const latestRemDate =
    matches.length > 0 ? matches[matches.length - 1]!.remittance_date.slice(0, 10) : null;

  const ebrcDone = shipment.ebrcReady;
  const ebrcMissing: string[] = [];
  if (!ebrcDone) {
    if (!clearedDone) ebrcMissing.push("LEO date required before eBRC closing.");
    if (!paymentDone) ebrcMissing.push("Full IRM realisation match required before eBRC closing.");
    if (shipment.status === "needs_review") ebrcMissing.push("Resolve OCR field review first.");
  }

  return [
    {
      key: "filed",
      label: "Filed",
      status: shipment.status === "needs_review" ? "attention" : filedDone ? "done" : "pending",
      completedOn: shipment.sbDate,
      detail:
        shipment.status === "needs_review"
          ? `Shipping Bill #${shipment.sbNumber} needs review`
          : `Filed at ${shipment.portCode} on ${shipment.sbDate}`,
      missingItems: filedMissing,
    },
    {
      key: "cleared",
      label: "Cleared (LEO)",
      status: clearedDone ? "done" : "attention",
      completedOn: shipment.leoDate,
      detail: clearedDone
        ? `Customs Let Export Order granted on ${shipment.leoDate}`
        : "Waiting for Let Export Order (LEO) date",
      missingItems: clearedMissing,
    },
    {
      key: "incentive_credited",
      label: "Incentive credited",
      status: incentiveDone ? "done" : incentiveMissing.length > 0 ? "attention" : "pending",
      completedOn: incentiveDone ? latestCredDate : null,
      detail: incentiveDone
        ? "Full expected incentive credited in scroll"
        : shipment.creditedIncentivePaise > 0
          ? "Partial incentive credited — follow up on gap"
          : "No scroll credit matched yet",
      missingItems: incentiveMissing,
    },
    {
      key: "payment_received",
      label: "Payment received",
      status: paymentDone ? "done" : "attention",
      completedOn: paymentDone ? latestRemDate : null,
      detail: paymentDone
        ? "100% of FOB matched to inward remittance (IRM)"
        : shipment.paymentStatus === "partial"
          ? "Partial remittance matched; balance outstanding"
          : "Awaiting buyer remittance / IRM matching",
      missingItems: paymentMissing,
    },
    {
      key: "ebrc_ready",
      label: "eBRC ready",
      status: ebrcDone ? "done" : "pending",
      completedOn: ebrcDone ? (latestRemDate ?? shipment.sbDate) : null,
      detail: ebrcDone
        ? "Ready for DGFT / bank bulk eBRC closure"
        : "Will become eBRC ready once LEO & full payment are matched",
      missingItems: ebrcMissing,
    },
  ];
}

function buildWhatToDoNext(
  shipment: DashboardLeakageShipmentRow,
  schemes: ShipmentDetailViewData["incentivesByScheme"]
): ShipmentWhatToDoNext {
  const steps: ShipmentWhatToDoNext["steps"] = [];

  if (shipment.status === "needs_review") {
    steps.push({
      title: "Verify extracted Shipping Bill fields",
      detail:
        "Confirm port code, LEO date, buyer, FOB amount, and HS lines so deadlines and incentives lock in.",
      href: `/app/shipping-bills/${shipment.id}/review`,
      ctaLabel: "Review fields",
    });
  }

  if (shipment.paymentStatus !== "full" && !shipment.isMatchedAndClosed) {
    const deadlineCopy =
      shipment.daysToDeadline === null
        ? "Upload your bank IRM export and match payment proceeds."
        : shipment.daysToDeadline <= 0
          ? `Your FEMA realisation deadline passed ${Math.abs(shipment.daysToDeadline)} days ago. Upload IRM or request an AD Bank / RBI extension immediately.`
          : `${shipment.daysToDeadline} days left to receive and match full buyer payment before ${shipment.realisationDueDate}.`;

    steps.push({
      title:
        shipment.paymentStatus === "partial"
          ? "Match remaining export payment"
          : "Match buyer inward remittance (IRM)",
      detail: deadlineCopy,
      href: "/app/matches",
      ctaLabel: "Open matching workbench",
    });
  }

  if (shipment.unclaimedIncentivePaise > 0) {
    const gapSchemes = schemes
      .filter((s) => s.gapMinor > 0)
      .map((s) => s.scheme.toUpperCase())
      .join(", ");
    steps.push({
      title: `Recover unclaimed ${gapSchemes || "export"} incentive`,
      detail:
        "Upload latest ICEGATE / DGFT scroll CSV or raise a short/missing credit query with customs/CHA.",
      href: "/app/incentives",
      ctaLabel: "Open incentive tracker",
    });
  }

  if (shipment.ebrcReady) {
    steps.push({
      title: "Generate & submit eBRC file",
      detail:
        "All payment and clearance checks look complete. Include this Shipping Bill in your bank eBRC batch.",
      href: "/app/documents",
      ctaLabel: "Prepare eBRC",
    });
  }

  if (steps.length === 0) {
    return {
      headline: "Everything on this shipment is reconciled and up to date.",
      urgency: "complete",
      steps: [],
    };
  }

  const urgency: ShipmentWhatToDoNext["urgency"] =
    shipment.isOverdue && !shipment.isMatchedAndClosed
      ? "overdue"
      : shipment.daysToDeadline !== null &&
          shipment.daysToDeadline < 30 &&
          !shipment.isMatchedAndClosed
        ? "urgent"
        : "action";

  const headline =
    urgency === "overdue"
      ? "Urgent: Realisation deadline has passed — resolve payment or bank extension now."
      : urgency === "urgent"
        ? `Action needed soon: less than ${shipment.daysToDeadline} days left before deadline.`
        : "Complete the next step(s) below to close leakage and prepare eBRC.";

  return { headline, urgency, steps };
}

export async function listComplianceRules(): Promise<ComplianceRuleRow[]> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new ForbiddenError("Authentication required.");
  }

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        key: string;
        value: Record<string, unknown>;
        effective_from: string;
        effective_to: string | null;
      }>(
        `select id, key, value, effective_from::text, effective_to::text
         from public.compliance_rules
         order by key asc, effective_from desc`
      );
      return res.rows.map((r) => ({
        id: r.id,
        key: r.key,
        value: r.value,
        effectiveFrom: r.effective_from.slice(0, 10),
        effectiveTo: r.effective_to ? r.effective_to.slice(0, 10) : null,
      }));
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("compliance_rules")
    .select("id, key, value, effective_from, effective_to")
    .order("key", { ascending: true })
    .order("effective_from", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    value: (r.value && typeof r.value === "object" ? r.value : {}) as Record<string, unknown>,
    effectiveFrom: r.effective_from.slice(0, 10),
    effectiveTo: r.effective_to ? r.effective_to.slice(0, 10) : null,
  }));
}

export async function upsertComplianceRule(input: {
  id?: string;
  key: string;
  months?: number | null;
  days?: number | null;
  confirmed: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  note?: string;
  orgId?: string;
}): Promise<ComplianceRuleRow> {
  const admin = await requirePlatformAdmin();
  const payloadValue: Record<string, unknown> = {
    confirmed: input.confirmed,
  };
  if (typeof input.months === "number" && input.months > 0) {
    payloadValue.months = input.months;
  }
  if (typeof input.days === "number" && input.days > 0) {
    payloadValue.days = input.days;
  }
  if (input.note) {
    payloadValue.note = input.note;
  }

  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new ValidationError("effectiveTo cannot precede effectiveFrom.");
  }

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(
      admin.id,
      async (tx) => {
        let row:
          | {
              id: string;
              key: string;
              value: Record<string, unknown>;
              effective_from: string;
              effective_to: string | null;
            }
          | undefined;

        if (input.id) {
          const res = await tx.query<{
            id: string;
            key: string;
            value: Record<string, unknown>;
            effective_from: string;
            effective_to: string | null;
          }>(
            `update public.compliance_rules
           set key = $1, value = $2::jsonb, effective_from = $3, effective_to = $4
           where id = $5
           returning id, key, value, effective_from::text, effective_to::text`,
            [
              input.key,
              JSON.stringify(payloadValue),
              input.effectiveFrom,
              input.effectiveTo ?? null,
              input.id,
            ]
          );
          row = res.rows[0];
        } else {
          const newId = crypto.randomUUID();
          const res = await tx.query<{
            id: string;
            key: string;
            value: Record<string, unknown>;
            effective_from: string;
            effective_to: string | null;
          }>(
            `insert into public.compliance_rules (id, key, value, effective_from, effective_to)
           values ($1, $2, $3::jsonb, $4, $5)
           returning id, key, value, effective_from::text, effective_to::text`,
            [
              newId,
              input.key,
              JSON.stringify(payloadValue),
              input.effectiveFrom,
              input.effectiveTo ?? null,
            ]
          );
          row = res.rows[0];
        }

        if (!row) {
          throw new NotFoundError("Compliance rule not found.");
        }

        if (input.orgId) {
          const perm = await tx.query<{ can_write: boolean }>(
            `select public.user_can_write_org($1) as can_write`,
            [input.orgId]
          );
          if (perm.rows[0]?.can_write) {
            await tx.query(
              `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
               values ($1, $2, 'update_compliance_rule', 'compliance_rules', $3, $4::jsonb)`,
              [
                input.orgId,
                admin.id,
                row.id,
                JSON.stringify({
                  key: row.key,
                  value: payloadValue,
                  effectiveFrom: input.effectiveFrom,
                }),
              ]
            );
          }
        }

        return {
          id: row.id,
          key: row.key,
          value: row.value,
          effectiveFrom: row.effective_from.slice(0, 10),
          effectiveTo: row.effective_to ? row.effective_to.slice(0, 10) : null,
        };
      },
      { isPlatformAdmin: true }
    );
  }

  const supabase = await createSupabaseServerClient();
  const mutation = input.id
    ? supabase
        .from("compliance_rules")
        .update({
          key: input.key,
          value: payloadValue as Json,
          effective_from: input.effectiveFrom,
          effective_to: input.effectiveTo ?? null,
        })
        .eq("id", input.id)
        .select("id, key, value, effective_from, effective_to")
        .single()
    : supabase
        .from("compliance_rules")
        .insert({
          key: input.key,
          value: payloadValue as Json,
          effective_from: input.effectiveFrom,
          effective_to: input.effectiveTo ?? null,
        })
        .select("id, key, value, effective_from, effective_to")
        .single();

  const { data: row, error } = await mutation;
  if (error || !row) {
    throw new ValidationError("Could not save compliance rule.");
  }

  if (input.orgId) {
    await supabase.from("audit_log").insert({
      org_id: input.orgId,
      actor_id: admin.id,
      action: "update_compliance_rule",
      entity: "compliance_rules",
      entity_id: row.id,
      diff: { key: row.key, value: payloadValue as Json, effectiveFrom: input.effectiveFrom },
    });
  }

  return {
    id: row.id,
    key: row.key,
    value: (row.value && typeof row.value === "object" ? row.value : {}) as Record<string, unknown>,
    effectiveFrom: row.effective_from.slice(0, 10),
    effectiveTo: row.effective_to ? row.effective_to.slice(0, 10) : null,
  };
}

export async function recordReportExportAudit(params: {
  orgId: string;
  format: "pdf" | "xlsx";
  shipmentCount: number;
  unclaimedIncentivePaise: number;
}): Promise<void> {
  const access = await requireOrgAccess(params.orgId, "viewer");
  const diff = {
    format: params.format,
    shipmentCount: params.shipmentCount,
    unclaimedIncentivePaise: params.unclaimedIncentivePaise,
  };

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'export_leakage_report', 'organizations', $1, $3::jsonb)`,
        [access.orgId, access.user.id, JSON.stringify(diff)]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "export_leakage_report",
    entity: "organizations",
    entity_id: access.orgId,
    diff,
  });
}

export const DEADLINE_RULE_KEYS_EXPORT = REALISATION_RULE_KEYS;
