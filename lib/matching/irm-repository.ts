import crypto from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import type { Json, MatchMethod, ShippingBillStatus } from "@/lib/database.types";
import { parseDecimalMoneyToMinorUnits } from "@/lib/documents/parsing/types";
import { readStorageObjectBytes } from "@/lib/documents/storage";
import { buildIrmImportPreview, parseIrmSheetForImport } from "@/lib/matching/irm-importer";
import { runMatchingEngine } from "@/lib/matching/matching-engine";
import {
  DEFAULT_MATCHING_CONFIG,
  type IrmColumnMapping,
  type IrmImportPreview,
  type IrmRowError,
  type MatchCandidate,
  type MatchingRemittanceInput,
  type MatchingShippingBillInput,
} from "@/lib/matching/types";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface IrmImportCommitResult {
  batchId: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  failedRows: IrmRowError[];
  autoConfirmedCount: number;
  reviewNeededCount: number;
}

export interface WorkspaceShippingBillRow {
  id: string;
  iecId: string;
  iecCode: string;
  sbNumber: string;
  sbDate: string;
  portCode: string;
  invoiceNo: string;
  buyerName: string;
  currency: string;
  fobMinor: number;
  matchedMinor: number;
  remainingMinor: number;
  status: ShippingBillStatus;
  calculationEligible: boolean;
}

export interface WorkspaceRemittanceRow {
  id: string;
  iecId: string;
  irmNumber: string;
  bankName: string;
  remittanceDate: string;
  currency: string;
  amountMinor: number;
  utilisedMinor: number;
  remainingMinor: number;
  remitterName: string;
  invoiceReference: string;
}

export interface ConfirmedMatchView {
  id: string;
  shippingBillId: string;
  remittanceId: string;
  sbNumber: string;
  invoiceNo: string;
  irmNumber: string;
  bankName: string;
  currency: string;
  matchedMinor: number;
  method: MatchMethod;
  confidence: number;
  explanation: string;
  createdAt: string;
}

export interface IrmImportBatchView {
  id: string;
  iecId: string;
  filename: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  autoConfirmedCount: number;
  reviewNeededCount: number;
  failedRows: IrmRowError[];
  createdAt: string;
}

export interface ReconciliationWorkspaceData {
  orgId: string;
  iecId: string | null;
  shippingBills: WorkspaceShippingBillRow[];
  remittances: WorkspaceRemittanceRow[];
  confirmedMatches: ConfirmedMatchView[];
  suggestions: MatchCandidate[];
  importBatches: IrmImportBatchView[];
}

export interface ConfirmMatchPairRequest {
  shippingBillId: string;
  remittanceId: string;
  allocatedMinor?: number;
  allocatedAmount?: string;
  method: MatchMethod;
  confidence: number;
  explanation: string;
}

function resolveAllocatedMinor(pair: ConfirmMatchPairRequest): number {
  if (pair.allocatedMinor !== undefined) {
    if (!Number.isInteger(pair.allocatedMinor) || pair.allocatedMinor <= 0) {
      throw new ValidationError("Allocated amount must be a positive integer in minor units.");
    }
    return pair.allocatedMinor;
  }
  if (pair.allocatedAmount !== undefined) {
    const parsed = parseDecimalMoneyToMinorUnits(pair.allocatedAmount);
    if (parsed === null || parsed <= 0) {
      throw new ValidationError("Allocated amount must be a valid positive decimal.");
    }
    return parsed;
  }
  throw new ValidationError("Allocation amount is required.");
}

function isCalculationEligibleSb(status: ShippingBillStatus): boolean {
  return status !== "needs_review" && status !== "queued";
}

function computeNextSbStatus(params: {
  currentStatus: ShippingBillStatus;
  fobMinor: number;
  matchedMinor: number;
  explanation?: string;
}): ShippingBillStatus {
  if (params.currentStatus === "needs_review" || params.currentStatus === "queued") {
    return params.currentStatus;
  }
  if (params.matchedMinor <= 0) {
    return "parsed";
  }
  if (params.matchedMinor >= params.fobMinor) {
    return "matched";
  }
  const diff = params.fobMinor - params.matchedMinor;
  const chargeLimit = Math.min(
    DEFAULT_MATCHING_CONFIG.bankChargeMaxMinor,
    Math.max(
      25_00,
      Math.round((params.fobMinor * DEFAULT_MATCHING_CONFIG.bankChargeToleranceBps) / 10000)
    )
  );
  if (diff <= chargeLimit && params.explanation && /bank charges/i.test(params.explanation)) {
    return "matched";
  }
  return "partially_matched";
}

async function resolveOrgIec(params: {
  orgId: string;
  iecId?: string | null;
  userId: string;
}): Promise<{ iecId: string; iecCode: string } | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      if (params.iecId) {
        const res = await tx.query<{ id: string; iec_code: string }>(
          `select id, iec_code from public.iec_profiles where id = $1 and org_id = $2 limit 1`,
          [params.iecId, params.orgId]
        );
        const row = res.rows[0];
        if (!row) throw new NotFoundError("IEC profile not found in this organization.");
        return { iecId: row.id, iecCode: row.iec_code };
      }

      const fallback = await tx.query<{ id: string; iec_code: string }>(
        `select id, iec_code from public.iec_profiles where org_id = $1 order by created_at asc limit 1`,
        [params.orgId]
      );
      const row = fallback.rows[0];
      return row ? { iecId: row.id, iecCode: row.iec_code } : null;
    });
  }

  const supabase = await createSupabaseServerClient();
  if (params.iecId) {
    const { data, error } = await supabase
      .from("iec_profiles")
      .select("id, iec_code")
      .eq("id", params.iecId)
      .eq("org_id", params.orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError("IEC profile not found in this organization.");
    return { iecId: data.id, iecCode: data.iec_code };
  }

  const { data, error } = await supabase
    .from("iec_profiles")
    .select("id, iec_code")
    .eq("org_id", params.orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { iecId: data.id, iecCode: data.iec_code } : null;
}

export async function loadStoredDocumentForIrmPreview(params: {
  orgId: string;
  docId: string;
}): Promise<{ filename: string; bytes: Uint8Array; iecId: string }> {
  const access = await requireOrgAccess(params.orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const doc = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        iec_id: string;
        original_name: string;
        storage_path: string;
      }>(
        `select d.id, d.iec_id, d.original_name, d.storage_path
         from public.documents d
         join public.iec_profiles p on p.id = d.iec_id
         where d.id = $1 and p.org_id = $2 and d.deleted_at is null
         limit 1`,
        [params.docId, access.orgId]
      );
      return res.rows[0] ?? null;
    });

    if (!doc) throw new NotFoundError("Document not found.");
    const buf = await readStorageObjectBytes(doc.storage_path);
    return { filename: doc.original_name, bytes: new Uint8Array(buf), iecId: doc.iec_id };
  }

  const supabase = await createSupabaseServerClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, iec_id, original_name, storage_path, iec_profiles!inner(org_id)")
    .eq("id", params.docId)
    .eq("iec_profiles.org_id", access.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!doc) throw new NotFoundError("Document not found.");

  const buf = await readStorageObjectBytes(doc.storage_path);
  return { filename: doc.original_name, bytes: new Uint8Array(buf), iecId: doc.iec_id };
}

export async function previewIrmImportForOrg(params: {
  orgId: string;
  filename: string;
  bytes: Uint8Array;
  overrideMapping?: Partial<IrmColumnMapping>;
}): Promise<IrmImportPreview> {
  await requireOrgAccess(params.orgId, "member");
  return buildIrmImportPreview({
    filename: params.filename,
    bytes: params.bytes,
    overrideMapping: params.overrideMapping,
  });
}

async function applyConfirmedMatchesTxPglite(params: {
  tx: { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
  orgId: string;
  actorUserId: string;
  pairs: readonly ConfirmMatchPairRequest[];
}): Promise<number> {
  let insertedCount = 0;

  for (const pair of params.pairs) {
    const allocatedMinor = resolveAllocatedMinor(pair);

    const sbRes = await params.tx.query<{
      id: string;
      iec_id: string;
      sb_number: string;
      currency: string;
      fob_minor: string;
      status: ShippingBillStatus;
    }>(
      `select sb.id, sb.iec_id, sb.sb_number, sb.currency, sb.fob_minor::text, sb.status
       from public.shipping_bills sb
       join public.iec_profiles p on p.id = sb.iec_id
       where sb.id = $1 and p.org_id = $2
       limit 1`,
      [pair.shippingBillId, params.orgId]
    );
    const sb = sbRes.rows[0];
    if (!sb) throw new NotFoundError("Shipping Bill not found in this organization.");
    if (!isCalculationEligibleSb(sb.status)) {
      throw new ValidationError(
        `Shipping Bill #${sb.sb_number} requires human field confirmation before matching.`
      );
    }

    const remRes = await params.tx.query<{
      id: string;
      iec_id: string;
      irm_number: string;
      currency: string;
      amount_minor: string;
      utilised_minor: string;
    }>(
      `select r.id, r.iec_id, r.irm_number, r.currency, r.amount_minor::text, r.utilised_minor::text
       from public.remittances r
       join public.iec_profiles p on p.id = r.iec_id
       where r.id = $1 and p.org_id = $2
       limit 1`,
      [pair.remittanceId, params.orgId]
    );
    const rem = remRes.rows[0];
    if (!rem) throw new NotFoundError("Remittance (IRM) not found in this organization.");

    if (sb.currency.toUpperCase() !== rem.currency.toUpperCase()) {
      throw new ValidationError(
        `Payments in different currencies cannot be clubbed (${sb.currency} vs ${rem.currency}).`
      );
    }

    const existingMatch = await params.tx.query<{ id: string }>(
      `select id from public.sb_remittance_matches
       where shipping_bill_id = $1 and remittance_id = $2
       limit 1`,
      [sb.id, rem.id]
    );
    if (existingMatch.rows[0]) {
      throw new ConflictError(
        `Shipping Bill #${sb.sb_number} is already matched to ${rem.irm_number}.`
      );
    }

    const remAmountMinor = Number(rem.amount_minor);
    const remUtilisedMinor = Number(rem.utilised_minor);
    const remainingBalance = Math.max(0, remAmountMinor - remUtilisedMinor);
    if (allocatedMinor > remainingBalance) {
      throw new ValidationError(
        `Cannot allocate ${allocatedMinor} minor units to ${rem.irm_number}; remaining balance is ${remainingBalance}.`
      );
    }

    const matchId = crypto.randomUUID();
    await params.tx.query(
      `insert into public.sb_remittance_matches (
         id, shipping_bill_id, remittance_id, matched_minor, method, confidence, explanation, confirmed_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        matchId,
        sb.id,
        rem.id,
        allocatedMinor,
        pair.method,
        pair.confidence.toFixed(4),
        pair.explanation,
        params.actorUserId,
      ]
    );

    const newUtilised = remUtilisedMinor + allocatedMinor;
    await params.tx.query(`update public.remittances set utilised_minor = $2 where id = $1`, [
      rem.id,
      newUtilised,
    ]);

    const sbMatchedRes = await params.tx.query<{ total: string }>(
      `select coalesce(sum(matched_minor), 0)::text as total
       from public.sb_remittance_matches
       where shipping_bill_id = $1`,
      [sb.id]
    );
    const totalSbMatched = Number(sbMatchedRes.rows[0]?.total ?? 0);
    const nextStatus = computeNextSbStatus({
      currentStatus: sb.status,
      fobMinor: Number(sb.fob_minor),
      matchedMinor: totalSbMatched,
      explanation: pair.explanation,
    });
    await params.tx.query(`update public.shipping_bills set status = $2 where id = $1`, [
      sb.id,
      nextStatus,
    ]);

    await params.tx.query(
      `delete from public.sb_remittance_rejections
       where shipping_bill_id = $1 and remittance_id = $2`,
      [sb.id, rem.id]
    );

    await params.tx.query(
      `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
       values ($1, $2, $3, 'sb_remittance_matches', $4, $5::jsonb)`,
      [
        params.orgId,
        params.actorUserId,
        pair.method === "auto" ? "auto_match" : "confirm_match",
        matchId,
        JSON.stringify({
          shippingBillId: sb.id,
          sbNumber: sb.sb_number,
          remittanceId: rem.id,
          irmNumber: rem.irm_number,
          matchedMinor: allocatedMinor,
          currency: rem.currency,
          explanation: pair.explanation,
        }),
      ]
    );

    insertedCount += 1;
  }

  return insertedCount;
}

async function loadMatchingEngineInputs(params: {
  orgId: string;
  iecId: string | null;
  userId: string;
}): Promise<{
  shippingBills: WorkspaceShippingBillRow[];
  remittances: WorkspaceRemittanceRow[];
  confirmedMatches: ConfirmedMatchView[];
  rejectedPairs: Set<string>;
  importBatches: IrmImportBatchView[];
}> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      const sbRows = await tx.query<{
        id: string;
        iec_id: string;
        iec_code: string;
        sb_number: string;
        sb_date: string;
        port_code: string;
        invoice_no: string;
        buyer_name: string;
        currency: string;
        fob_minor: string;
        status: ShippingBillStatus;
      }>(
        `select sb.id, sb.iec_id, p.iec_code, sb.sb_number, sb.sb_date::text, sb.port_code,
                sb.invoice_no, sb.buyer_name, sb.currency, sb.fob_minor::text, sb.status
         from public.shipping_bills sb
         join public.iec_profiles p on p.id = sb.iec_id
         where p.org_id = $1 ${params.iecId ? "and sb.iec_id = $2" : ""}
         order by sb.sb_date desc, sb.sb_number asc`,
        params.iecId ? [params.orgId, params.iecId] : [params.orgId]
      );

      const remRows = await tx.query<{
        id: string;
        iec_id: string;
        irm_number: string;
        bank_name: string;
        remittance_date: string;
        currency: string;
        amount_minor: string;
        utilised_minor: string;
        remitter_name: string;
        invoice_reference: string;
      }>(
        `select r.id, r.iec_id, r.irm_number, r.bank_name, r.remittance_date::text, r.currency,
                r.amount_minor::text, r.utilised_minor::text, r.remitter_name, r.invoice_reference
         from public.remittances r
         join public.iec_profiles p on p.id = r.iec_id
         where p.org_id = $1 ${params.iecId ? "and r.iec_id = $2" : ""}
         order by r.remittance_date desc, r.irm_number asc`,
        params.iecId ? [params.orgId, params.iecId] : [params.orgId]
      );

      const matchRows = await tx.query<{
        id: string;
        shipping_bill_id: string;
        remittance_id: string;
        sb_number: string;
        invoice_no: string;
        irm_number: string;
        bank_name: string;
        currency: string;
        matched_minor: string;
        method: MatchMethod;
        confidence: string;
        explanation: string;
        created_at: string;
      }>(
        `select m.id, m.shipping_bill_id, m.remittance_id, sb.sb_number, sb.invoice_no,
                r.irm_number, r.bank_name, r.currency, m.matched_minor::text, m.method,
                m.confidence::text, m.explanation, m.created_at::text
         from public.sb_remittance_matches m
         join public.shipping_bills sb on sb.id = m.shipping_bill_id
         join public.remittances r on r.id = m.remittance_id
         join public.iec_profiles p on p.id = sb.iec_id
         where p.org_id = $1 ${params.iecId ? "and sb.iec_id = $2" : ""}
         order by m.created_at desc`,
        params.iecId ? [params.orgId, params.iecId] : [params.orgId]
      );

      const rejRows = await tx.query<{ shipping_bill_id: string; remittance_id: string }>(
        `select r.shipping_bill_id, r.remittance_id
         from public.sb_remittance_rejections r
         join public.iec_profiles p on p.id = r.iec_id
         where p.org_id = $1 ${params.iecId ? "and r.iec_id = $2" : ""}`,
        params.iecId ? [params.orgId, params.iecId] : [params.orgId]
      );

      const batchRows = await tx.query<{
        id: string;
        iec_id: string;
        filename: string;
        total_rows: number;
        imported_count: number;
        updated_count: number;
        failed_count: number;
        auto_confirmed_count: number;
        review_needed_count: number;
        failed_rows: unknown;
        created_at: string;
      }>(
        `select id, iec_id, filename, total_rows, imported_count, updated_count,
                failed_count, auto_confirmed_count, review_needed_count, failed_rows, created_at::text
         from public.irm_import_batches
         where org_id = $1 ${params.iecId ? "and iec_id = $2" : ""}
         order by created_at desc
         limit 10`,
        params.iecId ? [params.orgId, params.iecId] : [params.orgId]
      );

      const matchedBySb = new Map<string, number>();
      for (const m of matchRows.rows) {
        matchedBySb.set(
          m.shipping_bill_id,
          (matchedBySb.get(m.shipping_bill_id) ?? 0) + Number(m.matched_minor)
        );
      }

      return {
        shippingBills: sbRows.rows.map((row) => {
          const fobMinor = Number(row.fob_minor);
          const matchedMinor = matchedBySb.get(row.id) ?? 0;
          return {
            id: row.id,
            iecId: row.iec_id,
            iecCode: row.iec_code,
            sbNumber: row.sb_number,
            sbDate: row.sb_date.slice(0, 10),
            portCode: row.port_code,
            invoiceNo: row.invoice_no,
            buyerName: row.buyer_name,
            currency: row.currency,
            fobMinor,
            matchedMinor,
            remainingMinor: Math.max(0, fobMinor - matchedMinor),
            status: row.status,
            calculationEligible: isCalculationEligibleSb(row.status),
          };
        }),
        remittances: remRows.rows.map((r) => {
          const amountMinor = Number(r.amount_minor);
          const utilisedMinor = Number(r.utilised_minor);
          return {
            id: r.id,
            iecId: r.iec_id,
            irmNumber: r.irm_number,
            bankName: r.bank_name,
            remittanceDate: r.remittance_date.slice(0, 10),
            currency: r.currency,
            amountMinor,
            utilisedMinor,
            remainingMinor: Math.max(0, amountMinor - utilisedMinor),
            remitterName: r.remitter_name,
            invoiceReference: r.invoice_reference,
          };
        }),
        confirmedMatches: matchRows.rows.map((m) => ({
          id: m.id,
          shippingBillId: m.shipping_bill_id,
          remittanceId: m.remittance_id,
          sbNumber: m.sb_number,
          invoiceNo: m.invoice_no,
          irmNumber: m.irm_number,
          bankName: m.bank_name,
          currency: m.currency,
          matchedMinor: Number(m.matched_minor),
          method: m.method,
          confidence: Number(m.confidence),
          explanation: m.explanation,
          createdAt: m.created_at,
        })),
        rejectedPairs: new Set(rejRows.rows.map((x) => `${x.shipping_bill_id}:${x.remittance_id}`)),
        importBatches: batchRows.rows.map((b) => ({
          id: b.id,
          iecId: b.iec_id,
          filename: b.filename,
          totalRows: b.total_rows,
          importedCount: b.imported_count,
          updatedCount: b.updated_count,
          failedCount: b.failed_count,
          autoConfirmedCount: b.auto_confirmed_count,
          reviewNeededCount: b.review_needed_count,
          failedRows: Array.isArray(b.failed_rows) ? (b.failed_rows as IrmRowError[]) : [],
          createdAt: b.created_at,
        })),
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  let sbQuery = supabase
    .from("shipping_bills")
    .select(
      "id, iec_id, sb_number, sb_date, port_code, invoice_no, buyer_name, currency, fob_minor, status, iec_profiles!inner(org_id, iec_code)"
    )
    .eq("iec_profiles.org_id", params.orgId)
    .order("sb_date", { ascending: false });
  if (params.iecId) sbQuery = sbQuery.eq("iec_id", params.iecId);
  const { data: sbData, error: sbErr } = await sbQuery;
  if (sbErr) throw sbErr;

  let remQuery = supabase
    .from("remittances")
    .select(
      "id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor, utilised_minor, remitter_name, invoice_reference, iec_profiles!inner(org_id)"
    )
    .eq("iec_profiles.org_id", params.orgId)
    .order("remittance_date", { ascending: false });
  if (params.iecId) remQuery = remQuery.eq("iec_id", params.iecId);
  const { data: remData, error: remErr } = await remQuery;
  if (remErr) throw remErr;

  let matchQuery = supabase
    .from("sb_remittance_matches")
    .select(
      "id, shipping_bill_id, remittance_id, matched_minor, method, confidence, explanation, created_at, shipping_bills!inner(sb_number, invoice_no, iec_id, iec_profiles!inner(org_id)), remittances!inner(irm_number, bank_name, currency)"
    )
    .eq("shipping_bills.iec_profiles.org_id", params.orgId)
    .order("created_at", { ascending: false });
  if (params.iecId) matchQuery = matchQuery.eq("shipping_bills.iec_id", params.iecId);
  const { data: matchData, error: matchErr } = await matchQuery;
  if (matchErr) throw matchErr;

  let rejQuery = supabase
    .from("sb_remittance_rejections")
    .select("shipping_bill_id, remittance_id, iec_profiles!inner(org_id)")
    .eq("iec_profiles.org_id", params.orgId);
  if (params.iecId) rejQuery = rejQuery.eq("iec_id", params.iecId);
  const { data: rejData, error: rejErr } = await rejQuery;
  if (rejErr) throw rejErr;

  let batchQuery = supabase
    .from("irm_import_batches")
    .select("*")
    .eq("org_id", params.orgId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (params.iecId) batchQuery = batchQuery.eq("iec_id", params.iecId);
  const { data: batchData, error: batchErr } = await batchQuery;
  if (batchErr) throw batchErr;

  const matchedBySb = new Map<string, number>();
  const confirmedMatches: ConfirmedMatchView[] = (matchData ?? []).map((m) => {
    const sbRel = m.shipping_bills as unknown as { sb_number: string; invoice_no: string };
    const remRel = m.remittances as unknown as {
      irm_number: string;
      bank_name: string;
      currency: string;
    };
    matchedBySb.set(
      m.shipping_bill_id,
      (matchedBySb.get(m.shipping_bill_id) ?? 0) + m.matched_minor
    );
    return {
      id: m.id,
      shippingBillId: m.shipping_bill_id,
      remittanceId: m.remittance_id,
      sbNumber: sbRel.sb_number,
      invoiceNo: sbRel.invoice_no,
      irmNumber: remRel.irm_number,
      bankName: remRel.bank_name,
      currency: remRel.currency,
      matchedMinor: m.matched_minor,
      method: m.method,
      confidence: Number(m.confidence),
      explanation: m.explanation,
      createdAt: m.created_at,
    };
  });

  return {
    shippingBills: (sbData ?? []).map((row) => {
      const iecRel = row.iec_profiles as unknown as { iec_code: string };
      const matchedMinor = matchedBySb.get(row.id) ?? 0;
      return {
        id: row.id,
        iecId: row.iec_id,
        iecCode: iecRel.iec_code,
        sbNumber: row.sb_number,
        sbDate: row.sb_date,
        portCode: row.port_code,
        invoiceNo: row.invoice_no ?? "",
        buyerName: row.buyer_name ?? "",
        currency: row.currency,
        fobMinor: row.fob_minor,
        matchedMinor,
        remainingMinor: Math.max(0, row.fob_minor - matchedMinor),
        status: row.status,
        calculationEligible: isCalculationEligibleSb(row.status),
      };
    }),
    remittances: (remData ?? []).map((r) => ({
      id: r.id,
      iecId: r.iec_id,
      irmNumber: r.irm_number,
      bankName: r.bank_name,
      remittanceDate: r.remittance_date,
      currency: r.currency,
      amountMinor: r.amount_minor,
      utilisedMinor: r.utilised_minor,
      remainingMinor: Math.max(0, r.amount_minor - r.utilised_minor),
      remitterName: r.remitter_name,
      invoiceReference: r.invoice_reference,
    })),
    confirmedMatches,
    rejectedPairs: new Set((rejData ?? []).map((x) => `${x.shipping_bill_id}:${x.remittance_id}`)),
    importBatches: (batchData ?? []).map((b) => ({
      id: b.id,
      iecId: b.iec_id,
      filename: b.filename,
      totalRows: b.total_rows,
      importedCount: b.imported_count,
      updatedCount: b.updated_count,
      failedCount: b.failed_count,
      autoConfirmedCount: b.auto_confirmed_count,
      reviewNeededCount: b.review_needed_count,
      failedRows: Array.isArray(b.failed_rows) ? (b.failed_rows as unknown as IrmRowError[]) : [],
      createdAt: b.created_at,
    })),
  };
}

function buildSuggestionsFromState(state: {
  shippingBills: WorkspaceShippingBillRow[];
  remittances: WorkspaceRemittanceRow[];
  confirmedMatches: ConfirmedMatchView[];
  rejectedPairs: Set<string>;
}) {
  const sbInputs: MatchingShippingBillInput[] = state.shippingBills.map((sb) => ({
    id: sb.id,
    iecId: sb.iecId,
    sbNumber: sb.sbNumber,
    sbDate: sb.sbDate,
    invoiceNo: sb.invoiceNo,
    buyerName: sb.buyerName,
    currency: sb.currency,
    fobMinor: sb.fobMinor,
    alreadyMatchedMinor: sb.matchedMinor,
    calculationEligible: sb.calculationEligible,
    status: sb.status,
  }));

  const remInputs: MatchingRemittanceInput[] = state.remittances.map((r) => ({
    id: r.id,
    iecId: r.iecId,
    irmNumber: r.irmNumber,
    bankName: r.bankName,
    remittanceDate: r.remittanceDate,
    currency: r.currency,
    amountMinor: r.amountMinor,
    utilisedMinor: r.utilisedMinor,
    remitterName: r.remitterName,
    invoiceReference: r.invoiceReference,
  }));

  const existingPairs = new Set(
    state.confirmedMatches.map((m) => `${m.shippingBillId}:${m.remittanceId}`)
  );

  return runMatchingEngine({
    shippingBills: sbInputs,
    remittances: remInputs,
    existingPairs,
    rejectedPairs: state.rejectedPairs,
  });
}

export async function getReconciliationWorkspace(params: {
  orgId: string;
  iecId?: string | null;
}): Promise<ReconciliationWorkspaceData> {
  const access = await requireOrgAccess(params.orgId, "viewer");
  const resolved = await resolveOrgIec({
    orgId: access.orgId,
    iecId: params.iecId ?? null,
    userId: access.user.id,
  });

  const targetIecId = resolved?.iecId ?? null;
  const state = await loadMatchingEngineInputs({
    orgId: access.orgId,
    iecId: targetIecId,
    userId: access.user.id,
  });

  const engine = buildSuggestionsFromState(state);

  return {
    orgId: access.orgId,
    iecId: targetIecId,
    shippingBills: state.shippingBills,
    remittances: state.remittances,
    confirmedMatches: state.confirmedMatches,
    suggestions: [...engine.autoConfirmed, ...engine.reviewSuggestions].sort(
      (a, b) => b.confidence - a.confidence
    ),
    importBatches: state.importBatches,
  };
}

export async function commitIrmImportAndRunMatching(params: {
  orgId: string;
  iecId?: string | null;
  sourceDocumentId?: string | null;
  filename: string;
  bytes: Uint8Array;
  columnMapping?: Partial<IrmColumnMapping>;
}): Promise<IrmImportCommitResult> {
  const access = await requireOrgAccess(params.orgId, "member");
  const resolvedIec = await resolveOrgIec({
    orgId: access.orgId,
    iecId: params.iecId ?? null,
    userId: access.user.id,
  });

  if (!resolvedIec) {
    throw new ValidationError("Create or select an IEC profile before importing an IRM sheet.");
  }

  const parsed = await parseIrmSheetForImport({
    filename: params.filename,
    bytes: params.bytes,
    columnMapping: params.columnMapping,
  });

  const failedRows: IrmRowError[] = [...parsed.failedRows];
  let importedCount = 0;
  let updatedCount = 0;

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");

    await asPgliteUser(access.user.id, async (tx) => {
      for (const row of parsed.validRows) {
        const existing = await tx.query<{
          id: string;
          amount_minor: string;
          utilised_minor: string;
        }>(
          `select id, amount_minor::text, utilised_minor::text
           from public.remittances
           where iec_id = $1 and irm_number = $2
           limit 1`,
          [resolvedIec.iecId, row.irmNumber]
        );

        const matchSumRes = existing.rows[0]
          ? await tx.query<{ total: string }>(
              `select coalesce(sum(matched_minor), 0)::text as total
               from public.sb_remittance_matches
               where remittance_id = $1`,
              [existing.rows[0].id]
            )
          : null;

        const existingMatchSum = Number(matchSumRes?.rows[0]?.total ?? 0);
        if (row.amountMinor < existingMatchSum) {
          failedRows.push({
            rowNumber: row.rowNumber,
            irmNumber: row.irmNumber,
            reason: `Imported amount (${row.amountMinor}) is lower than already-matched balance (${existingMatchSum}).`,
            raw: row.raw,
          });
          continue;
        }

        const safeUtilised = Math.max(existingMatchSum, row.utilisedMinor);

        if (existing.rows[0]) {
          await tx.query(
            `update public.remittances
             set source_document_id = coalesce($2, source_document_id),
                 bank_name = $3,
                 remittance_date = $4,
                 currency = $5,
                 amount_minor = $6,
                 utilised_minor = $7,
                 remitter_name = $8,
                 invoice_reference = $9,
                 ad_code = $10,
                 raw = $11::jsonb
             where id = $1`,
            [
              existing.rows[0].id,
              params.sourceDocumentId ?? null,
              row.bankName,
              row.remittanceDate,
              row.currency,
              row.amountMinor,
              safeUtilised,
              row.remitterName,
              row.invoiceReference,
              row.adCode,
              JSON.stringify(row.raw),
            ]
          );
          updatedCount += 1;
        } else {
          const remId = crypto.randomUUID();
          await tx.query(
            `insert into public.remittances (
               id, iec_id, source_document_id, irm_number, bank_name, remittance_date,
               currency, amount_minor, utilised_minor, remitter_name, invoice_reference, ad_code, raw
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
            [
              remId,
              resolvedIec.iecId,
              params.sourceDocumentId ?? null,
              row.irmNumber,
              row.bankName,
              row.remittanceDate,
              row.currency,
              row.amountMinor,
              safeUtilised,
              row.remitterName,
              row.invoiceReference,
              row.adCode,
              JSON.stringify(row.raw),
            ]
          );
          importedCount += 1;
        }
      }
    });

    const afterState = await loadMatchingEngineInputs({
      orgId: access.orgId,
      iecId: resolvedIec.iecId,
      userId: access.user.id,
    });
    const engineResult = buildSuggestionsFromState(afterState);

    let autoConfirmedCount = 0;
    const batchId = crypto.randomUUID();

    await asPgliteUser(access.user.id, async (tx) => {
      if (engineResult.autoConfirmed.length > 0) {
        autoConfirmedCount = await applyConfirmedMatchesTxPglite({
          tx,
          orgId: access.orgId,
          actorUserId: access.user.id,
          pairs: engineResult.autoConfirmed.map((m) => ({
            shippingBillId: m.shippingBillId,
            remittanceId: m.remittanceId,
            allocatedMinor: m.proposedMinor,
            method: "auto",
            confidence: m.confidence,
            explanation: m.explanation,
          })),
        });
      }

      await tx.query(
        `insert into public.irm_import_batches (
           id, org_id, iec_id, source_document_id, filename, total_rows,
           imported_count, updated_count, failed_count, auto_confirmed_count,
           review_needed_count, column_mapping, failed_rows, imported_by
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)`,
        [
          batchId,
          access.orgId,
          resolvedIec.iecId,
          params.sourceDocumentId ?? null,
          params.filename,
          parsed.totalDataRows,
          importedCount,
          updatedCount,
          failedRows.length,
          autoConfirmedCount,
          engineResult.reviewSuggestions.length,
          JSON.stringify(parsed.mapping),
          JSON.stringify(failedRows),
          access.user.id,
        ]
      );

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'irm_import', 'irm_import_batches', $3, $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          batchId,
          JSON.stringify({
            filename: params.filename,
            importedCount,
            updatedCount,
            failedCount: failedRows.length,
            autoConfirmedCount,
            reviewNeededCount: engineResult.reviewSuggestions.length,
          }),
        ]
      );
    });

    return {
      batchId,
      totalRows: parsed.totalDataRows,
      importedCount,
      updatedCount,
      failedCount: failedRows.length,
      failedRows,
      autoConfirmedCount,
      reviewNeededCount: engineResult.reviewSuggestions.length,
    };
  }

  // Supabase path
  const supabase = await createSupabaseServerClient();
  for (const row of parsed.validRows) {
    const { data: existing, error: exErr } = await supabase
      .from("remittances")
      .select("id")
      .eq("iec_id", resolvedIec.iecId)
      .eq("irm_number", row.irmNumber)
      .maybeSingle();
    if (exErr) throw exErr;

    let existingMatchSum = 0;
    if (existing) {
      const { data: matchRows, error: mErr } = await supabase
        .from("sb_remittance_matches")
        .select("matched_minor")
        .eq("remittance_id", existing.id);
      if (mErr) throw mErr;
      existingMatchSum = (matchRows ?? []).reduce((s, r) => s + r.matched_minor, 0);
    }

    if (row.amountMinor < existingMatchSum) {
      failedRows.push({
        rowNumber: row.rowNumber,
        irmNumber: row.irmNumber,
        reason: `Imported amount (${row.amountMinor}) is lower than already-matched balance (${existingMatchSum}).`,
        raw: row.raw,
      });
      continue;
    }

    const safeUtilised = Math.max(existingMatchSum, row.utilisedMinor);
    const { error: upsertErr } = await supabase.from("remittances").upsert(
      {
        iec_id: resolvedIec.iecId,
        source_document_id: params.sourceDocumentId ?? null,
        irm_number: row.irmNumber,
        bank_name: row.bankName,
        remittance_date: row.remittanceDate,
        currency: row.currency,
        amount_minor: row.amountMinor,
        utilised_minor: safeUtilised,
        remitter_name: row.remitterName,
        invoice_reference: row.invoiceReference,
        ad_code: row.adCode,
        raw: row.raw as unknown as Json,
      },
      { onConflict: "iec_id,irm_number" }
    );
    if (upsertErr) throw upsertErr;

    if (existing) updatedCount += 1;
    else importedCount += 1;
  }

  const afterState = await loadMatchingEngineInputs({
    orgId: access.orgId,
    iecId: resolvedIec.iecId,
    userId: access.user.id,
  });
  const engineResult = buildSuggestionsFromState(afterState);

  const autoConfirmedCount = await confirmMatchesForOrg({
    orgId: access.orgId,
    pairs: engineResult.autoConfirmed.map((m) => ({
      shippingBillId: m.shippingBillId,
      remittanceId: m.remittanceId,
      allocatedMinor: m.proposedMinor,
      method: "auto",
      confidence: m.confidence,
      explanation: m.explanation,
    })),
  });

  const { data: batchRow, error: bErr } = await supabase
    .from("irm_import_batches")
    .insert({
      org_id: access.orgId,
      iec_id: resolvedIec.iecId,
      source_document_id: params.sourceDocumentId ?? null,
      filename: params.filename,
      total_rows: parsed.totalDataRows,
      imported_count: importedCount,
      updated_count: updatedCount,
      failed_count: failedRows.length,
      auto_confirmed_count: autoConfirmedCount,
      review_needed_count: engineResult.reviewSuggestions.length,
      column_mapping: parsed.mapping as unknown as Json,
      failed_rows: failedRows as unknown as Json,
      imported_by: access.user.id,
    })
    .select("id")
    .single();
  if (bErr) throw bErr;

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "irm_import",
    entity: "irm_import_batches",
    entity_id: batchRow.id,
    diff: {
      filename: params.filename,
      importedCount,
      updatedCount,
      failedCount: failedRows.length,
      autoConfirmedCount,
      reviewNeededCount: engineResult.reviewSuggestions.length,
    } as unknown as Json,
  });

  return {
    batchId: batchRow.id,
    totalRows: parsed.totalDataRows,
    importedCount,
    updatedCount,
    failedCount: failedRows.length,
    failedRows,
    autoConfirmedCount,
    reviewNeededCount: engineResult.reviewSuggestions.length,
  };
}

export async function runAutoMatchForOrg(params: {
  orgId: string;
  iecId?: string | null;
}): Promise<{ autoConfirmedCount: number; reviewNeededCount: number }> {
  const access = await requireOrgAccess(params.orgId, "member");
  const resolved = await resolveOrgIec({
    orgId: access.orgId,
    iecId: params.iecId ?? null,
    userId: access.user.id,
  });

  const state = await loadMatchingEngineInputs({
    orgId: access.orgId,
    iecId: resolved?.iecId ?? null,
    userId: access.user.id,
  });
  const engine = buildSuggestionsFromState(state);

  const autoConfirmedCount =
    engine.autoConfirmed.length > 0
      ? await confirmMatchesForOrg({
          orgId: access.orgId,
          pairs: engine.autoConfirmed.map((m) => ({
            shippingBillId: m.shippingBillId,
            remittanceId: m.remittanceId,
            allocatedMinor: m.proposedMinor,
            method: "auto",
            confidence: m.confidence,
            explanation: m.explanation,
          })),
        })
      : 0;

  return {
    autoConfirmedCount,
    reviewNeededCount: engine.reviewSuggestions.length,
  };
}

export async function confirmMatchesForOrg(params: {
  orgId: string;
  pairs: readonly ConfirmMatchPairRequest[];
}): Promise<number> {
  const access = await requireOrgAccess(params.orgId, "member");
  if (params.pairs.length === 0) return 0;

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) =>
      applyConfirmedMatchesTxPglite({
        tx,
        orgId: access.orgId,
        actorUserId: access.user.id,
        pairs: params.pairs,
      })
    );
  }

  const supabase = await createSupabaseServerClient();
  let insertedCount = 0;

  for (const pair of params.pairs) {
    const allocatedMinor = resolveAllocatedMinor(pair);

    const { data: sb, error: sbErr } = await supabase
      .from("shipping_bills")
      .select("id, iec_id, sb_number, currency, fob_minor, status, iec_profiles!inner(org_id)")
      .eq("id", pair.shippingBillId)
      .eq("iec_profiles.org_id", access.orgId)
      .maybeSingle();
    if (sbErr) throw sbErr;
    if (!sb) throw new NotFoundError("Shipping Bill not found in this organization.");
    if (!isCalculationEligibleSb(sb.status)) {
      throw new ValidationError(
        `Shipping Bill #${sb.sb_number} requires human field confirmation before matching.`
      );
    }

    const { data: rem, error: remErr } = await supabase
      .from("remittances")
      .select(
        "id, iec_id, irm_number, currency, amount_minor, utilised_minor, iec_profiles!inner(org_id)"
      )
      .eq("id", pair.remittanceId)
      .eq("iec_profiles.org_id", access.orgId)
      .maybeSingle();
    if (remErr) throw remErr;
    if (!rem) throw new NotFoundError("Remittance not found in this organization.");

    if (sb.currency.toUpperCase() !== rem.currency.toUpperCase()) {
      throw new ValidationError(
        `Payments in different currencies cannot be clubbed (${sb.currency} vs ${rem.currency}).`
      );
    }

    const remainingBalance = Math.max(0, rem.amount_minor - rem.utilised_minor);
    if (allocatedMinor > remainingBalance) {
      throw new ValidationError(
        `Cannot allocate ${allocatedMinor} minor units to ${rem.irm_number}; remaining balance is ${remainingBalance}.`
      );
    }

    const { data: existingMatch } = await supabase
      .from("sb_remittance_matches")
      .select("id")
      .eq("shipping_bill_id", sb.id)
      .eq("remittance_id", rem.id)
      .maybeSingle();
    if (existingMatch) {
      throw new ConflictError(
        `Shipping Bill #${sb.sb_number} is already matched to ${rem.irm_number}.`
      );
    }

    const { data: matchRow, error: insErr } = await supabase
      .from("sb_remittance_matches")
      .insert({
        shipping_bill_id: sb.id,
        remittance_id: rem.id,
        matched_minor: allocatedMinor,
        method: pair.method,
        confidence: pair.confidence.toFixed(4),
        explanation: pair.explanation,
        confirmed_by: access.user.id,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    await supabase
      .from("remittances")
      .update({ utilised_minor: rem.utilised_minor + allocatedMinor })
      .eq("id", rem.id);

    const { data: sbMatches } = await supabase
      .from("sb_remittance_matches")
      .select("matched_minor")
      .eq("shipping_bill_id", sb.id);
    const totalSbMatched = (sbMatches ?? []).reduce((s, m) => s + m.matched_minor, 0);
    const nextStatus = computeNextSbStatus({
      currentStatus: sb.status,
      fobMinor: sb.fob_minor,
      matchedMinor: totalSbMatched,
      explanation: pair.explanation,
    });
    await supabase.from("shipping_bills").update({ status: nextStatus }).eq("id", sb.id);

    await supabase
      .from("sb_remittance_rejections")
      .delete()
      .eq("shipping_bill_id", sb.id)
      .eq("remittance_id", rem.id);

    await supabase.from("audit_log").insert({
      org_id: access.orgId,
      actor_id: access.user.id,
      action: pair.method === "auto" ? "auto_match" : "confirm_match",
      entity: "sb_remittance_matches",
      entity_id: matchRow.id,
      diff: {
        shippingBillId: sb.id,
        sbNumber: sb.sb_number,
        remittanceId: rem.id,
        irmNumber: rem.irm_number,
        matchedMinor: allocatedMinor,
        currency: rem.currency,
        explanation: pair.explanation,
      } as unknown as Json,
    });

    insertedCount += 1;
  }

  return insertedCount;
}

export async function rejectMatchSuggestionForOrg(params: {
  orgId: string;
  shippingBillId: string;
  remittanceId: string;
  reason: string;
}): Promise<void> {
  const access = await requireOrgAccess(params.orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const sbRes = await tx.query<{ id: string; iec_id: string }>(
        `select sb.id, sb.iec_id
         from public.shipping_bills sb
         join public.iec_profiles p on p.id = sb.iec_id
         where sb.id = $1 and p.org_id = $2
         limit 1`,
        [params.shippingBillId, access.orgId]
      );
      const sb = sbRes.rows[0];
      if (!sb) throw new NotFoundError("Shipping Bill not found.");

      const remRes = await tx.query<{ id: string }>(
        `select r.id from public.remittances r
         join public.iec_profiles p on p.id = r.iec_id
         where r.id = $1 and p.org_id = $2
         limit 1`,
        [params.remittanceId, access.orgId]
      );
      if (!remRes.rows[0]) throw new NotFoundError("Remittance not found.");

      await tx.query(
        `insert into public.sb_remittance_rejections (
           iec_id, shipping_bill_id, remittance_id, rejected_by, reason
         ) values ($1, $2, $3, $4, $5)
         on conflict (shipping_bill_id, remittance_id)
         do update set rejected_by = excluded.rejected_by, reason = excluded.reason`,
        [sb.iec_id, params.shippingBillId, params.remittanceId, access.user.id, params.reason]
      );

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'reject_match', 'sb_remittance_rejections', $3, $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          params.shippingBillId,
          JSON.stringify({
            shippingBillId: params.shippingBillId,
            remittanceId: params.remittanceId,
            reason: params.reason,
          }),
        ]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: sb, error: sbErr } = await supabase
    .from("shipping_bills")
    .select("id, iec_id, iec_profiles!inner(org_id)")
    .eq("id", params.shippingBillId)
    .eq("iec_profiles.org_id", access.orgId)
    .maybeSingle();
  if (sbErr) throw sbErr;
  if (!sb) throw new NotFoundError("Shipping Bill not found.");

  const { data: rej, error: rejErr } = await supabase
    .from("sb_remittance_rejections")
    .upsert(
      {
        iec_id: sb.iec_id,
        shipping_bill_id: params.shippingBillId,
        remittance_id: params.remittanceId,
        rejected_by: access.user.id,
        reason: params.reason,
      },
      { onConflict: "shipping_bill_id,remittance_id" }
    )
    .select("id")
    .single();
  if (rejErr) throw rejErr;

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "reject_match",
    entity: "sb_remittance_rejections",
    entity_id: rej.id,
    diff: {
      shippingBillId: params.shippingBillId,
      remittanceId: params.remittanceId,
      reason: params.reason,
    } as unknown as Json,
  });
}

export async function unmatchRemittanceForOrg(params: {
  orgId: string;
  matchId: string;
}): Promise<void> {
  const access = await requireOrgAccess(params.orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const mRes = await tx.query<{
        id: string;
        shipping_bill_id: string;
        remittance_id: string;
        matched_minor: string;
        sb_number: string;
        sb_status: ShippingBillStatus;
        sb_fob_minor: string;
        irm_number: string;
        rem_utilised_minor: string;
      }>(
        `select m.id, m.shipping_bill_id, m.remittance_id, m.matched_minor::text,
                sb.sb_number, sb.status as sb_status, sb.fob_minor::text as sb_fob_minor,
                r.irm_number, r.utilised_minor::text as rem_utilised_minor
         from public.sb_remittance_matches m
         join public.shipping_bills sb on sb.id = m.shipping_bill_id
         join public.remittances r on r.id = m.remittance_id
         join public.iec_profiles p on p.id = sb.iec_id
         where m.id = $1 and p.org_id = $2
         limit 1`,
        [params.matchId, access.orgId]
      );

      const m = mRes.rows[0];
      if (!m) throw new NotFoundError("Match link not found.");

      const matchedMinor = Number(m.matched_minor);
      const nextUtilised = Math.max(0, Number(m.rem_utilised_minor) - matchedMinor);

      await tx.query(`delete from public.sb_remittance_matches where id = $1`, [m.id]);
      await tx.query(`update public.remittances set utilised_minor = $2 where id = $1`, [
        m.remittance_id,
        nextUtilised,
      ]);

      const remSum = await tx.query<{ total: string }>(
        `select coalesce(sum(matched_minor), 0)::text as total
         from public.sb_remittance_matches where shipping_bill_id = $1`,
        [m.shipping_bill_id]
      );
      const remainingMatched = Number(remSum.rows[0]?.total ?? 0);
      const nextStatus = computeNextSbStatus({
        currentStatus: m.sb_status,
        fobMinor: Number(m.sb_fob_minor),
        matchedMinor: remainingMatched,
      });
      await tx.query(`update public.shipping_bills set status = $2 where id = $1`, [
        m.shipping_bill_id,
        nextStatus,
      ]);

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'unmatch', 'sb_remittance_matches', $3, $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          m.id,
          JSON.stringify({
            shippingBillId: m.shipping_bill_id,
            sbNumber: m.sb_number,
            remittanceId: m.remittance_id,
            irmNumber: m.irm_number,
            unmatchedMinor: matchedMinor,
          }),
        ]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: m, error: mErr } = await supabase
    .from("sb_remittance_matches")
    .select(
      "id, shipping_bill_id, remittance_id, matched_minor, shipping_bills!inner(sb_number, status, fob_minor, iec_profiles!inner(org_id)), remittances!inner(irm_number, utilised_minor)"
    )
    .eq("id", params.matchId)
    .eq("shipping_bills.iec_profiles.org_id", access.orgId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!m) throw new NotFoundError("Match link not found.");

  const sbRel = m.shipping_bills as unknown as {
    sb_number: string;
    status: ShippingBillStatus;
    fob_minor: number;
  };
  const remRel = m.remittances as unknown as { irm_number: string; utilised_minor: number };

  const { error: delErr } = await supabase.from("sb_remittance_matches").delete().eq("id", m.id);
  if (delErr) throw delErr;

  await supabase
    .from("remittances")
    .update({ utilised_minor: Math.max(0, remRel.utilised_minor - m.matched_minor) })
    .eq("id", m.remittance_id);

  const { data: leftRows } = await supabase
    .from("sb_remittance_matches")
    .select("matched_minor")
    .eq("shipping_bill_id", m.shipping_bill_id);
  const remainingMatched = (leftRows ?? []).reduce((s, r) => s + r.matched_minor, 0);
  const nextStatus = computeNextSbStatus({
    currentStatus: sbRel.status,
    fobMinor: sbRel.fob_minor,
    matchedMinor: remainingMatched,
  });
  await supabase.from("shipping_bills").update({ status: nextStatus }).eq("id", m.shipping_bill_id);

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "unmatch",
    entity: "sb_remittance_matches",
    entity_id: m.id,
    diff: {
      shippingBillId: m.shipping_bill_id,
      sbNumber: sbRel.sb_number,
      remittanceId: m.remittance_id,
      irmNumber: remRel.irm_number,
      unmatchedMinor: m.matched_minor,
    } as unknown as Json,
  });
}
