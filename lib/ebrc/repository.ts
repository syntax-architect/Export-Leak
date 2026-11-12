import {
  EBRC_DEFAULT_BRANCH_SL_NO,
  EBRC_TEMPLATE_LAST_VERIFIED_ON,
  EBRC_TEMPLATE_VERSION,
} from "@/config/ebrc";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { assertCanGenerateEbrc, getOrgUsageSummary } from "@/lib/billing/entitlements";
import { buildBulkEbrcWorkbook } from "@/lib/ebrc/generator";
import {
  autoFixBulkEbrcRows,
  formatIsoDateToDgft,
  formatMinorUnitsForExcel,
  validateBulkEbrcRows,
  type BulkEbrcRowInput,
  type BulkEbrcValidationSummary,
} from "@/lib/ebrc/validator";
import type { Json } from "@/lib/database.types";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface RawIecRow {
  id: string;
  org_id: string;
  iec_code: string;
  legal_name: string;
  ad_bank_name: string | null;
  is_demo: boolean;
}

interface RawRemittanceRow {
  id: string;
  iec_id: string;
  irm_number: string;
  bank_name: string | null;
  remittance_date: string;
  currency: string;
  amount_minor: number;
  utilised_minor: number;
  raw: Record<string, unknown> | null;
}

interface RawShippingBillRow {
  id: string;
  iec_id: string;
  sb_number: string;
  sb_date: string;
  port_code: string | null;
  currency: string;
  fob_minor: number;
  buyer_name: string | null;
  status: string;
}

interface RawMatchRow {
  id: string;
  shipping_bill_id: string;
  remittance_id: string;
  matched_minor: number;
  confirmed_by: string | null;
  created_at: string;
}

export interface EbrcIecOption {
  id: string;
  iecCode: string;
  legalName: string;
  isDemo: boolean;
}

export interface EbrcIrmOption {
  id: string;
  iecId: string;
  irmNumber: string;
  remittanceDate: string;
  currency: string;
  amountMinor: number;
  utilisedMinor: number;
  remainingMinor: number;
  matchedRowCount: number;
}

export interface EbrcWorkspaceData {
  orgId: string;
  planKey: string;
  planDisplayName: string;
  canGenerateEbrc: boolean;
  templateVersion: string;
  templateLastVerifiedOn: string;
  iecs: EbrcIecOption[];
  selectedIecId: string | null;
  irms: EbrcIrmOption[];
  rows: BulkEbrcRowInput[];
  validation: BulkEbrcValidationSummary;
  irmBalanceCapMinorByNumber: Record<string, number>;
}

function readRawString(raw: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!raw || typeof raw !== "object") return "";
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  const sourceRow =
    raw.sourceRow && typeof raw.sourceRow === "object"
      ? (raw.sourceRow as Record<string, unknown>)
      : null;
  if (sourceRow) {
    for (const key of keys) {
      const val = sourceRow[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
  }
  return "";
}

async function fetchOrgEbrcRecords(params: {
  orgId: string;
  userId: string;
  iecId?: string | null;
}): Promise<{
  iecs: RawIecRow[];
  remittances: RawRemittanceRow[];
  shippingBills: RawShippingBillRow[];
  matches: RawMatchRow[];
}> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      const iecRes = await tx.query<RawIecRow>(
        `select id, org_id, iec_code, legal_name, ad_bank_name, is_demo
         from public.iec_profiles
         where org_id = $1
         order by is_demo asc, created_at asc`,
        [params.orgId]
      );
      const iecs = iecRes.rows;
      if (params.iecId && !iecs.some((i) => i.id === params.iecId)) {
        throw new NotFoundError("IEC profile not found for this organization.");
      }

      const [remRes, sbRes, matchRes] = await Promise.all([
        tx.query<RawRemittanceRow>(
          `select r.id, r.iec_id, r.irm_number, r.bank_name, r.remittance_date::text,
                  r.currency, r.amount_minor::bigint::int as amount_minor,
                  r.utilised_minor::bigint::int as utilised_minor, r.raw
           from public.remittances r
           join public.iec_profiles p on p.id = r.iec_id
           where p.org_id = $1
           order by r.remittance_date desc, r.irm_number asc`,
          [params.orgId]
        ),
        tx.query<RawShippingBillRow>(
          `select sb.id, sb.iec_id, sb.sb_number, sb.sb_date::text, sb.port_code,
                  sb.currency, sb.fob_minor::bigint::int as fob_minor, sb.buyer_name, sb.status
           from public.shipping_bills sb
           join public.iec_profiles p on p.id = sb.iec_id
           where p.org_id = $1
           order by sb.sb_date desc, sb.sb_number asc`,
          [params.orgId]
        ),
        tx.query<RawMatchRow>(
          `select m.id, m.shipping_bill_id, m.remittance_id,
                  m.matched_minor::bigint::int as matched_minor,
                  m.confirmed_by::text, m.created_at::text
           from public.sb_remittance_matches m
           join public.shipping_bills sb on sb.id = m.shipping_bill_id
           join public.iec_profiles p on p.id = sb.iec_id
           where p.org_id = $1 and m.confirmed_by is not null
           order by m.created_at asc`,
          [params.orgId]
        ),
      ]);

      return {
        iecs,
        remittances: remRes.rows,
        shippingBills: sbRes.rows,
        matches: matchRes.rows,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const [
    { data: iecRows, error: iecErr },
    { data: remRows, error: remErr },
    { data: sbRows, error: sbErr },
    { data: matchRows, error: matchErr },
  ] = await Promise.all([
    supabase
      .from("iec_profiles")
      .select("id, org_id, iec_code, legal_name, ad_bank_name, is_demo")
      .eq("org_id", params.orgId)
      .order("is_demo", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("remittances")
      .select(
        "id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor, utilised_minor, raw, iec_profiles!inner(org_id)"
      )
      .eq("iec_profiles.org_id", params.orgId)
      .order("remittance_date", { ascending: false }),
    supabase
      .from("shipping_bills")
      .select(
        "id, iec_id, sb_number, sb_date, port_code, currency, fob_minor, buyer_name, status, iec_profiles!inner(org_id)"
      )
      .eq("iec_profiles.org_id", params.orgId)
      .order("sb_date", { ascending: false }),
    supabase
      .from("sb_remittance_matches")
      .select(
        "id, shipping_bill_id, remittance_id, matched_minor, confirmed_by, created_at, shipping_bills!inner(iec_profiles!inner(org_id))"
      )
      .eq("shipping_bills.iec_profiles.org_id", params.orgId)
      .not("confirmed_by", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  if (iecErr) throw iecErr;
  if (remErr) throw remErr;
  if (sbErr) throw sbErr;
  if (matchErr) throw matchErr;

  const iecs = (iecRows ?? []) as RawIecRow[];
  if (params.iecId && !iecs.some((i) => i.id === params.iecId)) {
    throw new NotFoundError("IEC profile not found for this organization.");
  }

  return {
    iecs,
    remittances: (remRows ?? []) as unknown as RawRemittanceRow[],
    shippingBills: (sbRows ?? []) as unknown as RawShippingBillRow[],
    matches: (matchRows ?? []) as unknown as RawMatchRow[],
  };
}

function buildIrmBalanceCaps(params: {
  remittances: readonly RawRemittanceRow[];
  matches: readonly RawMatchRow[];
  includedMatchIds?: Set<string>;
}): Record<string, number> {
  const otherAllocatedByRemId = new Map<string, number>();
  for (const m of params.matches) {
    if (params.includedMatchIds && params.includedMatchIds.has(m.id)) {
      continue;
    }
    otherAllocatedByRemId.set(
      m.remittance_id,
      (otherAllocatedByRemId.get(m.remittance_id) ?? 0) + Math.max(0, Number(m.matched_minor ?? 0))
    );
  }

  const caps: Record<string, number> = {};
  for (const rem of params.remittances) {
    const total = Math.max(0, Number(rem.amount_minor ?? 0));
    const otherUsed = otherAllocatedByRemId.get(rem.id) ?? 0;
    caps[rem.irm_number] = Math.max(0, total - otherUsed);
  }
  return caps;
}

export async function getEbrcWorkspaceData(params: {
  orgId: string;
  iecId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  irmIds?: readonly string[];
}): Promise<EbrcWorkspaceData> {
  const access = await requireOrgAccess(params.orgId, "viewer");
  const [usage, records] = await Promise.all([
    getOrgUsageSummary(access.orgId, access.user.id),
    fetchOrgEbrcRecords({
      orgId: access.orgId,
      userId: access.user.id,
      iecId: params.iecId,
    }),
  ]);

  const { getPlanConfig } = await import("@/config/plans");
  const canGenerateEbrc = getPlanConfig(usage.planKey).entitlements.canGenerateEbrc;

  const selectedIecId =
    params.iecId ?? records.iecs.find((i) => !i.is_demo)?.id ?? records.iecs[0]?.id ?? null;

  const iecMap = new Map(records.iecs.map((i) => [i.id, i]));
  const sbMap = new Map(records.shippingBills.map((sb) => [sb.id, sb]));
  const remMap = new Map(records.remittances.map((r) => [r.id, r]));
  const selectedIrmSet = params.irmIds && params.irmIds.length > 0 ? new Set(params.irmIds) : null;

  // Build IRM selector options scoped to selected IEC (or all org IECs if none selected)
  const confirmedCountByRemId = new Map<string, number>();
  for (const m of records.matches) {
    confirmedCountByRemId.set(
      m.remittance_id,
      (confirmedCountByRemId.get(m.remittance_id) ?? 0) + 1
    );
  }

  const scopedRemittances = records.remittances.filter(
    (r) => !selectedIecId || r.iec_id === selectedIecId
  );

  const irmOptions: EbrcIrmOption[] = scopedRemittances.map((r) => ({
    id: r.id,
    iecId: r.iec_id,
    irmNumber: r.irm_number,
    remittanceDate: r.remittance_date,
    currency: r.currency,
    amountMinor: Number(r.amount_minor ?? 0),
    utilisedMinor: Number(r.utilised_minor ?? 0),
    remainingMinor: Math.max(0, Number(r.amount_minor ?? 0) - Number(r.utilised_minor ?? 0)),
    matchedRowCount: confirmedCountByRemId.get(r.id) ?? 0,
  }));

  const filteredMatches = records.matches.filter((m) => {
    const sb = sbMap.get(m.shipping_bill_id);
    const rem = remMap.get(m.remittance_id);
    if (!sb || !rem) return false;
    if (sb.iec_id !== rem.iec_id) return false;
    if (selectedIecId && sb.iec_id !== selectedIecId) return false;
    if (selectedIrmSet && !selectedIrmSet.has(rem.id)) return false;
    if (params.dateFrom && rem.remittance_date < params.dateFrom) return false;
    if (params.dateTo && rem.remittance_date > params.dateTo) return false;
    return true;
  });

  const includedMatchIds = new Set(filteredMatches.map((m) => m.id));
  const irmBalanceCapMinorByNumber = buildIrmBalanceCaps({
    remittances: scopedRemittances,
    matches: records.matches,
    includedMatchIds,
  });

  const rows: BulkEbrcRowInput[] = filteredMatches.map((m, idx) => {
    const sb = sbMap.get(m.shipping_bill_id)!;
    const rem = remMap.get(m.remittance_id)!;
    const iec = iecMap.get(sb.iec_id);
    const isDemo = Boolean(iec?.is_demo);

    const ifscFromRaw = readRawString(rem.raw, ["ifscCode", "ifsc", "IFSC Code", "IFSC"]);
    const adFromRaw = readRawString(rem.raw, ["adCode", "ad_code", "AD Code"]);
    const purposeFromRaw = readRawString(rem.raw, [
      "purposeCode",
      "purpose_code",
      "Purpose Code",
      "Purpose",
    ]);
    const branchFromRaw = readRawString(rem.raw, [
      "branchSlNo",
      "iecBranchSlNo",
      "IEC Branch Sl. No.",
    ]);

    const minor = Math.max(0, Number(m.matched_minor ?? 0));

    return {
      rowId: m.id,
      matchId: m.id,
      shippingBillId: sb.id,
      remittanceId: rem.id,
      serialNumber: idx + 1,
      iecBranchSlNo: branchFromRaw || EBRC_DEFAULT_BRANCH_SL_NO,
      ifscCode: ifscFromRaw || (isDemo ? "HDFC0000240" : ""),
      adCode: adFromRaw || (isDemo ? "0510002" : ""),
      irmNumber: rem.irm_number,
      irmDate: formatIsoDateToDgft(rem.remittance_date),
      irmCurrency: rem.currency.toUpperCase(),
      purposeCode: purposeFromRaw || (isDemo ? "P0102" : ""),
      amountMinor: minor,
      amountInFcc: formatMinorUnitsForExcel(minor),
      portCode: (sb.port_code ?? "").toUpperCase(),
      shippingBillNumber: sb.sb_number,
      shippingBillDate: formatIsoDateToDgft(sb.sb_date),
      expectedCurrency: rem.currency.toUpperCase(),
      irmAvailableMinor: irmBalanceCapMinorByNumber[rem.irm_number],
    };
  });

  const validation = validateBulkEbrcRows(rows, { irmBalanceCapMinorByNumber });

  return {
    orgId: access.orgId,
    planKey: usage.planKey,
    planDisplayName: usage.planDisplayName,
    canGenerateEbrc,
    templateVersion: EBRC_TEMPLATE_VERSION,
    templateLastVerifiedOn: EBRC_TEMPLATE_LAST_VERIFIED_ON,
    iecs: records.iecs.map((i) => ({
      id: i.id,
      iecCode: i.iec_code,
      legalName: i.legal_name,
      isDemo: i.is_demo,
    })),
    selectedIecId,
    irms: irmOptions,
    rows,
    validation,
    irmBalanceCapMinorByNumber,
  };
}

export async function validateOrFixOrgEbrcRows(params: {
  orgId: string;
  iecId?: string | null;
  rows: readonly BulkEbrcRowInput[];
  applyAutoFix: boolean;
}): Promise<{
  rows: BulkEbrcRowInput[];
  fixesApplied: number;
  validation: BulkEbrcValidationSummary;
}> {
  const access = await requireOrgAccess(params.orgId, "member");
  const records = await fetchOrgEbrcRecords({
    orgId: access.orgId,
    userId: access.user.id,
    iecId: params.iecId,
  });

  const sbMap = new Map(records.shippingBills.map((sb) => [sb.id, sb]));
  const remMap = new Map(records.remittances.map((r) => [r.id, r]));
  const includedMatchIds = new Set(
    params.rows.map((r) => r.matchId).filter((v): v is string => typeof v === "string")
  );
  const irmBalanceCapMinorByNumber = buildIrmBalanceCaps({
    remittances: records.remittances,
    matches: records.matches,
    includedMatchIds,
  });

  // Preserve expectedCurrency and server cap strictly from org DB records
  const anchoredRows: BulkEbrcRowInput[] = params.rows.map((row) => {
    const rem = row.remittanceId ? remMap.get(row.remittanceId) : undefined;
    const sb = row.shippingBillId ? sbMap.get(row.shippingBillId) : undefined;
    return {
      ...row,
      expectedCurrency: rem?.currency ?? sb?.currency ?? row.expectedCurrency,
      irmAvailableMinor: rem ? irmBalanceCapMinorByNumber[rem.irm_number] : row.irmAvailableMinor,
    };
  });

  const fixResult = params.applyAutoFix
    ? autoFixBulkEbrcRows(anchoredRows)
    : { rows: [...anchoredRows], fixesApplied: 0 };

  const validation = validateBulkEbrcRows(fixResult.rows, { irmBalanceCapMinorByNumber });

  return {
    rows: fixResult.rows,
    fixesApplied: fixResult.fixesApplied,
    validation,
  };
}

async function recordEbrcAuditLog(params: {
  orgId: string;
  actorId: string;
  diff: Record<string, unknown>;
}) {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(params.actorId, async (tx) => {
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'generate_bulk_ebrc', 'ebrc_export', null, $3::jsonb)`,
        [params.orgId, params.actorId, JSON.stringify(params.diff)]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("audit_log").insert({
    org_id: params.orgId,
    actor_id: params.actorId,
    action: "generate_bulk_ebrc",
    entity: "ebrc_export",
    entity_id: null,
    diff: params.diff as unknown as Json,
  });
}

export async function generateBulkEbrcExportForOrg(params: {
  orgId: string;
  iecId?: string | null;
  rows: readonly BulkEbrcRowInput[];
}): Promise<{
  buffer: Buffer;
  filename: string;
  rowCount: number;
  templateVersion: string;
  validation: BulkEbrcValidationSummary;
}> {
  const access = await requireOrgAccess(params.orgId, "member");
  await assertCanGenerateEbrc(access.orgId, access.user.id);

  const records = await fetchOrgEbrcRecords({
    orgId: access.orgId,
    userId: access.user.id,
    iecId: params.iecId,
  });

  const matchMap = new Map(records.matches.map((m) => [m.id, m]));
  const sbMap = new Map(records.shippingBills.map((sb) => [sb.id, sb]));
  const remMap = new Map(records.remittances.map((r) => [r.id, r]));
  const remByNumber = new Map(records.remittances.map((r) => [r.irm_number, r]));
  const sbByNumber = new Map(records.shippingBills.map((sb) => [sb.sb_number.toUpperCase(), sb]));

  // Verify every submitted row belongs strictly to this org (and selected IEC when specified)
  const scopedRows: BulkEbrcRowInput[] = params.rows.map((row) => {
    if (row.matchId) {
      const match = matchMap.get(row.matchId);
      if (!match) {
        throw new ForbiddenError(
          "One or more selected matches do not belong to your organization."
        );
      }
      const sb = sbMap.get(match.shipping_bill_id);
      const rem = remMap.get(match.remittance_id);
      if (
        !sb ||
        !rem ||
        (params.iecId && (sb.iec_id !== params.iecId || rem.iec_id !== params.iecId))
      ) {
        throw new ForbiddenError("Cross-IEC data is not permitted in a single eBRC export.");
      }
      return {
        ...row,
        expectedCurrency: rem.currency.toUpperCase(),
      };
    }

    if (row.shippingBillId && !sbMap.has(row.shippingBillId)) {
      throw new ForbiddenError("Shipping Bill does not belong to this organization.");
    }
    if (row.remittanceId && !remMap.has(row.remittanceId)) {
      throw new ForbiddenError("Remittance does not belong to this organization.");
    }

    const dbRem = row.remittanceId
      ? remMap.get(row.remittanceId)
      : remByNumber.get(row.irmNumber.trim());
    const dbSb = row.shippingBillId
      ? sbMap.get(row.shippingBillId)
      : sbByNumber.get(row.shippingBillNumber.trim().toUpperCase());

    if (!dbRem || !dbSb) {
      throw new ForbiddenError(
        `Row "${row.irmNumber} / ${row.shippingBillNumber}" is not linked to an IRM and Shipping Bill in this organization.`
      );
    }

    if (
      dbRem.iec_id !== dbSb.iec_id ||
      (params.iecId && (dbRem.iec_id !== params.iecId || dbSb.iec_id !== params.iecId))
    ) {
      throw new ForbiddenError("Cross-IEC data is not permitted in a single eBRC export.");
    }

    return {
      ...row,
      shippingBillId: dbSb.id,
      remittanceId: dbRem.id,
      expectedCurrency: dbRem.currency.toUpperCase(),
    };
  });

  const includedMatchIds = new Set(
    scopedRows.map((r) => r.matchId).filter((v): v is string => typeof v === "string")
  );
  const irmBalanceCapMinorByNumber = buildIrmBalanceCaps({
    remittances: records.remittances.filter((r) => !params.iecId || r.iec_id === params.iecId),
    matches: records.matches,
    includedMatchIds,
  });

  const validation = validateBulkEbrcRows(scopedRows, { irmBalanceCapMinorByNumber });
  if (!validation.valid) {
    throw new ValidationError(
      validation.errors[0]?.message ?? "Please fix validation errors before downloading."
    );
  }

  const built = await buildBulkEbrcWorkbook(scopedRows);
  const selectedIec = params.iecId ? records.iecs.find((i) => i.id === params.iecId) : undefined;
  const codeSlug = selectedIec?.iec_code ?? "ORG";
  const todaySlug = new Date().toISOString().slice(0, 10);
  const filename = `dgft-bulk-ebrc-${codeSlug}-${todaySlug}.xlsx`;

  await recordEbrcAuditLog({
    orgId: access.orgId,
    actorId: access.user.id,
    diff: {
      iecId: params.iecId ?? null,
      iecCode: selectedIec?.iec_code ?? null,
      rowCount: built.rowCount,
      templateVersion: built.templateVersion,
      totalAmountByCurrency: validation.totalAmountByCurrency,
    },
  });

  return {
    buffer: built.buffer,
    filename,
    rowCount: built.rowCount,
    templateVersion: built.templateVersion,
    validation,
  };
}
