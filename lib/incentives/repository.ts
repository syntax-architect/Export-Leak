import crypto from "node:crypto";
import { INCENTIVE_SCHEMES, SCRIP_VALIDITY_COMPLIANCE_KEY } from "@/config/incentives";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import {
  getAuthenticatedUser,
  requireOrgAccess,
  requirePlatformAdmin,
  type AuthenticatedUser,
} from "@/lib/auth/org-access";
import type { IncentiveScheme, Json, ScripStatus, ShippingBillStatus } from "@/lib/database.types";
import { parseDecimalMoneyToMinorUnits } from "@/lib/documents/parsing/types";
import {
  calculateShippingBillIncentives,
  deriveIncentiveComparisonStatus,
} from "@/lib/incentives/calculator";
import { parseAndValidateRatesSpreadsheet } from "@/lib/incentives/rate-importer";
import {
  computeDaysToExpiry,
  getTodayIstIsoDate,
  parseComplianceScripValidityValue,
  resolveScripExpiry,
} from "@/lib/incentives/scrip-utils";
import { parseScrollSpreadsheet } from "@/lib/incentives/scroll-importer";
import type {
  IncentiveCalcDetail,
  IncentiveComparisonStatus,
  IncentiveRateRecord,
  ParsedRateCsvRow,
  ParsedScrollCsvRow,
  RateCsvPreviewResult,
  ScripSummaryItem,
  ScripValidityRuleConfig,
  ScrollCsvPreviewResult,
  ShippingBillCalcInput,
} from "@/lib/incentives/types";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface IncentiveComparisonRow {
  shippingBillId: string;
  iecId: string;
  sbNumber: string;
  sbDate: string;
  leoDate: string | null;
  currency: string;
  fobMinor: number;
  exchangeRate: string | null;
  calculationEligible: boolean;
  scheme: IncentiveScheme;
  claimedOnSb: boolean;
  expectedMinor: number;
  creditedMinor: number;
  gapMinor: number;
  status: IncentiveComparisonStatus;
  hasExpectationRecord: boolean;
  calcDetail: IncentiveCalcDetail | null;
  creditedOn: string | null;
  scrollNumber: string;
}

export interface IncentiveCreditItem {
  id: string;
  shippingBillId: string;
  sbNumber: string;
  scheme: IncentiveScheme;
  creditedMinor: number;
  creditedOn: string | null;
  scrollNumber: string;
  createdAt: string;
}

export interface IncentivesWorkspaceData {
  activeIec: { id: string; iecCode: string; legalName: string } | null;
  iecs: Array<{ id: string; iecCode: string; legalName: string }>;
  summary: {
    expectedTotalInrMinor: number;
    creditedTotalInrMinor: number;
    gapTotalInrMinor: number;
    shortOrMissingCount: number;
    unclaimedCount: number;
    unknownRateCount: number;
    nextToExpireCount: number;
  };
  rows: IncentiveComparisonRow[];
  credits: IncentiveCreditItem[];
  scrips: ScripSummaryItem[];
  nextToExpireScrips: ScripSummaryItem[];
  rates: IncentiveRateRecord[];
  validityRule: ScripValidityRuleConfig | null;
  isPlatformAdmin: boolean;
}

function isCalculationEligibleSb(status: ShippingBillStatus): boolean {
  return status !== "needs_review" && status !== "queued";
}

function normalizeClaimedSchemes(schemes: readonly string[] | null | undefined): IncentiveScheme[] {
  return (schemes ?? []).filter((s): s is IncentiveScheme =>
    (INCENTIVE_SCHEMES as readonly string[]).includes(s)
  );
}

function mapRateRow(row: {
  id: string;
  scheme: IncentiveScheme;
  hs_code: string;
  rate_bps: number;
  cap_per_unit_minor: number | null;
  uqc: string | null;
  effective_from: string;
  effective_to: string | null;
  source_note: string;
}): IncentiveRateRecord {
  return {
    id: row.id,
    scheme: row.scheme,
    hsCode: row.hs_code,
    rateBps: Number(row.rate_bps),
    capPerUnitMinor: row.cap_per_unit_minor !== null ? Number(row.cap_per_unit_minor) : null,
    uqc: row.uqc,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    sourceNote: row.source_note,
  };
}

async function resolveAdminAuditOrgId(
  userId: string,
  requestedOrgId?: string
): Promise<string | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(userId, async (tx) => {
      if (requestedOrgId) {
        const check = await tx.query<{ org_id: string }>(
          `select org_id from public.memberships where user_id = $1 and org_id = $2 limit 1`,
          [userId, requestedOrgId]
        );
        if (check.rows[0]?.org_id) return check.rows[0].org_id;
      }
      const fallback = await tx.query<{ org_id: string }>(
        `select org_id from public.memberships where user_id = $1 order by created_at asc limit 1`,
        [userId]
      );
      return fallback.rows[0]?.org_id ?? null;
    });
  }

  const supabase = await createSupabaseServerClient();
  if (requestedOrgId) {
    const { data } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", requestedOrgId)
      .limit(1)
      .maybeSingle();
    if (data?.org_id) return data.org_id;
  }
  const { data } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.org_id ?? null;
}

async function fetchActiveComplianceScripValidity(
  viewerUser: AuthenticatedUser | null
): Promise<ScripValidityRuleConfig | null> {
  const todayIso = getTodayIstIsoDate();

  if (isPgliteTestAdapterEnabled() && viewerUser) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(
      viewerUser.id,
      async (tx) => {
        const res = await tx.query<{
          value: unknown;
          effective_from: string;
        }>(
          `select value, effective_from::text as effective_from
           from public.compliance_rules
           where key = $1
             and effective_from <= $2::date
             and (effective_to is null or effective_to >= $2::date)
           order by effective_from desc
           limit 1`,
          [SCRIP_VALIDITY_COMPLIANCE_KEY, todayIso]
        );
        const row = res.rows[0];
        if (!row) return null;
        const parsed = parseComplianceScripValidityValue(row.value);
        if (!parsed) return null;
        return { ...parsed, effectiveFrom: row.effective_from };
      },
      { isPlatformAdmin: viewerUser.isPlatformAdmin }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("compliance_rules")
    .select("value, effective_from")
    .eq("key", SCRIP_VALIDITY_COMPLIANCE_KEY)
    .lte("effective_from", todayIso)
    .or(`effective_to.is.null,effective_to.gte.${todayIso}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const parsed = parseComplianceScripValidityValue(data.value);
  if (!parsed) return null;
  return { ...parsed, effectiveFrom: data.effective_from };
}

export async function listIncentiveRates(params?: {
  scheme?: IncentiveScheme;
  hsCode?: string;
}): Promise<{ rates: IncentiveRateRecord[]; validityRule: ScripValidityRuleConfig | null }> {
  const user = await getAuthenticatedUser();

  if (isPgliteTestAdapterEnabled()) {
    if (!user) {
      throw new ValidationError("Authentication required to view incentive rates.");
    }
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const rows = await asPgliteUser(
      user.id,
      async (tx) => {
        const conditions: string[] = [];
        const values: unknown[] = [];
        if (params?.scheme) {
          values.push(params.scheme);
          conditions.push(`scheme = $${values.length}`);
        }
        if (params?.hsCode) {
          values.push(params.hsCode);
          conditions.push(`hs_code = $${values.length}`);
        }
        const whereClause = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
        const res = await tx.query<{
          id: string;
          scheme: IncentiveScheme;
          hs_code: string;
          rate_bps: number;
          cap_per_unit_minor: string | number | null;
          uqc: string | null;
          effective_from: string;
          effective_to: string | null;
          source_note: string;
        }>(
          `select id, scheme, hs_code, rate_bps, cap_per_unit_minor, uqc,
                  effective_from::text as effective_from,
                  effective_to::text as effective_to,
                  source_note
           from public.incentive_rates
           ${whereClause}
           order by hs_code asc, scheme asc, effective_from desc`,
          values
        );
        return res.rows.map((r) =>
          mapRateRow({
            ...r,
            cap_per_unit_minor: r.cap_per_unit_minor !== null ? Number(r.cap_per_unit_minor) : null,
          })
        );
      },
      { isPlatformAdmin: user.isPlatformAdmin }
    );
    const validityRule = await fetchActiveComplianceScripValidity(user);
    return { rates: rows, validityRule };
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("incentive_rates")
    .select(
      "id, scheme, hs_code, rate_bps, cap_per_unit_minor, uqc, effective_from, effective_to, source_note"
    )
    .order("hs_code", { ascending: true })
    .order("scheme", { ascending: true })
    .order("effective_from", { ascending: false });

  if (params?.scheme) query = query.eq("scheme", params.scheme);
  if (params?.hsCode) query = query.eq("hs_code", params.hsCode);

  const { data, error } = await query;
  if (error) throw error;

  const validityRule = await fetchActiveComplianceScripValidity(user);
  return {
    rates: (data ?? []).map(mapRateRow),
    validityRule,
  };
}

export async function previewIncentiveRatesImport(params: {
  filename: string;
  bytes: Uint8Array;
}): Promise<RateCsvPreviewResult> {
  await requirePlatformAdmin();
  const { rates } = await listIncentiveRates();
  return parseAndValidateRatesSpreadsheet({
    filename: params.filename,
    bytes: params.bytes,
    existingRates: rates,
  });
}

export async function commitIncentiveRatesImport(params: {
  rows: ParsedRateCsvRow[];
  orgId?: string;
}): Promise<{ insertedCount: number; rates: IncentiveRateRecord[] }> {
  const admin = await requirePlatformAdmin();
  if (params.rows.length === 0) {
    throw new ValidationError("Provide at least one validated rate row.");
  }

  const auditOrgId = await resolveAdminAuditOrgId(admin.id, params.orgId);

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const inserted = await asPgliteUser(
      admin.id,
      async (tx) => {
        const created: IncentiveRateRecord[] = [];
        try {
          for (const row of params.rows) {
            const id = crypto.randomUUID();
            const res = await tx.query<{
              id: string;
              scheme: IncentiveScheme;
              hs_code: string;
              rate_bps: number;
              cap_per_unit_minor: string | number | null;
              uqc: string | null;
              effective_from: string;
              effective_to: string | null;
              source_note: string;
            }>(
              `insert into public.incentive_rates (
                 id, scheme, hs_code, rate_bps, cap_per_unit_minor, uqc,
                 effective_from, effective_to, source_note
               ) values ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9)
               returning id, scheme, hs_code, rate_bps, cap_per_unit_minor, uqc,
                         effective_from::text as effective_from,
                         effective_to::text as effective_to,
                         source_note`,
              [
                id,
                row.scheme,
                row.hsCode,
                row.rateBps,
                row.capPerUnitMinor,
                row.uqc,
                row.effectiveFrom,
                row.effectiveTo,
                row.sourceNote,
              ]
            );
            const r = res.rows[0]!;
            created.push(
              mapRateRow({
                ...r,
                cap_per_unit_minor:
                  r.cap_per_unit_minor !== null ? Number(r.cap_per_unit_minor) : null,
              })
            );
          }

          if (auditOrgId) {
            await tx.query(
              `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
               values ($1, $2, 'incentive_rate', $3, 'import', $4::jsonb)`,
              [
                auditOrgId,
                admin.id,
                created[0]?.id ?? null,
                JSON.stringify({
                  insertedCount: created.length,
                  schemes: Array.from(new Set(created.map((c) => c.scheme))),
                }),
              ]
            );
          }

          return created;
        } catch (err) {
          const code = (err as { code?: string } | null)?.code;
          const message = err instanceof Error ? err.message : "Failed to insert rate rows.";
          if (code === "23P01") {
            throw new ConflictError(message);
          }
          if (code === "23514") {
            throw new ValidationError(message);
          }
          throw err;
        }
      },
      { isPlatformAdmin: true }
    );

    return { insertedCount: inserted.length, rates: inserted };
  }

  const supabase = await createSupabaseServerClient();
  const payload = params.rows.map((row) => ({
    scheme: row.scheme,
    hs_code: row.hsCode,
    rate_bps: row.rateBps,
    cap_per_unit_minor: row.capPerUnitMinor,
    uqc: row.uqc,
    effective_from: row.effectiveFrom,
    effective_to: row.effectiveTo,
    source_note: row.sourceNote,
  }));

  const { data, error } = await supabase
    .from("incentive_rates")
    .insert(payload)
    .select(
      "id, scheme, hs_code, rate_bps, cap_per_unit_minor, uqc, effective_from, effective_to, source_note"
    );

  if (error) {
    if (error.code === "23P01") {
      throw new ConflictError(error.message);
    }
    if (error.code === "23514") {
      throw new ValidationError(error.message);
    }
    throw error;
  }

  const created = (data ?? []).map(mapRateRow);
  if (auditOrgId) {
    await supabase.from("audit_log").insert({
      org_id: auditOrgId,
      actor_id: admin.id,
      entity: "incentive_rate",
      entity_id: created[0]?.id ?? null,
      action: "import",
      diff: {
        insertedCount: created.length,
        schemes: Array.from(new Set(created.map((c) => c.scheme))),
      } as Json,
    });
  }

  return { insertedCount: created.length, rates: created };
}

export async function upsertScripValidityRule(params: {
  confirmed: boolean;
  months: number | null;
  days?: number | null;
  sourceNote: string;
  effectiveFrom: string;
  orgId?: string;
}): Promise<ScripValidityRuleConfig> {
  const admin = await requirePlatformAdmin();
  const auditOrgId = await resolveAdminAuditOrgId(admin.id, params.orgId);

  const ruleValue: Record<string, unknown> = {
    confirmed: params.confirmed,
    months: params.months,
    days: params.days ?? null,
    source_note: params.sourceNote,
  };

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const saved = await asPgliteUser(
      admin.id,
      async (tx) => {
        const existing = await tx.query<{ id: string }>(
          `select id from public.compliance_rules
           where key = $1 and effective_from = $2::date
           limit 1`,
          [SCRIP_VALIDITY_COMPLIANCE_KEY, params.effectiveFrom]
        );

        let ruleId: string;
        if (existing.rows[0]?.id) {
          ruleId = existing.rows[0].id;
          await tx.query(
            `update public.compliance_rules
             set value = $1::jsonb, effective_to = null
             where id = $2`,
            [JSON.stringify(ruleValue), ruleId]
          );
        } else {
          ruleId = crypto.randomUUID();
          await tx.query(
            `insert into public.compliance_rules (id, key, value, effective_from, effective_to)
             values ($1, $2, $3::jsonb, $4::date, null)`,
            [ruleId, SCRIP_VALIDITY_COMPLIANCE_KEY, JSON.stringify(ruleValue), params.effectiveFrom]
          );
        }

        if (auditOrgId) {
          await tx.query(
            `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
             values ($1, $2, 'compliance_rule', $3, 'upsert', $4::jsonb)`,
            [auditOrgId, admin.id, ruleId, JSON.stringify(ruleValue)]
          );
        }

        return ruleId;
      },
      { isPlatformAdmin: true }
    );

    void saved;
    return {
      confirmed: params.confirmed,
      months: params.months,
      days: params.days ?? null,
      sourceNote: params.sourceNote,
      effectiveFrom: params.effectiveFrom,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("compliance_rules")
    .select("id")
    .eq("key", SCRIP_VALIDITY_COMPLIANCE_KEY)
    .eq("effective_from", params.effectiveFrom)
    .limit(1)
    .maybeSingle();

  let ruleId: string;
  if (existing?.id) {
    ruleId = existing.id;
    const { error } = await supabase
      .from("compliance_rules")
      .update({ value: ruleValue as Json, effective_to: null })
      .eq("id", ruleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("compliance_rules")
      .insert({
        key: SCRIP_VALIDITY_COMPLIANCE_KEY,
        value: ruleValue as Json,
        effective_from: params.effectiveFrom,
        effective_to: null,
      })
      .select("id")
      .single();
    if (error) throw error;
    ruleId = data.id;
  }

  if (auditOrgId) {
    await supabase.from("audit_log").insert({
      org_id: auditOrgId,
      actor_id: admin.id,
      entity: "compliance_rule",
      entity_id: ruleId,
      action: "upsert",
      diff: ruleValue as Json,
    });
  }

  return {
    confirmed: params.confirmed,
    months: params.months,
    days: params.days ?? null,
    sourceNote: params.sourceNote,
    effectiveFrom: params.effectiveFrom,
  };
}

export async function recalculateIncentivesForOrg(params: {
  orgId: string;
  iecId?: string;
  shippingBillId?: string;
}): Promise<{ billsEvaluated: number; expectationsUpserted: number }> {
  const access = await requireOrgAccess(params.orgId, "member");
  const { rates } = await listIncentiveRates();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const filters: string[] = ["iec.org_id = $1"];
      const values: unknown[] = [access.orgId];

      if (params.iecId) {
        values.push(params.iecId);
        filters.push(`sb.iec_id = $${values.length}`);
      }
      if (params.shippingBillId) {
        values.push(params.shippingBillId);
        filters.push(`sb.id = $${values.length}`);
      }

      const sbRes = await tx.query<{
        id: string;
        sb_number: string;
        sb_date: string;
        leo_date: string | null;
        currency: string;
        exchange_rate: string | null;
        schemes_claimed: string[];
        status: ShippingBillStatus;
      }>(
        `select sb.id, sb.sb_number, sb.sb_date::text as sb_date,
                sb.leo_date::text as leo_date, sb.currency,
                sb.exchange_rate::text as exchange_rate,
                sb.schemes_claimed, sb.status
         from public.shipping_bills sb
         join public.iec_profiles iec on iec.id = sb.iec_id
         where ${filters.join(" and ")}
         order by sb.sb_date desc, sb.sb_number asc`,
        values
      );

      if (sbRes.rows.length === 0) {
        return { billsEvaluated: 0, expectationsUpserted: 0 };
      }

      const sbIds = sbRes.rows.map((r) => r.id);
      const itemRes = await tx.query<{
        id: string;
        shipping_bill_id: string;
        hs_code: string;
        description: string;
        quantity: string;
        uqc: string;
        fob_minor: string | number;
      }>(
        `select id, shipping_bill_id, hs_code, description, quantity::text as quantity, uqc, fob_minor
         from public.shipping_bill_items
         where shipping_bill_id = any($1::uuid[])
         order by id asc`,
        [sbIds]
      );

      const itemsBySb = new Map<string, ShippingBillCalcInput["items"]>();
      for (const item of itemRes.rows) {
        const list = itemsBySb.get(item.shipping_bill_id) ?? [];
        list.push({
          id: item.id,
          hsCode: item.hs_code,
          description: item.description,
          quantity: item.quantity,
          uqc: item.uqc,
          fobMinor: Number(item.fob_minor),
        });
        itemsBySb.set(item.shipping_bill_id, list);
      }

      let upserted = 0;
      for (const sb of sbRes.rows) {
        const input: ShippingBillCalcInput = {
          shippingBillId: sb.id,
          sbNumber: sb.sb_number,
          sbDate: sb.sb_date,
          leoDate: sb.leo_date,
          currency: sb.currency,
          exchangeRate: sb.exchange_rate,
          schemesClaimed: normalizeClaimedSchemes(sb.schemes_claimed),
          calculationEligible: isCalculationEligibleSb(sb.status),
          items: itemsBySb.get(sb.id) ?? [],
        };

        const calcResults = calculateShippingBillIncentives(input, rates);
        for (const res of calcResults) {
          await tx.query(
            `insert into public.incentive_expectations (
               shipping_bill_id, scheme, expected_minor, rate_id, calc_detail
             ) values ($1, $2, $3, $4, $5::jsonb)
             on conflict (shipping_bill_id, scheme) do update
               set expected_minor = excluded.expected_minor,
                   rate_id = excluded.rate_id,
                   calc_detail = excluded.calc_detail,
                   updated_at = now()`,
            [
              sb.id,
              res.scheme,
              res.expectedMinor,
              res.primaryRateId,
              JSON.stringify(res.calcDetail),
            ]
          );
          upserted += 1;
        }
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
         values ($1, $2, 'incentive_expectation', $3, 'recalculate', $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          params.shippingBillId ?? sbRes.rows[0]!.id,
          JSON.stringify({ billsEvaluated: sbRes.rows.length, expectationsUpserted: upserted }),
        ]
      );

      return {
        billsEvaluated: sbRes.rows.length,
        expectationsUpserted: upserted,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  let iecIds: string[] = [];
  if (params.iecId) {
    iecIds = [params.iecId];
  } else {
    const { data: iecRows, error: iecErr } = await supabase
      .from("iec_profiles")
      .select("id")
      .eq("org_id", access.orgId);
    if (iecErr) throw iecErr;
    iecIds = (iecRows ?? []).map((r) => r.id);
  }
  if (iecIds.length === 0) {
    return { billsEvaluated: 0, expectationsUpserted: 0 };
  }

  let sbQuery = supabase
    .from("shipping_bills")
    .select("id, sb_number, sb_date, leo_date, currency, exchange_rate, schemes_claimed, status")
    .in("iec_id", iecIds);
  if (params.shippingBillId) {
    sbQuery = sbQuery.eq("id", params.shippingBillId);
  }
  const { data: sbRows, error: sbErr } = await sbQuery;
  if (sbErr) throw sbErr;
  if (!sbRows || sbRows.length === 0) {
    return { billsEvaluated: 0, expectationsUpserted: 0 };
  }

  const sbIds = sbRows.map((r) => r.id);
  const { data: itemRows, error: itemErr } = await supabase
    .from("shipping_bill_items")
    .select("id, shipping_bill_id, hs_code, description, quantity, uqc, fob_minor")
    .in("shipping_bill_id", sbIds);
  if (itemErr) throw itemErr;

  const itemsBySb = new Map<string, ShippingBillCalcInput["items"]>();
  for (const item of itemRows ?? []) {
    const list = itemsBySb.get(item.shipping_bill_id) ?? [];
    list.push({
      id: item.id,
      hsCode: item.hs_code,
      description: item.description,
      quantity: String(item.quantity),
      uqc: item.uqc,
      fobMinor: Number(item.fob_minor),
    });
    itemsBySb.set(item.shipping_bill_id, list);
  }

  const upsertRows: Array<{
    shipping_bill_id: string;
    scheme: IncentiveScheme;
    expected_minor: number;
    rate_id: string | null;
    calc_detail: Json;
  }> = [];

  for (const sb of sbRows) {
    const input: ShippingBillCalcInput = {
      shippingBillId: sb.id,
      sbNumber: sb.sb_number,
      sbDate: sb.sb_date,
      leoDate: sb.leo_date,
      currency: sb.currency,
      exchangeRate: sb.exchange_rate !== null ? String(sb.exchange_rate) : null,
      schemesClaimed: normalizeClaimedSchemes(sb.schemes_claimed),
      calculationEligible: isCalculationEligibleSb(sb.status),
      items: itemsBySb.get(sb.id) ?? [],
    };
    for (const res of calculateShippingBillIncentives(input, rates)) {
      upsertRows.push({
        shipping_bill_id: sb.id,
        scheme: res.scheme,
        expected_minor: res.expectedMinor,
        rate_id: res.primaryRateId,
        calc_detail: res.calcDetail as unknown as Json,
      });
    }
  }

  const { error: upsertErr } = await supabase
    .from("incentive_expectations")
    .upsert(upsertRows, { onConflict: "shipping_bill_id,scheme" });
  if (upsertErr) throw upsertErr;

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    entity: "incentive_expectation",
    entity_id: params.shippingBillId ?? sbRows[0]!.id,
    action: "recalculate",
    diff: {
      billsEvaluated: sbRows.length,
      expectationsUpserted: upsertRows.length,
    } as Json,
  });

  return {
    billsEvaluated: sbRows.length,
    expectationsUpserted: upsertRows.length,
  };
}

async function resolveSbNumberMapForIec(params: {
  orgId: string;
  iecId: string;
  userId: string;
}): Promise<Map<string, { id: string; sbNumber: string }>> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      const check = await tx.query<{ id: string }>(
        `select id from public.iec_profiles where id = $1 and org_id = $2`,
        [params.iecId, params.orgId]
      );
      if (!check.rows[0]) {
        throw new NotFoundError("IEC profile not found in this organization.");
      }

      const sbRes = await tx.query<{ id: string; sb_number: string }>(
        `select id, sb_number from public.shipping_bills where iec_id = $1`,
        [params.iecId]
      );
      const map = new Map<string, { id: string; sbNumber: string }>();
      for (const row of sbRes.rows) {
        map.set(row.sb_number.trim().toUpperCase(), { id: row.id, sbNumber: row.sb_number });
      }
      return map;
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: iec, error: iecErr } = await supabase
    .from("iec_profiles")
    .select("id")
    .eq("id", params.iecId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (iecErr) throw iecErr;
  if (!iec) throw new NotFoundError("IEC profile not found in this organization.");

  const { data: sbs, error: sbErr } = await supabase
    .from("shipping_bills")
    .select("id, sb_number")
    .eq("iec_id", params.iecId);
  if (sbErr) throw sbErr;

  const map = new Map<string, { id: string; sbNumber: string }>();
  for (const row of sbs ?? []) {
    map.set(row.sb_number.trim().toUpperCase(), { id: row.id, sbNumber: row.sb_number });
  }
  return map;
}

export async function previewScrollImportForOrg(params: {
  orgId: string;
  iecId: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<ScrollCsvPreviewResult> {
  const access = await requireOrgAccess(params.orgId, "member");
  const parsed = await parseScrollSpreadsheet({
    filename: params.filename,
    bytes: params.bytes,
  });

  const sbMap = await resolveSbNumberMapForIec({
    orgId: access.orgId,
    iecId: params.iecId,
    userId: access.user.id,
  });

  const matchedRows: ParsedScrollCsvRow[] = [];
  const combinedErrors = [...parsed.errors];

  for (const row of parsed.validRows) {
    const match = sbMap.get(row.sbNumber.trim().toUpperCase());
    if (!match) {
      combinedErrors.push({
        rowNumber: row.rowNumber,
        sbNumber: row.sbNumber,
        message: `Shipping Bill "${row.sbNumber}" was not found under the active IEC profile.`,
        rawRow: Object.values(row.raw),
      });
      continue;
    }
    matchedRows.push(row);
  }

  combinedErrors.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    totalDataRows: parsed.totalDataRows,
    validRows: matchedRows,
    errors: combinedErrors,
  };
}

export async function commitScrollImportForOrg(params: {
  orgId: string;
  iecId: string;
  rows: ParsedScrollCsvRow[];
}): Promise<{
  importedCount: number;
  failedRows: Array<{ rowNumber: number; sbNumber: string; message: string }>;
}> {
  const access = await requireOrgAccess(params.orgId, "member");
  const sbMap = await resolveSbNumberMapForIec({
    orgId: access.orgId,
    iecId: params.iecId,
    userId: access.user.id,
  });

  const failedRows: Array<{ rowNumber: number; sbNumber: string; message: string }> = [];
  const toPersist: Array<{ row: ParsedScrollCsvRow; shippingBillId: string }> = [];

  for (const row of params.rows) {
    const sb = sbMap.get(row.sbNumber.trim().toUpperCase());
    if (!sb) {
      failedRows.push({
        rowNumber: row.rowNumber,
        sbNumber: row.sbNumber,
        message: `Shipping Bill "${row.sbNumber}" does not exist under active IEC.`,
      });
      continue;
    }
    toPersist.push({ row, shippingBillId: sb.id });
  }

  let importedCount = 0;

  if (toPersist.length > 0) {
    if (isPgliteTestAdapterEnabled()) {
      const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
      await asPgliteUser(access.user.id, async (tx) => {
        for (const item of toPersist) {
          const scrollNo = item.row.scrollNumber.trim();
          if (scrollNo) {
            await tx.query(
              `insert into public.incentive_credits (
                 shipping_bill_id, scheme, credited_minor, credited_on, scroll_number, raw
               ) values ($1, $2, $3, $4::date, $5, $6::jsonb)
               on conflict (shipping_bill_id, scheme, scroll_number) where scroll_number <> ''
               do update set
                 credited_minor = excluded.credited_minor,
                 credited_on = excluded.credited_on,
                 raw = excluded.raw,
                 updated_at = now()`,
              [
                item.shippingBillId,
                item.row.scheme,
                item.row.creditedMinor,
                item.row.creditedOn,
                scrollNo,
                JSON.stringify(item.row.raw),
              ]
            );
          } else {
            await tx.query(
              `insert into public.incentive_credits (
                 shipping_bill_id, scheme, credited_minor, credited_on, scroll_number, raw
               ) values ($1, $2, $3, $4::date, '', $5::jsonb)`,
              [
                item.shippingBillId,
                item.row.scheme,
                item.row.creditedMinor,
                item.row.creditedOn,
                JSON.stringify(item.row.raw),
              ]
            );
          }
          importedCount += 1;
        }

        await tx.query(
          `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
           values ($1, $2, 'incentive_credit', $3, 'import', $4::jsonb)`,
          [
            access.orgId,
            access.user.id,
            toPersist[0]!.shippingBillId,
            JSON.stringify({ importedCount, failedCount: failedRows.length }),
          ]
        );
      });
    } else {
      const supabase = await createSupabaseServerClient();
      for (const item of toPersist) {
        const scrollNo = item.row.scrollNumber.trim();
        if (scrollNo) {
          const { data: existing } = await supabase
            .from("incentive_credits")
            .select("id")
            .eq("shipping_bill_id", item.shippingBillId)
            .eq("scheme", item.row.scheme)
            .eq("scroll_number", scrollNo)
            .maybeSingle();

          if (existing?.id) {
            const { error } = await supabase
              .from("incentive_credits")
              .update({
                credited_minor: item.row.creditedMinor,
                credited_on: item.row.creditedOn,
                raw: item.row.raw as Json,
              })
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("incentive_credits").insert({
              shipping_bill_id: item.shippingBillId,
              scheme: item.row.scheme,
              credited_minor: item.row.creditedMinor,
              credited_on: item.row.creditedOn,
              scroll_number: scrollNo,
              raw: item.row.raw as Json,
            });
            if (error) throw error;
          }
        } else {
          const { error } = await supabase.from("incentive_credits").insert({
            shipping_bill_id: item.shippingBillId,
            scheme: item.row.scheme,
            credited_minor: item.row.creditedMinor,
            credited_on: item.row.creditedOn,
            scroll_number: "",
            raw: item.row.raw as Json,
          });
          if (error) throw error;
        }
        importedCount += 1;
      }

      await supabase.from("audit_log").insert({
        org_id: access.orgId,
        actor_id: access.user.id,
        entity: "incentive_credit",
        entity_id: toPersist[0]!.shippingBillId,
        action: "import",
        diff: { importedCount, failedCount: failedRows.length } as Json,
      });
    }
  }

  return { importedCount, failedRows };
}

export async function createOrImportScripsForOrg(params: {
  orgId: string;
  iecId: string;
  items: Array<{
    scripNumber: string;
    scheme: IncentiveScheme;
    faceAmountInr: string;
    generatedOn: string;
    expiresOn?: string | null;
    status?: ScripStatus;
    notes?: string;
  }>;
}): Promise<{ scrips: ScripSummaryItem[] }> {
  const access = await requireOrgAccess(params.orgId, "member");
  const validityRule = await fetchActiveComplianceScripValidity(access.user);
  const todayIst = getTodayIstIsoDate();

  const prepared = params.items.map((item) => {
    const faceMinor = parseDecimalMoneyToMinorUnits(item.faceAmountInr);
    if (faceMinor === null || faceMinor < 0) {
      throw new ValidationError(
        `Invalid scrip face value "${item.faceAmountInr}" for scrip ${item.scripNumber}.`
      );
    }
    const expiry = resolveScripExpiry({
      generatedOn: item.generatedOn,
      manualExpiresOn: item.expiresOn ?? null,
      validityRule,
    });
    return {
      scripNumber: item.scripNumber.trim().toUpperCase(),
      scheme: item.scheme,
      faceMinor,
      generatedOn: item.generatedOn,
      expiresOn: expiry.expiresOn,
      expirySource: expiry.expirySource,
      status: item.status ?? ("active" as ScripStatus),
      notes: (item.notes ?? "").trim(),
    };
  });

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const saved = await asPgliteUser(access.user.id, async (tx) => {
      const checkIec = await tx.query<{ id: string }>(
        `select id from public.iec_profiles where id = $1 and org_id = $2`,
        [params.iecId, access.orgId]
      );
      if (!checkIec.rows[0]) {
        throw new NotFoundError("IEC profile not found in this organization.");
      }

      const out: ScripSummaryItem[] = [];
      for (const row of prepared) {
        const res = await tx.query<{
          id: string;
          iec_id: string;
          scrip_number: string;
          scheme: IncentiveScheme;
          face_minor: string | number;
          generated_on: string;
          expires_on: string | null;
          expiry_source: "compliance_rule" | "manual" | "unconfirmed";
          notes: string;
          status: ScripStatus;
        }>(
          `insert into public.scrips (
             iec_id, scrip_number, scheme, face_minor, generated_on,
             expires_on, expiry_source, notes, status
           ) values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
           on conflict (iec_id, scrip_number) do update
             set scheme = excluded.scheme,
                 face_minor = excluded.face_minor,
                 generated_on = excluded.generated_on,
                 expires_on = excluded.expires_on,
                 expiry_source = excluded.expiry_source,
                 notes = excluded.notes,
                 status = excluded.status,
                 updated_at = now()
           returning id, iec_id, scrip_number, scheme, face_minor,
                     generated_on::text as generated_on,
                     expires_on::text as expires_on,
                     expiry_source, notes, status`,
          [
            params.iecId,
            row.scripNumber,
            row.scheme,
            row.faceMinor,
            row.generatedOn,
            row.expiresOn,
            row.expirySource,
            row.notes,
            row.status,
          ]
        );
        const s = res.rows[0]!;
        out.push({
          id: s.id,
          iecId: s.iec_id,
          scripNumber: s.scrip_number,
          scheme: s.scheme,
          faceMinor: Number(s.face_minor),
          generatedOn: s.generated_on,
          expiresOn: s.expires_on,
          expirySource: s.expiry_source,
          notes: s.notes,
          status: s.status,
          daysToExpiry: computeDaysToExpiry(s.expires_on, todayIst),
        });
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
         values ($1, $2, 'scrip', $3, 'upsert', $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          out[0]?.id ?? null,
          JSON.stringify({ count: out.length, numbers: out.map((o) => o.scripNumber) }),
        ]
      );

      return out;
    });

    return { scrips: saved };
  }

  const supabase = await createSupabaseServerClient();
  const { data: iec, error: iecErr } = await supabase
    .from("iec_profiles")
    .select("id")
    .eq("id", params.iecId)
    .eq("org_id", access.orgId)
    .maybeSingle();
  if (iecErr) throw iecErr;
  if (!iec) throw new NotFoundError("IEC profile not found in this organization.");

  const payload = prepared.map((row) => ({
    iec_id: params.iecId,
    scrip_number: row.scripNumber,
    scheme: row.scheme,
    face_minor: row.faceMinor,
    generated_on: row.generatedOn,
    expires_on: row.expiresOn,
    expiry_source: row.expirySource,
    notes: row.notes,
    status: row.status,
  }));

  const { data, error } = await supabase
    .from("scrips")
    .upsert(payload, { onConflict: "iec_id,scrip_number" })
    .select(
      "id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, expiry_source, notes, status"
    );
  if (error) throw error;

  const out: ScripSummaryItem[] = (data ?? []).map((s) => ({
    id: s.id,
    iecId: s.iec_id,
    scripNumber: s.scrip_number,
    scheme: s.scheme,
    faceMinor: Number(s.face_minor),
    generatedOn: s.generated_on,
    expiresOn: s.expires_on,
    expirySource: s.expiry_source,
    notes: s.notes,
    status: s.status,
    daysToExpiry: computeDaysToExpiry(s.expires_on, todayIst),
  }));

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    entity: "scrip",
    entity_id: out[0]?.id ?? null,
    action: "upsert",
    diff: { count: out.length, numbers: out.map((o) => o.scripNumber) } as Json,
  });

  return { scrips: out };
}

export async function updateScripForOrg(params: {
  orgId: string;
  scripId: string;
  status?: ScripStatus;
  expiresOn?: string | null;
  notes?: string;
}): Promise<ScripSummaryItem> {
  const access = await requireOrgAccess(params.orgId, "member");
  const todayIst = getTodayIstIsoDate();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const existing = await tx.query<{
        id: string;
        status: ScripStatus;
        expires_on: string | null;
        expiry_source: "compliance_rule" | "manual" | "unconfirmed";
        notes: string;
      }>(
        `select s.id, s.status, s.expires_on::text as expires_on, s.expiry_source, s.notes
         from public.scrips s
         join public.iec_profiles iec on iec.id = s.iec_id
         where s.id = $1 and iec.org_id = $2`,
        [params.scripId, access.orgId]
      );
      const current = existing.rows[0];
      if (!current) {
        throw new NotFoundError("Scrip not found.");
      }

      const nextStatus = params.status ?? current.status;
      const nextExpiresOn = params.expiresOn !== undefined ? params.expiresOn : current.expires_on;
      const nextExpirySource =
        params.expiresOn !== undefined
          ? params.expiresOn
            ? "manual"
            : "unconfirmed"
          : current.expiry_source;
      const nextNotes = params.notes !== undefined ? params.notes : current.notes;

      const updatedRes = await tx.query<{
        id: string;
        iec_id: string;
        scrip_number: string;
        scheme: IncentiveScheme;
        face_minor: string | number;
        generated_on: string;
        expires_on: string | null;
        expiry_source: "compliance_rule" | "manual" | "unconfirmed";
        notes: string;
        status: ScripStatus;
      }>(
        `update public.scrips
         set status = $1,
             expires_on = $2::date,
             expiry_source = $3,
             notes = $4,
             updated_at = now()
         where id = $5
         returning id, iec_id, scrip_number, scheme, face_minor,
                   generated_on::text as generated_on,
                   expires_on::text as expires_on,
                   expiry_source, notes, status`,
        [nextStatus, nextExpiresOn, nextExpirySource, nextNotes, params.scripId]
      );
      const s = updatedRes.rows[0]!;

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
         values ($1, $2, 'scrip', $3, 'update', $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          s.id,
          JSON.stringify({ status: nextStatus, expiresOn: nextExpiresOn }),
        ]
      );

      return {
        id: s.id,
        iecId: s.iec_id,
        scripNumber: s.scrip_number,
        scheme: s.scheme,
        faceMinor: Number(s.face_minor),
        generatedOn: s.generated_on,
        expiresOn: s.expires_on,
        expirySource: s.expiry_source,
        notes: s.notes,
        status: s.status,
        daysToExpiry: computeDaysToExpiry(s.expires_on, todayIst),
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: fetchErr } = await supabase
    .from("scrips")
    .select(
      "id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, expiry_source, notes, status, iec_profiles!inner(org_id)"
    )
    .eq("id", params.scripId)
    .eq("iec_profiles.org_id", access.orgId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new NotFoundError("Scrip not found.");

  const nextExpiresOn = params.expiresOn !== undefined ? params.expiresOn : current.expires_on;
  const nextExpirySource =
    params.expiresOn !== undefined
      ? params.expiresOn
        ? "manual"
        : "unconfirmed"
      : current.expiry_source;

  const { data: updated, error: updateErr } = await supabase
    .from("scrips")
    .update({
      status: params.status ?? current.status,
      expires_on: nextExpiresOn,
      expiry_source: nextExpirySource,
      notes: params.notes ?? current.notes,
    })
    .eq("id", params.scripId)
    .select(
      "id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, expiry_source, notes, status"
    )
    .single();
  if (updateErr) throw updateErr;

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    entity: "scrip",
    entity_id: updated.id,
    action: "update",
    diff: { status: updated.status, expiresOn: updated.expires_on } as Json,
  });

  return {
    id: updated.id,
    iecId: updated.iec_id,
    scripNumber: updated.scrip_number,
    scheme: updated.scheme,
    faceMinor: Number(updated.face_minor),
    generatedOn: updated.generated_on,
    expiresOn: updated.expires_on,
    expirySource: updated.expiry_source,
    notes: updated.notes,
    status: updated.status,
    daysToExpiry: computeDaysToExpiry(updated.expires_on, todayIst),
  };
}

export async function deleteScripForOrg(params: {
  orgId: string;
  scripId: string;
}): Promise<{ deletedId: string }> {
  const access = await requireOrgAccess(params.orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const existing = await tx.query<{ id: string; scrip_number: string }>(
        `select s.id, s.scrip_number
         from public.scrips s
         join public.iec_profiles iec on iec.id = s.iec_id
         where s.id = $1 and iec.org_id = $2`,
        [params.scripId, access.orgId]
      );
      if (!existing.rows[0]) throw new NotFoundError("Scrip not found.");

      await tx.query(`delete from public.scrips where id = $1`, [params.scripId]);
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, entity, entity_id, action, diff)
         values ($1, $2, 'scrip', $3, 'delete', $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          params.scripId,
          JSON.stringify({ scripNumber: existing.rows[0].scrip_number }),
        ]
      );

      return { deletedId: params.scripId };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("scrips")
    .select("id, scrip_number, iec_profiles!inner(org_id)")
    .eq("id", params.scripId)
    .eq("iec_profiles.org_id", access.orgId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new NotFoundError("Scrip not found.");

  const { error: delErr } = await supabase.from("scrips").delete().eq("id", params.scripId);
  if (delErr) throw delErr;

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    entity: "scrip",
    entity_id: params.scripId,
    action: "delete",
    diff: { scripNumber: existing.scrip_number } as Json,
  });

  return { deletedId: params.scripId };
}

export async function getIncentivesWorkspaceForOrg(params: {
  orgId: string;
  iecId?: string;
}): Promise<IncentivesWorkspaceData> {
  const access = await requireOrgAccess(params.orgId, "viewer");
  const { rates, validityRule } = await listIncentiveRates();
  const todayIst = getTodayIstIsoDate();

  let iecs: Array<{ id: string; iecCode: string; legalName: string }> = [];
  let sbs: Array<{
    id: string;
    iecId: string;
    sbNumber: string;
    sbDate: string;
    leoDate: string | null;
    currency: string;
    fobMinor: number;
    exchangeRate: string | null;
    schemesClaimed: IncentiveScheme[];
    calculationEligible: boolean;
  }> = [];
  let expectations: Array<{
    shippingBillId: string;
    scheme: IncentiveScheme;
    expectedMinor: number;
    calcDetail: IncentiveCalcDetail | null;
  }> = [];
  let credits: IncentiveCreditItem[] = [];
  let scrips: ScripSummaryItem[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const loaded = await asPgliteUser(access.user.id, async (tx) => {
      const iecRes = await tx.query<{ id: string; iec_code: string; legal_name: string }>(
        `select id, iec_code, legal_name from public.iec_profiles where org_id = $1 order by created_at asc`,
        [access.orgId]
      );
      const iecList = iecRes.rows.map((r) => ({
        id: r.id,
        iecCode: r.iec_code,
        legalName: r.legal_name,
      }));
      const selectedIec =
        (params.iecId ? iecList.find((i) => i.id === params.iecId) : undefined) ??
        iecList[0] ??
        null;

      if (!selectedIec) {
        return {
          iecList,
          selectedIec: null,
          sbList: [] as typeof sbs,
          expList: [] as typeof expectations,
          creditList: [] as typeof credits,
          scripList: [] as typeof scrips,
        };
      }

      const sbRes = await tx.query<{
        id: string;
        iec_id: string;
        sb_number: string;
        sb_date: string;
        leo_date: string | null;
        currency: string;
        fob_minor: string | number;
        exchange_rate: string | null;
        schemes_claimed: string[];
        status: ShippingBillStatus;
      }>(
        `select id, iec_id, sb_number, sb_date::text as sb_date, leo_date::text as leo_date,
                currency, fob_minor, exchange_rate::text as exchange_rate,
                schemes_claimed, status
         from public.shipping_bills
         where iec_id = $1
         order by sb_date desc, sb_number asc`,
        [selectedIec.id]
      );

      const sbList = sbRes.rows.map((r) => ({
        id: r.id,
        iecId: r.iec_id,
        sbNumber: r.sb_number,
        sbDate: r.sb_date,
        leoDate: r.leo_date,
        currency: r.currency,
        fobMinor: Number(r.fob_minor),
        exchangeRate: r.exchange_rate,
        schemesClaimed: normalizeClaimedSchemes(r.schemes_claimed),
        calculationEligible: isCalculationEligibleSb(r.status),
      }));
      const sbIds = sbList.map((s) => s.id);
      const sbNumberById = new Map(sbList.map((s) => [s.id, s.sbNumber]));

      let expList: typeof expectations = [];
      let creditList: typeof credits = [];

      if (sbIds.length > 0) {
        const expRes = await tx.query<{
          shipping_bill_id: string;
          scheme: IncentiveScheme;
          expected_minor: string | number;
          calc_detail: IncentiveCalcDetail | null;
        }>(
          `select shipping_bill_id, scheme, expected_minor, calc_detail
           from public.incentive_expectations
           where shipping_bill_id = any($1::uuid[])`,
          [sbIds]
        );
        expList = expRes.rows.map((r) => ({
          shippingBillId: r.shipping_bill_id,
          scheme: r.scheme,
          expectedMinor: Number(r.expected_minor),
          calcDetail: r.calc_detail,
        }));

        const credRes = await tx.query<{
          id: string;
          shipping_bill_id: string;
          scheme: IncentiveScheme;
          credited_minor: string | number;
          credited_on: string | null;
          scroll_number: string;
          created_at: string;
        }>(
          `select id, shipping_bill_id, scheme, credited_minor,
                  credited_on::text as credited_on, scroll_number, created_at::text as created_at
           from public.incentive_credits
           where shipping_bill_id = any($1::uuid[])
           order by credited_on desc nulls last, created_at desc`,
          [sbIds]
        );
        creditList = credRes.rows.map((r) => ({
          id: r.id,
          shippingBillId: r.shipping_bill_id,
          sbNumber: sbNumberById.get(r.shipping_bill_id) ?? "",
          scheme: r.scheme,
          creditedMinor: Number(r.credited_minor),
          creditedOn: r.credited_on,
          scrollNumber: r.scroll_number,
          createdAt: r.created_at,
        }));
      }

      const scripRes = await tx.query<{
        id: string;
        iec_id: string;
        scrip_number: string;
        scheme: IncentiveScheme;
        face_minor: string | number;
        generated_on: string;
        expires_on: string | null;
        expiry_source: "compliance_rule" | "manual" | "unconfirmed";
        notes: string;
        status: ScripStatus;
      }>(
        `select id, iec_id, scrip_number, scheme, face_minor,
                generated_on::text as generated_on,
                expires_on::text as expires_on,
                expiry_source, notes, status
         from public.scrips
         where iec_id = $1
         order by expires_on asc nulls last, generated_on desc`,
        [selectedIec.id]
      );
      const scripList: ScripSummaryItem[] = scripRes.rows.map((s) => ({
        id: s.id,
        iecId: s.iec_id,
        scripNumber: s.scrip_number,
        scheme: s.scheme,
        faceMinor: Number(s.face_minor),
        generatedOn: s.generated_on,
        expiresOn: s.expires_on,
        expirySource: s.expiry_source,
        notes: s.notes,
        status: s.status,
        daysToExpiry: computeDaysToExpiry(s.expires_on, todayIst),
      }));

      return {
        iecList,
        selectedIec,
        sbList,
        expList,
        creditList,
        scripList,
      };
    });

    iecs = loaded.iecList;
    sbs = loaded.sbList;
    expectations = loaded.expList;
    credits = loaded.creditList;
    scrips = loaded.scripList;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: iecRows, error: iecErr } = await supabase
      .from("iec_profiles")
      .select("id, iec_code, legal_name")
      .eq("org_id", access.orgId)
      .order("created_at", { ascending: true });
    if (iecErr) throw iecErr;

    iecs = (iecRows ?? []).map((r) => ({
      id: r.id,
      iecCode: r.iec_code,
      legalName: r.legal_name,
    }));
    const activeIec =
      (params.iecId ? iecs.find((i) => i.id === params.iecId) : undefined) ?? iecs[0];

    if (activeIec) {
      const { data: sbRows, error: sbErr } = await supabase
        .from("shipping_bills")
        .select(
          "id, iec_id, sb_number, sb_date, leo_date, currency, fob_minor, exchange_rate, schemes_claimed, status"
        )
        .eq("iec_id", activeIec.id)
        .order("sb_date", { ascending: false })
        .order("sb_number", { ascending: true });
      if (sbErr) throw sbErr;

      sbs = (sbRows ?? []).map((r) => ({
        id: r.id,
        iecId: r.iec_id,
        sbNumber: r.sb_number,
        sbDate: r.sb_date,
        leoDate: r.leo_date,
        currency: r.currency,
        fobMinor: Number(r.fob_minor),
        exchangeRate: r.exchange_rate !== null ? String(r.exchange_rate) : null,
        schemesClaimed: normalizeClaimedSchemes(r.schemes_claimed),
        calculationEligible: isCalculationEligibleSb(r.status),
      }));
      const sbIds = sbs.map((s) => s.id);
      const sbNumberById = new Map(sbs.map((s) => [s.id, s.sbNumber]));

      if (sbIds.length > 0) {
        const [{ data: expRows, error: expErr }, { data: credRows, error: credErr }] =
          await Promise.all([
            supabase
              .from("incentive_expectations")
              .select("shipping_bill_id, scheme, expected_minor, calc_detail")
              .in("shipping_bill_id", sbIds),
            supabase
              .from("incentive_credits")
              .select(
                "id, shipping_bill_id, scheme, credited_minor, credited_on, scroll_number, created_at"
              )
              .in("shipping_bill_id", sbIds)
              .order("credited_on", { ascending: false }),
          ]);
        if (expErr) throw expErr;
        if (credErr) throw credErr;

        expectations = (expRows ?? []).map((r) => ({
          shippingBillId: r.shipping_bill_id,
          scheme: r.scheme,
          expectedMinor: Number(r.expected_minor),
          calcDetail: (r.calc_detail as unknown as IncentiveCalcDetail | null) ?? null,
        }));
        credits = (credRows ?? []).map((r) => ({
          id: r.id,
          shippingBillId: r.shipping_bill_id,
          sbNumber: sbNumberById.get(r.shipping_bill_id) ?? "",
          scheme: r.scheme,
          creditedMinor: Number(r.credited_minor),
          creditedOn: r.credited_on,
          scrollNumber: r.scroll_number,
          createdAt: r.created_at,
        }));
      }

      const { data: scripRows, error: scripErr } = await supabase
        .from("scrips")
        .select(
          "id, iec_id, scrip_number, scheme, face_minor, generated_on, expires_on, expiry_source, notes, status"
        )
        .eq("iec_id", activeIec.id)
        .order("expires_on", { ascending: true });
      if (scripErr) throw scripErr;

      scrips = (scripRows ?? []).map((s) => ({
        id: s.id,
        iecId: s.iec_id,
        scripNumber: s.scrip_number,
        scheme: s.scheme,
        faceMinor: Number(s.face_minor),
        generatedOn: s.generated_on,
        expiresOn: s.expires_on,
        expirySource: s.expiry_source,
        notes: s.notes,
        status: s.status,
        daysToExpiry: computeDaysToExpiry(s.expires_on, todayIst),
      }));
    }
  }

  const activeIec =
    (params.iecId ? iecs.find((i) => i.id === params.iecId) : undefined) ?? iecs[0] ?? null;

  const expByKey = new Map<string, (typeof expectations)[number]>();
  for (const exp of expectations) {
    expByKey.set(`${exp.shippingBillId}:${exp.scheme}`, exp);
  }

  const creditAggByKey = new Map<
    string,
    { totalMinor: number; latestCreditedOn: string | null; latestScrollNumber: string }
  >();
  for (const credit of credits) {
    const key = `${credit.shippingBillId}:${credit.scheme}`;
    const existing = creditAggByKey.get(key);
    if (!existing) {
      creditAggByKey.set(key, {
        totalMinor: credit.creditedMinor,
        latestCreditedOn: credit.creditedOn,
        latestScrollNumber: credit.scrollNumber,
      });
    } else {
      existing.totalMinor += credit.creditedMinor;
      if (!existing.latestCreditedOn && credit.creditedOn) {
        existing.latestCreditedOn = credit.creditedOn;
      }
      if (!existing.latestScrollNumber && credit.scrollNumber) {
        existing.latestScrollNumber = credit.scrollNumber;
      }
    }
  }

  const rows: IncentiveComparisonRow[] = [];
  for (const sb of sbs) {
    const schemesToShow = new Set<IncentiveScheme>(sb.schemesClaimed);
    for (const exp of expectations) {
      if (exp.shippingBillId === sb.id) schemesToShow.add(exp.scheme);
    }
    for (const credit of credits) {
      if (credit.shippingBillId === sb.id) schemesToShow.add(credit.scheme);
    }
    if (schemesToShow.size === 0) {
      schemesToShow.add("rodtep");
    }

    for (const scheme of schemesToShow) {
      const key = `${sb.id}:${scheme}`;
      const exp = expByKey.get(key);
      const cred = creditAggByKey.get(key);
      const claimedOnSb = sb.schemesClaimed.includes(scheme);
      const expectedMinor = exp ? exp.expectedMinor : 0;
      const creditedMinor = cred ? cred.totalMinor : 0;
      const hasUnknownRate = exp ? Boolean(exp.calcDetail?.hasUnknownRate) : claimedOnSb;

      const status = deriveIncentiveComparisonStatus({
        claimedOnSb,
        calculationEligible: sb.calculationEligible,
        hasUnknownRate,
        expectedMinor,
        creditedMinor,
      });

      const gapMinor = Math.max(0, expectedMinor - creditedMinor);

      rows.push({
        shippingBillId: sb.id,
        iecId: sb.iecId,
        sbNumber: sb.sbNumber,
        sbDate: sb.sbDate,
        leoDate: sb.leoDate,
        currency: sb.currency,
        fobMinor: sb.fobMinor,
        exchangeRate: sb.exchangeRate,
        calculationEligible: sb.calculationEligible,
        scheme,
        claimedOnSb,
        expectedMinor,
        creditedMinor,
        gapMinor,
        status,
        hasExpectationRecord: Boolean(exp),
        calcDetail: exp?.calcDetail ?? null,
        creditedOn: cred?.latestCreditedOn ?? null,
        scrollNumber: cred?.latestScrollNumber ?? "",
      });
    }
  }

  const expectedTotalInrMinor = rows.reduce((sum, r) => sum + r.expectedMinor, 0);
  const creditedTotalInrMinor = rows.reduce((sum, r) => sum + r.creditedMinor, 0);
  const gapTotalInrMinor = rows.reduce((sum, r) => sum + r.gapMinor, 0);
  const shortOrMissingCount = rows.filter(
    (r) => r.status === "short" || r.status === "missing"
  ).length;
  const unclaimedCount = rows.filter((r) => r.status === "not_claimed").length;
  const unknownRateCount = rows.filter((r) => r.status === "unknown_rate").length;

  const nextToExpireScrips = scrips
    .filter((s) => s.status === "active" && s.expiresOn !== null)
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));

  return {
    activeIec,
    iecs,
    summary: {
      expectedTotalInrMinor,
      creditedTotalInrMinor,
      gapTotalInrMinor,
      shortOrMissingCount,
      unclaimedCount,
      unknownRateCount,
      nextToExpireCount: nextToExpireScrips.length,
    },
    rows,
    credits,
    scrips,
    nextToExpireScrips,
    rates,
    validityRule,
    isPlatformAdmin: Boolean(access.user.isPlatformAdmin),
  };
}
