import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  diffIsoDays,
  getIstTodayIso,
  resolveRealisationDeadline,
  type ComplianceRuleInput,
} from "@/lib/deadlines/engine";
import { formatMoney } from "@/lib/format";
import type { AlertSeverity, ShippingBillStatus } from "@/lib/database.types";
import type { CandidateAlert, AlertGenerationResult } from "@/lib/alerts/types";

const CLOSED_STATUSES = new Set<ShippingBillStatus>(["matched", "ebrc_ready", "closed"]);

interface RawIecProfile {
  id: string;
  org_id: string;
  iec_code: string;
  legal_name: string;
  default_currency: string;
}

interface RawOrg {
  id: string;
  plan_key: string;
  plan_status: string;
  trial_ends_at: string | null;
}

interface RawShippingBill {
  id: string;
  iec_id: string;
  sb_number: string;
  sb_date: string;
  leo_date: string | null;
  port_code: string;
  currency: string;
  fob_minor: number;
  status: ShippingBillStatus;
  realisation_due_date: string | null;
}

interface RawRemittanceMatch {
  shipping_bill_id: string;
  matched_minor: number;
}

interface RawScrip {
  id: string;
  iec_id: string;
  scrip_number: string;
  scheme: string;
  face_minor: number;
  expires_on: string;
  status: string;
}

interface RawExpectation {
  shipping_bill_id: string;
  scheme: string;
  expected_minor: number;
}

interface RawCredit {
  shipping_bill_id: string;
  scheme: string;
  credited_minor: number;
}

interface RawAlert {
  id: string;
  iec_id: string;
  kind: string;
  severity: AlertSeverity;
  shipping_bill_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  threshold: number | null;
  dedup_key: string | null;
  resolved_at: string | null;
}

export async function generateAlertsForIec(
  iecId: string,
  options?: { fakeNow?: Date; clockIso?: string }
): Promise<AlertGenerationResult> {
  const todayIso = options?.clockIso ?? getIstTodayIso(options?.fakeNow ?? new Date());
  const nowIso = options?.fakeNow ? options.fakeNow.toISOString() : new Date().toISOString();

  let iec: RawIecProfile | null = null;
  let org: RawOrg | null = null;
  let shippingBills: RawShippingBill[] = [];
  let matches: RawRemittanceMatch[] = [];
  let scrips: RawScrip[] = [];
  let expectations: RawExpectation[] = [];
  let credits: RawCredit[] = [];
  let rules: ComplianceRuleInput[] = [];
  let existingAlerts: RawAlert[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const iecRes = await db.query<RawIecProfile>(
      `select id, org_id, iec_code, legal_name, default_currency from public.iec_profiles where id = $1`,
      [iecId]
    );
    iec = iecRes.rows[0] ?? null;

    if (iec) {
      const orgRes = await db.query<RawOrg>(
        `select id, plan_key, plan_status, trial_ends_at::text from public.organizations where id = $1`,
        [iec.org_id]
      );
      org = orgRes.rows[0] ?? null;
    }

    const sbRes = await db.query<RawShippingBill>(
      `select id, iec_id, sb_number, sb_date::text, leo_date::text, port_code, currency,
              fob_minor, status, realisation_due_date::text
       from public.shipping_bills where iec_id = $1`,
      [iecId]
    );
    shippingBills = sbRes.rows;

    const mRes = await db.query<RawRemittanceMatch>(
      `select m.shipping_bill_id, m.matched_minor
       from public.sb_remittance_matches m
       join public.shipping_bills sb on sb.id = m.shipping_bill_id
       where sb.iec_id = $1`,
      [iecId]
    );
    matches = mRes.rows;

    const scRes = await db.query<RawScrip>(
      `select id, iec_id, scrip_number, scheme, face_minor, expires_on::text, status
       from public.scrips where iec_id = $1`,
      [iecId]
    );
    scrips = scRes.rows;

    const eRes = await db.query<RawExpectation>(
      `select e.shipping_bill_id, e.scheme, e.expected_minor
       from public.incentive_expectations e
       join public.shipping_bills sb on sb.id = e.shipping_bill_id
       where sb.iec_id = $1`,
      [iecId]
    );
    expectations = eRes.rows;

    const cRes = await db.query<RawCredit>(
      `select c.shipping_bill_id, c.scheme, c.credited_minor
       from public.incentive_credits c
       join public.shipping_bills sb on sb.id = c.shipping_bill_id
       where sb.iec_id = $1`,
      [iecId]
    );
    credits = cRes.rows;

    const rRes = await db.query<ComplianceRuleInput>(
      `select id, key, value, effective_from::text, effective_to::text
       from public.compliance_rules order by key asc, effective_from desc`
    );
    rules = rRes.rows;

    const aRes = await db.query<RawAlert>(
      `select id, iec_id, kind, severity, shipping_bill_id, entity_type, entity_id, threshold, dedup_key, resolved_at::text
       from public.alerts where iec_id = $1`,
      [iecId]
    );
    existingAlerts = aRes.rows;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: iecData } = await supabase
      .from("iec_profiles")
      .select("id, org_id, iec_code, legal_name, default_currency")
      .eq("id", iecId)
      .maybeSingle();
    iec = (iecData as RawIecProfile) ?? null;

    if (iec) {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, plan_key, plan_status, trial_ends_at")
        .eq("id", iec.org_id)
        .maybeSingle();
      org = (orgData as RawOrg) ?? null;
    }

    const [sbRes, scRes, rRes, aRes] = await Promise.all([
      supabase
        .from("shipping_bills")
        .select(
          "id, iec_id, sb_number, sb_date, leo_date, port_code, currency, fob_minor, status, realisation_due_date"
        )
        .eq("iec_id", iecId),
      supabase
        .from("scrips")
        .select("id, iec_id, scrip_number, scheme, face_minor, expires_on, status")
        .eq("iec_id", iecId),
      supabase.from("compliance_rules").select("id, key, value, effective_from, effective_to"),
      supabase
        .from("alerts")
        .select(
          "id, iec_id, kind, severity, shipping_bill_id, entity_type, entity_id, threshold, dedup_key, resolved_at"
        )
        .eq("iec_id", iecId),
    ]);

    shippingBills = (sbRes.data ?? []) as RawShippingBill[];
    scrips = (scRes.data ?? []) as RawScrip[];
    rules = (rRes.data ?? []) as ComplianceRuleInput[];
    existingAlerts = (aRes.data ?? []) as RawAlert[];

    if (shippingBills.length > 0) {
      const sbIds = shippingBills.map((s) => s.id);
      const [mRes, eRes, cRes] = await Promise.all([
        supabase
          .from("sb_remittance_matches")
          .select("shipping_bill_id, matched_minor")
          .in("shipping_bill_id", sbIds),
        supabase
          .from("incentive_expectations")
          .select("shipping_bill_id, scheme, expected_minor")
          .in("shipping_bill_id", sbIds),
        supabase
          .from("incentive_credits")
          .select("shipping_bill_id, scheme, credited_minor")
          .in("shipping_bill_id", sbIds),
      ]);
      matches = (mRes.data ?? []) as RawRemittanceMatch[];
      expectations = (eRes.data ?? []) as RawExpectation[];
      credits = (cRes.data ?? []) as RawCredit[];
    }
  }

  if (!iec) {
    return {
      generatedCount: 0,
      dedupedCount: 0,
      autoResolvedCount: 0,
      dispatchedEmails: 0,
      dispatchedInApp: 0,
      queuedDigests: 0,
      alerts: [],
    };
  }

  // Aggregate matches per shipping bill
  const matchedTotals = new Map<string, number>();
  for (const m of matches) {
    matchedTotals.set(
      m.shipping_bill_id,
      (matchedTotals.get(m.shipping_bill_id) ?? 0) + m.matched_minor
    );
  }

  // Aggregate expected vs credited per shipping bill
  const expectedTotals = new Map<string, number>();
  for (const e of expectations) {
    expectedTotals.set(
      e.shipping_bill_id,
      (expectedTotals.get(e.shipping_bill_id) ?? 0) + e.expected_minor
    );
  }
  const creditedTotals = new Map<string, number>();
  for (const c of credits) {
    creditedTotals.set(
      c.shipping_bill_id,
      (creditedTotals.get(c.shipping_bill_id) ?? 0) + c.credited_minor
    );
  }

  const existingDedupKeys = new Set<string>();
  const openAlerts = new Map<string, RawAlert>();

  for (const a of existingAlerts) {
    if (a.dedup_key) {
      existingDedupKeys.add(a.dedup_key);
    }
    if (!a.resolved_at) {
      openAlerts.set(a.id, a);
    }
  }

  const candidateAlerts: CandidateAlert[] = [];
  const alertsToResolve: string[] = [];

  // 1. Realisation Deadlines & Overdue
  for (const sb of shippingBills) {
    const matchedPaise = matchedTotals.get(sb.id) ?? 0;
    const isClosed = CLOSED_STATUSES.has(sb.status) || matchedPaise >= sb.fob_minor;

    if (isClosed) {
      for (const [id, openAlert] of openAlerts.entries()) {
        if (
          openAlert.shipping_bill_id === sb.id &&
          (openAlert.kind.startsWith("realisation_") || openAlert.kind === "missing_payment")
        ) {
          alertsToResolve.push(id);
        }
      }
      continue;
    }

    const resolved = resolveRealisationDeadline({
      sbDate: sb.leo_date ?? sb.sb_date,
      rules,
      currency: sb.currency,
      todayIso,
      storedDueDate: sb.realisation_due_date,
    });

    if (resolved.dueDate && resolved.daysLeft !== null) {
      const days = resolved.daysLeft;
      let threshold: number | null = null;
      let kind: CandidateAlert["kind"] | null = null;
      let severity: AlertSeverity = "info";

      if (days <= 0) {
        threshold = 0;
        kind = "realisation_overdue";
        severity = "critical";
      } else if (days <= 7) {
        threshold = 7;
        kind = "realisation_deadline_7";
        severity = "critical";
      } else if (days <= 30) {
        threshold = 30;
        kind = "realisation_deadline_30";
        severity = "warning";
      } else if (days <= 60) {
        threshold = 60;
        kind = "realisation_deadline_60";
        severity = "warning";
      } else if (days <= 90) {
        threshold = 90;
        kind = "realisation_deadline_90";
        severity = "info";
      }

      if (kind && threshold !== null) {
        const dedupKey = `realisation:${sb.id}:${threshold}`;
        if (!existingDedupKeys.has(dedupKey)) {
          const fobFormatted = formatMoney(sb.fob_minor, sb.currency, { showCode: true });

          candidateAlerts.push({
            iecId,
            kind,
            severity,
            title:
              threshold === 0
                ? `FEMA Realisation Overdue: SB #${sb.sb_number}`
                : `FEMA Realisation in ${days} Days: SB #${sb.sb_number}`,
            message:
              threshold === 0
                ? `Realisation due date ${resolved.dueDate} has passed for Shipping Bill #${sb.sb_number} (FOB: ${fobFormatted}). Reconcile payment immediately to avoid RBI caution listing.`
                : `FEMA deadline approaching on ${resolved.dueDate} (${days} days left) for Shipping Bill #${sb.sb_number} (FOB: ${fobFormatted}).`,
            shippingBillId: sb.id,
            dueOn: resolved.dueDate,
            entityType: "shipping_bill",
            entityId: sb.id,
            threshold,
            dedupKey,
          });
          existingDedupKeys.add(dedupKey);
        }
      }
    }

    // Missing payment link: filing date > 30 days ago and ₹0 payment matched
    const daysSinceFiling = diffIsoDays(sb.leo_date ?? sb.sb_date, todayIso) ?? 0;
    if (daysSinceFiling >= 30 && matchedPaise === 0) {
      const dedupKey = `missing_payment:${sb.id}`;
      if (!existingDedupKeys.has(dedupKey)) {
        candidateAlerts.push({
          iecId,
          kind: "missing_payment",
          severity: "warning",
          title: `Payment Missing: SB #${sb.sb_number}`,
          message: `Shipping Bill #${sb.sb_number} was filed ${daysSinceFiling} days ago but has no matched inward remittances.`,
          shippingBillId: sb.id,
          dueOn: sb.realisation_due_date,
          entityType: "shipping_bill",
          entityId: sb.id,
          threshold: 30,
          dedupKey,
        });
        existingDedupKeys.add(dedupKey);
      }
    }
  }

  // 2. Scrips Expiring & Expired
  for (const scrip of scrips) {
    const isUtilised = scrip.status === "utilised" || scrip.status === "cancelled";
    if (isUtilised) {
      for (const [id, openAlert] of openAlerts.entries()) {
        if (openAlert.entity_id === scrip.id && openAlert.kind.startsWith("scrip_expiry")) {
          alertsToResolve.push(id);
        }
      }
      continue;
    }

    const daysLeft = diffIsoDays(todayIso, scrip.expires_on);
    if (daysLeft !== null) {
      let threshold: number | null = null;
      let kind: CandidateAlert["kind"] | null = null;
      let severity: AlertSeverity = "info";

      if (daysLeft <= 0) {
        threshold = 0;
        kind = "scrip_expired";
        severity = "critical";
      } else if (daysLeft <= 7) {
        threshold = 7;
        kind = "scrip_expiry_7";
        severity = "critical";
      } else if (daysLeft <= 30) {
        threshold = 30;
        kind = "scrip_expiry_30";
        severity = "warning";
      } else if (daysLeft <= 90) {
        threshold = 90;
        kind = "scrip_expiry_90";
        severity = "info";
      }

      if (kind && threshold !== null) {
        const dedupKey = `scrip_expiry:${scrip.id}:${threshold}`;
        if (!existingDedupKeys.has(dedupKey)) {
          const valFormatted = formatMoney(scrip.face_minor, "INR", { showCode: false });
          candidateAlerts.push({
            iecId,
            kind,
            severity,
            title:
              threshold === 0
                ? `Scrip Expired: #${scrip.scrip_number}`
                : `Scrip Expiring in ${daysLeft} Days: #${scrip.scrip_number}`,
            message:
              threshold === 0
                ? `${scrip.scheme} scrip #${scrip.scrip_number} of value ${valFormatted} expired on ${scrip.expires_on}.`
                : `${scrip.scheme} scrip #${scrip.scrip_number} of value ${valFormatted} expires on ${scrip.expires_on}. Utilise before expiry.`,
            shippingBillId: null,
            dueOn: scrip.expires_on,
            entityType: "scrip",
            entityId: scrip.id,
            threshold,
            dedupKey,
          });
          existingDedupKeys.add(dedupKey);
        }
      }
    }
  }

  // 3. Unclaimed Export Incentive Found
  for (const sb of shippingBills) {
    const expected = expectedTotals.get(sb.id) ?? 0;
    const credited = creditedTotals.get(sb.id) ?? 0;
    const unclaimed = Math.max(0, expected - credited);

    if (unclaimed === 0) {
      for (const [id, openAlert] of openAlerts.entries()) {
        if (openAlert.shipping_bill_id === sb.id && openAlert.kind === "unclaimed_incentive") {
          alertsToResolve.push(id);
        }
      }
      continue;
    }

    const dedupKey = `unclaimed_incentive:${sb.id}`;
    if (!existingDedupKeys.has(dedupKey)) {
      const unclaimedFormatted = formatMoney(unclaimed, "INR", { showCode: false });
      candidateAlerts.push({
        iecId,
        kind: "unclaimed_incentive",
        severity: "info",
        title: `Unclaimed Incentive: ${unclaimedFormatted}`,
        message: `Expected export incentives exceed credited scrolls by ${unclaimedFormatted} for Shipping Bill #${sb.sb_number}.`,
        shippingBillId: sb.id,
        dueOn: null,
        entityType: "shipping_bill",
        entityId: sb.id,
        threshold: null,
        dedupKey,
      });
      existingDedupKeys.add(dedupKey);
    }
  }

  // 4. Trial Reminders & Payment Problems (Org-level)
  if (org) {
    if (org.plan_status === "past_due") {
      const dedupKey = `payment_problem:${org.id}`;
      if (!existingDedupKeys.has(dedupKey)) {
        candidateAlerts.push({
          iecId,
          kind: "payment_problem",
          severity: "critical",
          title: "Subscription Renewal Action Required",
          message:
            "Payment retry is in progress. 3-day grace period active with all premium features unlocked.",
          shippingBillId: null,
          dueOn: null,
          entityType: "organization",
          entityId: org.id,
          threshold: 3,
          dedupKey,
        });
        existingDedupKeys.add(dedupKey);
      }
    } else if (org.plan_status === "active") {
      for (const [id, openAlert] of openAlerts.entries()) {
        if (openAlert.kind === "payment_problem" && openAlert.entity_id === org.id) {
          alertsToResolve.push(id);
        }
      }
    }

    if (org.plan_key === "trial_pro" && org.trial_ends_at) {
      const trialDaysLeft = diffIsoDays(todayIso, org.trial_ends_at.slice(0, 10));
      if (trialDaysLeft !== null && trialDaysLeft <= 2 && trialDaysLeft >= 0) {
        const dedupKey = `trial_reminder:${org.id}:${trialDaysLeft}`;
        if (!existingDedupKeys.has(dedupKey)) {
          candidateAlerts.push({
            iecId,
            kind: "trial_reminder_day5",
            severity: "warning",
            title: `Pro Trial: ${trialDaysLeft} Days Remaining`,
            message:
              "Your 7-day Pro trial will revert to the Free tier soon. Upgrade to keep automatic eBRC exports and alerts.",
            shippingBillId: null,
            dueOn: org.trial_ends_at.slice(0, 10),
            entityType: "organization",
            entityId: org.id,
            threshold: trialDaysLeft,
            dedupKey,
          });
          existingDedupKeys.add(dedupKey);
        }
      }
    }
  }

  // Execute database writes
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    for (const a of candidateAlerts) {
      await db.query(
        `insert into public.alerts
           (iec_id, kind, severity, title, message, shipping_bill_id, due_on,
            entity_type, entity_id, threshold, dedup_key, sent_channels, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}', $12, $12)
         on conflict (iec_id, dedup_key) where dedup_key is not null do nothing`,
        [
          a.iecId,
          a.kind,
          a.severity,
          a.title,
          a.message,
          a.shippingBillId ?? null,
          a.dueOn ?? null,
          a.entityType ?? null,
          a.entityId ?? null,
          a.threshold ?? null,
          a.dedupKey,
          nowIso,
        ]
      );
    }

    if (alertsToResolve.length > 0) {
      await db.query(
        `update public.alerts
         set resolved_at = $1, updated_at = $1
         where id = any($2::uuid[])`,
        [nowIso, alertsToResolve]
      );
    }
  } else {
    const supabase = await createSupabaseServerClient();
    if (candidateAlerts.length > 0) {
      await supabase.from("alerts").upsert(
        candidateAlerts.map((a) => ({
          iec_id: a.iecId,
          kind: a.kind,
          severity: a.severity,
          title: a.title,
          message: a.message,
          shipping_bill_id: a.shippingBillId ?? null,
          due_on: a.dueOn ?? null,
          entity_type: a.entityType ?? null,
          entity_id: a.entityId ?? null,
          threshold: a.threshold ?? null,
          dedup_key: a.dedupKey,
          sent_channels: [],
          created_at: nowIso,
          updated_at: nowIso,
        })),
        { onConflict: "iec_id,dedup_key", ignoreDuplicates: true }
      );
    }

    if (alertsToResolve.length > 0) {
      await supabase
        .from("alerts")
        .update({ resolved_at: nowIso, updated_at: nowIso })
        .in("id", alertsToResolve);
    }
  }

  return {
    generatedCount: candidateAlerts.length,
    dedupedCount: existingDedupKeys.size - candidateAlerts.length,
    autoResolvedCount: alertsToResolve.length,
    dispatchedEmails: 0,
    dispatchedInApp: candidateAlerts.length,
    queuedDigests: 0,
    alerts: candidateAlerts,
  };
}
