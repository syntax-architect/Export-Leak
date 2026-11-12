import crypto from "node:crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import type {
  DocumentParseStatus,
  IncentiveScheme,
  Json,
  ShippingBillStatus,
} from "@/lib/database.types";
import { runShippingBillParsePipeline } from "@/lib/documents/parsing/pipeline";
import {
  type FieldConfidenceEntry,
  type ParsedPageText,
  type ParsedShippingBillDraft,
  parseDecimalMoneyToMinorUnits,
} from "@/lib/documents/parsing/types";
import {
  isShippingBillCalculationEligible,
  validateShippingBillDraft,
} from "@/lib/documents/parsing/validator";
import { readStorageObjectBytes } from "@/lib/documents/storage";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ConfirmShippingBillReviewInput } from "@/lib/validation/shipping-bills";

export interface DocumentBatchSummary {
  totalShippingBills: number;
  parsedCount: number;
  needsReviewCount: number;
  failedCount: number;
  queuedCount: number;
  latestNeedsReviewSbId: string | null;
}

export interface ShippingBillListRow {
  id: string;
  iecId: string;
  iecCode: string;
  documentId: string | null;
  documentName: string | null;
  sbNumber: string;
  sbDate: string;
  portCode: string;
  leoDate: string | null;
  invoiceNo: string | null;
  buyerName: string | null;
  currency: string;
  fobMinor: number;
  exchangeRate: string | null;
  schemesClaimed: string[];
  status: ShippingBillStatus;
  needsReviewFields: string[];
  usedOcrFallback: boolean;
  aiCostPaise: number;
  confidenceConfirmedAt: string | null;
  calculationEligible: boolean;
  createdAt: string;
}

export interface ShippingBillItemRow {
  id: string;
  hsCode: string;
  description: string;
  quantity: string;
  uqc: string;
  fobMinor: number;
  fieldConfidence: Record<string, FieldConfidenceEntry>;
}

export interface ShippingBillCorrectionRow {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  oldConfidence: number | null;
  pageNumber: number | null;
  createdAt: string;
}

export interface ShippingBillReviewDetail extends ShippingBillListRow {
  orgId: string;
  aiParsingEnabled: boolean;
  fieldConfidence: Record<string, FieldConfidenceEntry>;
  sourceTextPages: ParsedPageText[];
  items: ShippingBillItemRow[];
  corrections: ShippingBillCorrectionRow[];
}

function getTodayKolkataIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatMinorUnitsToDecimal(minor: number): string {
  const neg = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg}${whole}.${frac}`;
}

function safeRecord(json: unknown): Record<string, FieldConfidenceEntry> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return json as Record<string, FieldConfidenceEntry>;
}

function safePages(json: unknown): ParsedPageText[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (p): p is ParsedPageText =>
      Boolean(p) &&
      typeof p === "object" &&
      typeof p.page === "number" &&
      typeof p.text === "string"
  );
}

interface InternalDocParseTarget {
  docId: string;
  orgId: string;
  iecId: string;
  storagePath: string;
  parseStatus: DocumentParseStatus;
  parseAttempts: number;
  aiCostPaise: number;
  aiParsingEnabled: boolean;
}

async function loadParseTarget(params: {
  orgId: string;
  docId: string;
  userId?: string;
}): Promise<InternalDocParseTarget | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{
      doc_id: string;
      org_id: string;
      iec_id: string;
      storage_path: string;
      parse_status: DocumentParseStatus;
      parse_attempts: number;
      ai_cost_paise: number;
      ai_parsing_enabled: boolean;
    }>(
      `select d.id as doc_id, o.id as org_id, d.iec_id, d.storage_path,
              d.parse_status, d.parse_attempts, d.ai_cost_paise, o.ai_parsing_enabled
       from public.documents d
       join public.iec_profiles p on p.id = d.iec_id
       join public.organizations o on o.id = p.org_id
       where d.id = $1 and o.id = $2 and d.deleted_at is null and d.kind = 'shipping_bill'`,
      [params.docId, params.orgId]
    );
    const row = res.rows[0];
    return row
      ? {
          docId: row.doc_id,
          orgId: row.org_id,
          iecId: row.iec_id,
          storagePath: row.storage_path,
          parseStatus: row.parse_status,
          parseAttempts: row.parse_attempts,
          aiCostPaise: row.ai_cost_paise,
          aiParsingEnabled: row.ai_parsing_enabled,
        }
      : null;
  }

  const supabase = params.userId
    ? await createSupabaseServerClient()
    : createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, iec_id, kind, storage_path, parse_status, parse_attempts, ai_cost_paise, iec_profiles!inner(org_id, organizations!inner(ai_parsing_enabled))"
    )
    .eq("id", params.docId)
    .eq("kind", "shipping_bill")
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const iec = Array.isArray(data.iec_profiles) ? data.iec_profiles[0] : data.iec_profiles;
  if (!iec || iec.org_id !== params.orgId) return null;
  const org = Array.isArray(iec.organizations) ? iec.organizations[0] : iec.organizations;

  return {
    docId: data.id,
    orgId: iec.org_id,
    iecId: data.iec_id,
    storagePath: data.storage_path,
    parseStatus: data.parse_status,
    parseAttempts: data.parse_attempts,
    aiCostPaise: data.ai_cost_paise,
    aiParsingEnabled: org?.ai_parsing_enabled ?? true,
  };
}

export async function parseDocumentById(params: {
  orgId: string;
  docId: string;
  actorUserId?: string | null;
  force?: boolean;
}): Promise<{
  docId: string;
  parseStatus: DocumentParseStatus;
  shippingBillId: string | null;
  parseError: string | null;
}> {
  const target = await loadParseTarget({
    orgId: params.orgId,
    docId: params.docId,
    userId: params.actorUserId ?? undefined,
  });

  if (!target) {
    throw new NotFoundError("Shipping bill document not found.");
  }

  // Idempotent guard: already finished docs are skipped unless explicitly forced
  if (!params.force && (target.parseStatus === "done" || target.parseStatus === "needs_review")) {
    const existingSbId = await findShippingBillIdByDocId(target.docId);
    return {
      docId: target.docId,
      parseStatus: target.parseStatus,
      shippingBillId: existingSbId,
      parseError: null,
    };
  }

  const nextAttempt = target.parseAttempts + 1;
  const runId = crypto.randomUUID();
  const dbClient = isPgliteTestAdapterEnabled()
    ? await (await import("@/lib/auth/pglite-adapter")).getPgliteDb()
    : null;

  if (dbClient) {
    await dbClient.query(
      `update public.documents
       set parse_status = 'parsing', parse_attempts = $2, parse_error = null, updated_at = now()
       where id = $1`,
      [target.docId, nextAttempt]
    );
    await dbClient.query(
      `insert into public.document_parse_runs (id, document_id, attempt_no, strategy, status)
       values ($1, $2, $3, 'deterministic', 'running')`,
      [runId, target.docId, nextAttempt]
    );
  } else {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("documents")
      .update({
        parse_status: "parsing",
        parse_attempts: nextAttempt,
        parse_error: null,
      })
      .eq("id", target.docId);
    await admin.from("document_parse_runs").insert({
      id: runId,
      document_id: target.docId,
      attempt_no: nextAttempt,
      strategy: "deterministic",
      status: "running",
    });
  }

  try {
    const rawBuffer = await readStorageObjectBytes(target.storagePath);
    const result = await runShippingBillParsePipeline({
      pdfBytes: new Uint8Array(rawBuffer),
      aiParsingEnabled: target.aiParsingEnabled,
      alreadySpentAiPaise: target.aiCostPaise,
    });

    const sbNumber =
      result.draft.sbNumber && /^\d{6,8}$/.test(result.draft.sbNumber)
        ? result.draft.sbNumber
        : `REV-${target.docId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const sbDate = result.draft.sbDate ?? getTodayKolkataIso();
    const portCode = result.draft.portCode ?? "INXXXX";
    const currency = result.draft.currency ?? "USD";
    const fobMinor = result.draft.fobMinor ?? 0;
    const sbStatus: ShippingBillStatus = result.finalStatus === "done" ? "parsed" : "needs_review";
    const confirmedAt = result.finalStatus === "done" ? new Date().toISOString() : null;
    const newTotalAiCost = target.aiCostPaise + result.aiCostPaise;

    let savedSbId: string | null = null;

    if (dbClient) {
      // Check if another document on the same IEC already claimed this sb_number
      if (!sbNumber.startsWith("REV-")) {
        const collision = await dbClient.query<{ id: string; document_id: string | null }>(
          `select id, document_id from public.shipping_bills
           where iec_id = $1 and sb_number = $2 and (document_id is null or document_id <> $3)`,
          [target.iecId, sbNumber, target.docId]
        );
        if (collision.rows[0]) {
          const msg = `Shipping Bill #${sbNumber} already exists for this IEC.`;
          await dbClient.query(
            `update public.documents
             set parse_status = 'failed', parse_error = $2, next_retry_at = null, updated_at = now()
             where id = $1`,
            [target.docId, msg]
          );
          await dbClient.query(
            `update public.document_parse_runs
             set status = 'failed', error = $2, updated_at = now()
             where id = $1`,
            [runId, msg]
          );
          return {
            docId: target.docId,
            parseStatus: "failed",
            shippingBillId: collision.rows[0].id,
            parseError: msg,
          };
        }
      }

      const existingForDoc = await dbClient.query<{ id: string }>(
        `select id from public.shipping_bills where document_id = $1 limit 1`,
        [target.docId]
      );
      if (existingForDoc.rows[0]) {
        savedSbId = existingForDoc.rows[0].id;
        await dbClient.query(
          `update public.shipping_bills
           set sb_number = $2, sb_date = $3, port_code = $4, leo_date = $5,
               invoice_no = $6, buyer_name = $7, currency = $8, fob_minor = $9,
               exchange_rate = $10, schemes_claimed = $11, status = $12,
               field_confidence = $13::jsonb, source_text_pages = $14::jsonb,
               needs_review_fields = $15, used_ocr_fallback = $16,
               ai_cost_paise = $17, confidence_confirmed_at = $18, updated_at = now()
           where id = $1`,
          [
            savedSbId,
            sbNumber,
            sbDate,
            portCode,
            result.draft.leoDate,
            result.draft.invoiceNo,
            result.draft.buyerName,
            currency,
            fobMinor,
            result.draft.exchangeRate,
            result.draft.schemesClaimed,
            sbStatus,
            JSON.stringify(result.draft.fieldConfidence),
            JSON.stringify(result.pageTexts),
            result.validation.needsReviewFields,
            result.usedOcrFallback,
            newTotalAiCost,
            confirmedAt,
          ]
        );
        await dbClient.query(`delete from public.shipping_bill_items where shipping_bill_id = $1`, [
          savedSbId,
        ]);
      } else {
        savedSbId = crypto.randomUUID();
        await dbClient.query(
          `insert into public.shipping_bills
             (id, iec_id, document_id, sb_number, sb_date, port_code, leo_date,
              invoice_no, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed,
              status, field_confidence, source_text_pages, needs_review_fields,
              used_ocr_fallback, ai_cost_paise, confidence_confirmed_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20)`,
          [
            savedSbId,
            target.iecId,
            target.docId,
            sbNumber,
            sbDate,
            portCode,
            result.draft.leoDate,
            result.draft.invoiceNo,
            result.draft.buyerName,
            currency,
            fobMinor,
            result.draft.exchangeRate,
            result.draft.schemesClaimed,
            sbStatus,
            JSON.stringify(result.draft.fieldConfidence),
            JSON.stringify(result.pageTexts),
            result.validation.needsReviewFields,
            result.usedOcrFallback,
            newTotalAiCost,
            confirmedAt,
          ]
        );
      }

      for (const item of result.draft.items) {
        await dbClient.query(
          `insert into public.shipping_bill_items
             (shipping_bill_id, hs_code, description, quantity, uqc, fob_minor, field_confidence)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            savedSbId,
            item.hsCode,
            item.description,
            item.quantity,
            item.uqc,
            item.fobMinor,
            JSON.stringify(item.fieldConfidence),
          ]
        );
      }

      await dbClient.query(
        `update public.documents
         set parse_status = $2, ai_cost_paise = $3, last_parsed_at = now(), next_retry_at = null, updated_at = now()
         where id = $1`,
        [target.docId, result.finalStatus, newTotalAiCost]
      );
      await dbClient.query(
        `update public.document_parse_runs
         set strategy = $2, ai_tokens = $3, ai_cost_paise = $4, status = $5, updated_at = now()
         where id = $1`,
        [runId, result.strategy, result.aiTokensUsed, result.aiCostPaise, result.finalStatus]
      );
      await dbClient.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'update', 'shipping_bills', $3, $4::jsonb)`,
        [
          target.orgId,
          params.actorUserId ?? null,
          savedSbId,
          JSON.stringify({
            parseStatus: result.finalStatus,
            needsReviewCount: result.validation.needsReviewFields.length,
            strategy: result.strategy,
          }),
        ]
      );
    } else {
      const admin = createSupabaseServiceRoleClient();

      if (!sbNumber.startsWith("REV-")) {
        const { data: collision } = await admin
          .from("shipping_bills")
          .select("id, document_id")
          .eq("iec_id", target.iecId)
          .eq("sb_number", sbNumber)
          .neq("document_id", target.docId)
          .maybeSingle();

        if (collision) {
          const msg = `Shipping Bill #${sbNumber} already exists for this IEC.`;
          await admin
            .from("documents")
            .update({ parse_status: "failed", parse_error: msg, next_retry_at: null })
            .eq("id", target.docId);
          await admin
            .from("document_parse_runs")
            .update({ status: "failed", error: msg })
            .eq("id", runId);
          return {
            docId: target.docId,
            parseStatus: "failed",
            shippingBillId: collision.id,
            parseError: msg,
          };
        }
      }

      const { data: existingSb } = await admin
        .from("shipping_bills")
        .select("id")
        .eq("document_id", target.docId)
        .maybeSingle();

      const sbPayload = {
        iec_id: target.iecId,
        document_id: target.docId,
        sb_number: sbNumber,
        sb_date: sbDate,
        port_code: portCode,
        leo_date: result.draft.leoDate,
        invoice_no: result.draft.invoiceNo,
        buyer_name: result.draft.buyerName,
        currency,
        fob_minor: fobMinor,
        exchange_rate: result.draft.exchangeRate,
        schemes_claimed: result.draft.schemesClaimed,
        status: sbStatus,
        field_confidence: result.draft.fieldConfidence as unknown as Json,
        source_text_pages: result.pageTexts as unknown as Json,
        needs_review_fields: result.validation.needsReviewFields,
        used_ocr_fallback: result.usedOcrFallback,
        ai_cost_paise: newTotalAiCost,
        confidence_confirmed_at: confirmedAt,
      };

      if (existingSb) {
        savedSbId = existingSb.id;
        await admin.from("shipping_bills").update(sbPayload).eq("id", savedSbId);
        await admin.from("shipping_bill_items").delete().eq("shipping_bill_id", savedSbId);
      } else {
        const { data: insertedSb } = await admin
          .from("shipping_bills")
          .insert(sbPayload)
          .select("id")
          .single();
        savedSbId = insertedSb?.id ?? null;
      }

      if (savedSbId && result.draft.items.length > 0) {
        await admin.from("shipping_bill_items").insert(
          result.draft.items.map((item) => ({
            shipping_bill_id: savedSbId!,
            hs_code: item.hsCode,
            description: item.description,
            quantity: item.quantity,
            uqc: item.uqc,
            fob_minor: item.fobMinor,
            field_confidence: item.fieldConfidence as unknown as Json,
          }))
        );
      }

      await admin
        .from("documents")
        .update({
          parse_status: result.finalStatus,
          ai_cost_paise: newTotalAiCost,
          last_parsed_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq("id", target.docId);

      await admin
        .from("document_parse_runs")
        .update({
          strategy: result.strategy,
          ai_tokens: result.aiTokensUsed,
          ai_cost_paise: result.aiCostPaise,
          status: result.finalStatus,
        })
        .eq("id", runId);

      if (savedSbId) {
        await admin.from("audit_log").insert({
          org_id: target.orgId,
          actor_id: params.actorUserId ?? null,
          action: "update",
          entity: "shipping_bills",
          entity_id: savedSbId,
          diff: {
            parseStatus: result.finalStatus,
            needsReviewCount: result.validation.needsReviewFields.length,
            strategy: result.strategy,
          },
        });
      }
    }

    return {
      docId: target.docId,
      parseStatus: result.finalStatus,
      shippingBillId: savedSbId,
      parseError: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not parse shipping bill PDF.";
    const retryDelaySeconds = Math.pow(2, Math.min(nextAttempt, 4)) * 30;
    const nextRetryAt =
      nextAttempt < 3 ? new Date(Date.now() + retryDelaySeconds * 1000).toISOString() : null;

    if (dbClient) {
      await dbClient.query(
        `update public.documents
         set parse_status = 'failed', parse_error = $2, next_retry_at = $3, updated_at = now()
         where id = $1`,
        [target.docId, msg, nextRetryAt]
      );
      await dbClient.query(
        `update public.document_parse_runs
         set status = 'failed', error = $2, updated_at = now()
         where id = $1`,
        [runId, msg]
      );
    } else {
      const admin = createSupabaseServiceRoleClient();
      await admin
        .from("documents")
        .update({ parse_status: "failed", parse_error: msg, next_retry_at: nextRetryAt })
        .eq("id", target.docId);
      await admin
        .from("document_parse_runs")
        .update({ status: "failed", error: msg })
        .eq("id", runId);
    }

    return {
      docId: target.docId,
      parseStatus: "failed",
      shippingBillId: null,
      parseError: msg,
    };
  }
}

async function findShippingBillIdByDocId(docId: string): Promise<string | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{ id: string }>(
      `select id from public.shipping_bills where document_id = $1 limit 1`,
      [docId]
    );
    return res.rows[0]?.id ?? null;
  }
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from("shipping_bills")
    .select("id")
    .eq("document_id", docId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getOrgDocumentBatchSummary(orgId: string): Promise<DocumentBatchSummary> {
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{ parse_status: DocumentParseStatus; count: string }>(
      `select d.parse_status, count(*)::text as count
       from public.documents d
       join public.iec_profiles p on p.id = d.iec_id
       where p.org_id = $1 and d.deleted_at is null and d.kind = 'shipping_bill'
       group by d.parse_status`,
      [orgId]
    );
    const counts: Record<string, number> = {};
    for (const row of res.rows) {
      counts[row.parse_status] = Number(row.count);
    }
    const sbRes = await db.query<{ id: string }>(
      `select sb.id
       from public.shipping_bills sb
       join public.iec_profiles p on p.id = sb.iec_id
       where p.org_id = $1 and sb.status = 'needs_review'
       order by sb.updated_at desc limit 1`,
      [orgId]
    );
    const parsedCount = counts.done ?? 0;
    const needsReviewCount = counts.needs_review ?? 0;
    const failedCount = counts.failed ?? 0;
    const queuedCount = (counts.queued ?? 0) + (counts.parsing ?? 0);
    return {
      totalShippingBills: parsedCount + needsReviewCount + failedCount + queuedCount,
      parsedCount,
      needsReviewCount,
      failedCount,
      queuedCount,
      latestNeedsReviewSbId: sbRes.rows[0]?.id ?? null,
    };
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("parse_status, iec_profiles!inner(org_id)")
    .eq("iec_profiles.org_id", orgId)
    .eq("kind", "shipping_bill")
    .is("deleted_at", null);

  let parsedCount = 0;
  let needsReviewCount = 0;
  let failedCount = 0;
  let queuedCount = 0;
  for (const row of docs ?? []) {
    if (row.parse_status === "done") parsedCount += 1;
    else if (row.parse_status === "needs_review") needsReviewCount += 1;
    else if (row.parse_status === "failed") failedCount += 1;
    else queuedCount += 1;
  }

  const { data: latestSb } = await supabase
    .from("shipping_bills")
    .select("id, iec_profiles!inner(org_id)")
    .eq("iec_profiles.org_id", orgId)
    .eq("status", "needs_review")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    totalShippingBills: parsedCount + needsReviewCount + failedCount + queuedCount,
    parsedCount,
    needsReviewCount,
    failedCount,
    queuedCount,
    latestNeedsReviewSbId: latestSb?.id ?? null,
  };
}

export async function parsePendingDocumentsForOrg(params: {
  orgId: string;
  limit?: number;
  skipAuth?: boolean;
}): Promise<{
  processedCount: number;
  summary: DocumentBatchSummary;
}> {
  let actorUserId: string | null = null;
  if (!params.skipAuth) {
    const access = await requireOrgAccess(params.orgId, "member");
    actorUserId = access.user.id;
  }

  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  let docIds: string[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{ id: string }>(
      `select d.id
       from public.documents d
       join public.iec_profiles p on p.id = d.iec_id
       where p.org_id = $1
         and d.deleted_at is null
         and d.kind = 'shipping_bill'
         and (
           d.parse_status = 'queued'
           or (
             d.parse_status = 'failed'
             and d.parse_attempts < 3
             and (d.next_retry_at is null or d.next_retry_at <= now())
           )
         )
       order by d.created_at asc
       limit $2`,
      [params.orgId, limit]
    );
    docIds = res.rows.map((r) => r.id);
  } else {
    const admin = createSupabaseServiceRoleClient();
    const { data } = await admin
      .from("documents")
      .select("id, iec_profiles!inner(org_id)")
      .eq("iec_profiles.org_id", params.orgId)
      .eq("kind", "shipping_bill")
      .eq("parse_status", "queued")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    docIds = (data ?? []).map((r) => r.id);
  }

  for (const docId of docIds) {
    await parseDocumentById({
      orgId: params.orgId,
      docId,
      actorUserId,
    });
  }

  const summary = await getOrgDocumentBatchSummary(params.orgId);
  return {
    processedCount: docIds.length,
    summary,
  };
}

export async function processScheduledPendingDocuments(limit = 50): Promise<{
  processedCount: number;
}> {
  let targets: Array<{ id: string; org_id: string }> = [];
  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{ id: string; org_id: string }>(
      `select d.id, p.org_id
       from public.documents d
       join public.iec_profiles p on p.id = d.iec_id
       where d.deleted_at is null
         and d.kind = 'shipping_bill'
         and (
           d.parse_status = 'queued'
           or (
             d.parse_status = 'failed'
             and d.parse_attempts < 3
             and (d.next_retry_at is null or d.next_retry_at <= now())
           )
         )
       order by d.created_at asc
       limit $1`,
      [limit]
    );
    targets = res.rows;
  } else {
    const admin = createSupabaseServiceRoleClient();
    const { data } = await admin
      .from("documents")
      .select("id, iec_profiles!inner(org_id)")
      .eq("kind", "shipping_bill")
      .eq("parse_status", "queued")
      .is("deleted_at", null)
      .limit(limit);
    targets = (data ?? []).map((r) => {
      const iec = Array.isArray(r.iec_profiles) ? r.iec_profiles[0] : r.iec_profiles;
      return { id: r.id, org_id: iec?.org_id ?? "" };
    });
  }

  let processed = 0;
  for (const target of targets) {
    if (!target.org_id) continue;
    await parseDocumentById({ orgId: target.org_id, docId: target.id, actorUserId: null });
    processed += 1;
  }
  return { processedCount: processed };
}

export async function listShippingBillsForOrg(params: {
  orgId: string;
  iecId?: string | null;
  statusFilter?: string;
}): Promise<{ shippingBills: ShippingBillListRow[]; summary: DocumentBatchSummary }> {
  const access = await requireOrgAccess(params.orgId, "viewer");
  let rows: ShippingBillListRow[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    rows = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        iec_id: string;
        iec_code: string;
        document_id: string | null;
        document_name: string | null;
        sb_number: string;
        sb_date: string;
        port_code: string;
        leo_date: string | null;
        invoice_no: string | null;
        buyer_name: string | null;
        currency: string;
        fob_minor: string | number;
        exchange_rate: string | null;
        schemes_claimed: string[];
        status: ShippingBillStatus;
        needs_review_fields: string[];
        used_ocr_fallback: boolean;
        ai_cost_paise: number;
        confidence_confirmed_at: string | null;
        created_at: string;
      }>(
        `select sb.id, sb.iec_id, p.iec_code, sb.document_id, d.original_name as document_name,
                sb.sb_number, sb.sb_date::text, sb.port_code, sb.leo_date::text,
                sb.invoice_no, sb.buyer_name, sb.currency, sb.fob_minor, sb.exchange_rate::text,
                sb.schemes_claimed, sb.status, sb.needs_review_fields, sb.used_ocr_fallback,
                sb.ai_cost_paise, sb.confidence_confirmed_at::text, sb.created_at::text
         from public.shipping_bills sb
         join public.iec_profiles p on p.id = sb.iec_id
         left join public.documents d on d.id = sb.document_id
         where p.org_id = $1
         order by sb.sb_date desc, sb.created_at desc`,
        [access.orgId]
      );

      return res.rows.map((r) => ({
        id: r.id,
        iecId: r.iec_id,
        iecCode: r.iec_code,
        documentId: r.document_id,
        documentName: r.document_name,
        sbNumber: r.sb_number,
        sbDate: r.sb_date,
        portCode: r.port_code,
        leoDate: r.leo_date,
        invoiceNo: r.invoice_no,
        buyerName: r.buyer_name,
        currency: r.currency,
        fobMinor: Number(r.fob_minor),
        exchangeRate: r.exchange_rate,
        schemesClaimed: r.schemes_claimed ?? [],
        status: r.status,
        needsReviewFields: r.needs_review_fields ?? [],
        usedOcrFallback: r.used_ocr_fallback,
        aiCostPaise: r.ai_cost_paise,
        confidenceConfirmedAt: r.confidence_confirmed_at,
        calculationEligible: isShippingBillCalculationEligible({
          status: r.status,
          needsReviewFields: r.needs_review_fields ?? [],
          confidenceConfirmedAt: r.confidence_confirmed_at,
        }),
        createdAt: r.created_at,
      }));
    });
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("shipping_bills")
      .select(
        "id, iec_id, document_id, sb_number, sb_date, port_code, leo_date, invoice_no, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, needs_review_fields, used_ocr_fallback, ai_cost_paise, confidence_confirmed_at, created_at, iec_profiles!inner(org_id, iec_code), documents(original_name)"
      )
      .eq("iec_profiles.org_id", access.orgId)
      .order("sb_date", { ascending: false });

    rows = (data ?? []).map((r) => {
      const iec = Array.isArray(r.iec_profiles) ? r.iec_profiles[0] : r.iec_profiles;
      const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
      return {
        id: r.id,
        iecId: r.iec_id,
        iecCode: iec?.iec_code ?? "",
        documentId: r.document_id,
        documentName: doc?.original_name ?? null,
        sbNumber: r.sb_number,
        sbDate: r.sb_date,
        portCode: r.port_code,
        leoDate: r.leo_date,
        invoiceNo: r.invoice_no,
        buyerName: r.buyer_name,
        currency: r.currency,
        fobMinor: Number(r.fob_minor),
        exchangeRate: r.exchange_rate,
        schemesClaimed: r.schemes_claimed ?? [],
        status: r.status,
        needsReviewFields: r.needs_review_fields ?? [],
        usedOcrFallback: r.used_ocr_fallback,
        aiCostPaise: r.ai_cost_paise,
        confidenceConfirmedAt: r.confidence_confirmed_at,
        calculationEligible: isShippingBillCalculationEligible({
          status: r.status,
          needsReviewFields: r.needs_review_fields ?? [],
          confidenceConfirmedAt: r.confidence_confirmed_at,
        }),
        createdAt: r.created_at,
      };
    });
  }

  const filtered = rows.filter((row) => {
    if (params.iecId && row.iecId !== params.iecId) return false;
    if (
      params.statusFilter &&
      params.statusFilter !== "all" &&
      row.status !== params.statusFilter
    ) {
      return false;
    }
    return true;
  });

  const summary = await getOrgDocumentBatchSummary(access.orgId);
  return { shippingBills: filtered, summary };
}

export async function getShippingBillForReview(params: {
  orgId: string;
  sbId: string;
}): Promise<ShippingBillReviewDetail> {
  const access = await requireOrgAccess(params.orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const sbRes = await tx.query<{
        id: string;
        org_id: string;
        ai_parsing_enabled: boolean;
        iec_id: string;
        iec_code: string;
        document_id: string | null;
        document_name: string | null;
        sb_number: string;
        sb_date: string;
        port_code: string;
        leo_date: string | null;
        invoice_no: string | null;
        buyer_name: string | null;
        currency: string;
        fob_minor: string | number;
        exchange_rate: string | null;
        schemes_claimed: string[];
        status: ShippingBillStatus;
        field_confidence: Json;
        source_text_pages: Json;
        needs_review_fields: string[];
        used_ocr_fallback: boolean;
        ai_cost_paise: number;
        confidence_confirmed_at: string | null;
        created_at: string;
      }>(
        `select sb.id, p.org_id, o.ai_parsing_enabled, sb.iec_id, p.iec_code,
                sb.document_id, d.original_name as document_name, sb.sb_number, sb.sb_date::text,
                sb.port_code, sb.leo_date::text, sb.invoice_no, sb.buyer_name, sb.currency,
                sb.fob_minor, sb.exchange_rate::text, sb.schemes_claimed, sb.status,
                sb.field_confidence, sb.source_text_pages, sb.needs_review_fields,
                sb.used_ocr_fallback, sb.ai_cost_paise, sb.confidence_confirmed_at::text, sb.created_at::text
         from public.shipping_bills sb
         join public.iec_profiles p on p.id = sb.iec_id
         join public.organizations o on o.id = p.org_id
         left join public.documents d on d.id = sb.document_id
         where sb.id = $1 and p.org_id = $2`,
        [params.sbId, access.orgId]
      );
      const sb = sbRes.rows[0];
      if (!sb) throw new NotFoundError("Shipping Bill not found.");

      const itemsRes = await tx.query<{
        id: string;
        hs_code: string;
        description: string;
        quantity: string;
        uqc: string;
        fob_minor: string | number;
        field_confidence: Json;
      }>(
        `select id, hs_code, description, quantity::text, uqc, fob_minor, field_confidence
         from public.shipping_bill_items
         where shipping_bill_id = $1
         order by created_at asc`,
        [sb.id]
      );

      const corrRes = await tx.query<{
        id: string;
        field_name: string;
        old_value: string | null;
        new_value: string | null;
        old_confidence: string | null;
        page_number: number | null;
        created_at: string;
      }>(
        `select id, field_name, old_value, new_value, old_confidence::text, page_number, created_at::text
         from public.shipping_bill_corrections
         where shipping_bill_id = $1
         order by created_at desc
         limit 50`,
        [sb.id]
      );

      return {
        id: sb.id,
        orgId: sb.org_id,
        aiParsingEnabled: sb.ai_parsing_enabled,
        iecId: sb.iec_id,
        iecCode: sb.iec_code,
        documentId: sb.document_id,
        documentName: sb.document_name,
        sbNumber: sb.sb_number,
        sbDate: sb.sb_date,
        portCode: sb.port_code,
        leoDate: sb.leo_date,
        invoiceNo: sb.invoice_no,
        buyerName: sb.buyer_name,
        currency: sb.currency,
        fobMinor: Number(sb.fob_minor),
        exchangeRate: sb.exchange_rate,
        schemesClaimed: sb.schemes_claimed ?? [],
        status: sb.status,
        needsReviewFields: sb.needs_review_fields ?? [],
        usedOcrFallback: sb.used_ocr_fallback,
        aiCostPaise: sb.ai_cost_paise,
        confidenceConfirmedAt: sb.confidence_confirmed_at,
        calculationEligible: isShippingBillCalculationEligible({
          status: sb.status,
          needsReviewFields: sb.needs_review_fields ?? [],
          confidenceConfirmedAt: sb.confidence_confirmed_at,
        }),
        createdAt: sb.created_at,
        fieldConfidence: safeRecord(sb.field_confidence),
        sourceTextPages: safePages(sb.source_text_pages),
        items: itemsRes.rows.map((it) => ({
          id: it.id,
          hsCode: it.hs_code,
          description: it.description,
          quantity: it.quantity,
          uqc: it.uqc,
          fobMinor: Number(it.fob_minor),
          fieldConfidence: safeRecord(it.field_confidence),
        })),
        corrections: corrRes.rows.map((c) => ({
          id: c.id,
          fieldName: c.field_name,
          oldValue: c.old_value,
          newValue: c.new_value,
          oldConfidence: c.old_confidence ? Number(c.old_confidence) : null,
          pageNumber: c.page_number,
          createdAt: c.created_at,
        })),
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: sb } = await supabase
    .from("shipping_bills")
    .select(
      "id, iec_id, document_id, sb_number, sb_date, port_code, leo_date, invoice_no, buyer_name, currency, fob_minor, exchange_rate, schemes_claimed, status, field_confidence, source_text_pages, needs_review_fields, used_ocr_fallback, ai_cost_paise, confidence_confirmed_at, created_at, iec_profiles!inner(org_id, iec_code, organizations!inner(ai_parsing_enabled)), documents(original_name)"
    )
    .eq("id", params.sbId)
    .eq("iec_profiles.org_id", access.orgId)
    .maybeSingle();

  if (!sb) throw new NotFoundError("Shipping Bill not found.");
  const iec = Array.isArray(sb.iec_profiles) ? sb.iec_profiles[0] : sb.iec_profiles;
  const org = iec
    ? Array.isArray(iec.organizations)
      ? iec.organizations[0]
      : iec.organizations
    : null;
  const doc = Array.isArray(sb.documents) ? sb.documents[0] : sb.documents;

  const [{ data: itemRows }, { data: corrRows }] = await Promise.all([
    supabase
      .from("shipping_bill_items")
      .select("id, hs_code, description, quantity, uqc, fob_minor, field_confidence")
      .eq("shipping_bill_id", sb.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("shipping_bill_corrections")
      .select("id, field_name, old_value, new_value, old_confidence, page_number, created_at")
      .eq("shipping_bill_id", sb.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    id: sb.id,
    orgId: iec?.org_id ?? access.orgId,
    aiParsingEnabled: org?.ai_parsing_enabled ?? true,
    iecId: sb.iec_id,
    iecCode: iec?.iec_code ?? "",
    documentId: sb.document_id,
    documentName: doc?.original_name ?? null,
    sbNumber: sb.sb_number,
    sbDate: sb.sb_date,
    portCode: sb.port_code,
    leoDate: sb.leo_date,
    invoiceNo: sb.invoice_no,
    buyerName: sb.buyer_name,
    currency: sb.currency,
    fobMinor: Number(sb.fob_minor),
    exchangeRate: sb.exchange_rate,
    schemesClaimed: sb.schemes_claimed ?? [],
    status: sb.status,
    needsReviewFields: sb.needs_review_fields ?? [],
    usedOcrFallback: sb.used_ocr_fallback,
    aiCostPaise: sb.ai_cost_paise,
    confidenceConfirmedAt: sb.confidence_confirmed_at,
    calculationEligible: isShippingBillCalculationEligible({
      status: sb.status,
      needsReviewFields: sb.needs_review_fields ?? [],
      confidenceConfirmedAt: sb.confidence_confirmed_at,
    }),
    createdAt: sb.created_at,
    fieldConfidence: safeRecord(sb.field_confidence),
    sourceTextPages: safePages(sb.source_text_pages),
    items: (itemRows ?? []).map((it) => ({
      id: it.id,
      hsCode: it.hs_code,
      description: it.description,
      quantity: String(it.quantity),
      uqc: it.uqc,
      fobMinor: Number(it.fob_minor),
      fieldConfidence: safeRecord(it.field_confidence),
    })),
    corrections: (corrRows ?? []).map((c) => ({
      id: c.id,
      fieldName: c.field_name,
      oldValue: c.old_value,
      newValue: c.new_value,
      oldConfidence: c.old_confidence ? Number(c.old_confidence) : null,
      pageNumber: c.page_number,
      createdAt: c.created_at,
    })),
  };
}

export async function confirmAndSaveShippingBillReview(params: {
  orgId: string;
  sbId: string;
  input: ConfirmShippingBillReviewInput;
}): Promise<ShippingBillReviewDetail> {
  const access = await requireOrgAccess(params.orgId, "member");
  const existing = await getShippingBillForReview({
    orgId: access.orgId,
    sbId: params.sbId,
  });

  const billFobMinor = parseDecimalMoneyToMinorUnits(params.input.fobAmount);
  if (billFobMinor === null || billFobMinor <= 0) {
    throw new ValidationError("Total FOB must be a valid positive decimal value.");
  }

  const confirmedSet = new Set(params.input.confirmedFields);
  const nextBillConfidence: Record<string, FieldConfidenceEntry> = { ...existing.fieldConfidence };
  const correctionsToInsert: Array<{
    fieldName: string;
    shippingBillItemId: string | null;
    oldValue: string | null;
    newValue: string | null;
    oldConfidence: number | null;
    sourceSnippet: string | null;
    pageNumber: number | null;
  }> = [];

  const trackBillField = (fieldKey: string, oldVal: string | null, newVal: string | null) => {
    const prev = nextBillConfidence[fieldKey] ?? {
      confidence: 0,
      source: null,
      method: "deterministic" as const,
      confirmed: false,
      warnings: [],
    };
    const changed = (oldVal ?? "") !== (newVal ?? "");
    if (changed) {
      correctionsToInsert.push({
        fieldName: fieldKey,
        shippingBillItemId: null,
        oldValue: oldVal,
        newValue: newVal,
        oldConfidence: prev.confidence ?? null,
        sourceSnippet: prev.source?.snippet ?? null,
        pageNumber: prev.source?.page ?? null,
      });
    }
    const shouldConfirm = params.input.confirmAll || confirmedSet.has(fieldKey) || changed;
    nextBillConfidence[fieldKey] = {
      ...prev,
      confidence: shouldConfirm ? 1.0 : prev.confidence,
      method: changed ? "manual" : prev.method,
      confirmed: prev.confirmed || shouldConfirm,
      warnings: shouldConfirm ? [] : prev.warnings,
    };
  };

  trackBillField("sbNumber", existing.sbNumber, params.input.sbNumber);
  trackBillField("sbDate", existing.sbDate, params.input.sbDate);
  trackBillField("portCode", existing.portCode, params.input.portCode);
  trackBillField("leoDate", existing.leoDate, params.input.leoDate ?? null);
  trackBillField("invoiceNo", existing.invoiceNo, params.input.invoiceNo);
  trackBillField("buyerName", existing.buyerName, params.input.buyerName);
  trackBillField("currency", existing.currency, params.input.currency);
  trackBillField(
    "fobMinor",
    formatMinorUnitsToDecimal(existing.fobMinor),
    formatMinorUnitsToDecimal(billFobMinor)
  );
  trackBillField("exchangeRate", existing.exchangeRate, params.input.exchangeRate ?? null);
  trackBillField(
    "schemesClaimed",
    existing.schemesClaimed.join(","),
    params.input.schemesClaimed.join(",")
  );

  // Also confirm "items" container marker if present
  if (nextBillConfidence.items) {
    nextBillConfidence.items = {
      ...nextBillConfidence.items,
      confidence: 1.0,
      confirmed: true,
      warnings: [],
    };
  }

  const nextItems = params.input.items.map((item, idx) => {
    const itemFobMinor = parseDecimalMoneyToMinorUnits(item.fobAmount);
    if (itemFobMinor === null || itemFobMinor <= 0) {
      throw new ValidationError(`Item #${idx + 1} FOB must be positive.`);
    }

    const oldItem =
      (item.id ? existing.items.find((x) => x.id === item.id) : undefined) ?? existing.items[idx];
    const nextItemConfidence: Record<string, FieldConfidenceEntry> = {
      ...(oldItem?.fieldConfidence ?? {}),
    };

    const trackItemSub = (subKey: string, oldVal: string | null, newVal: string | null) => {
      const prev = nextItemConfidence[subKey] ?? {
        confidence: 0.9,
        source: null,
        method: "deterministic" as const,
        confirmed: false,
        warnings: [],
      };
      const changed = (oldVal ?? "") !== (newVal ?? "");
      if (changed) {
        correctionsToInsert.push({
          fieldName: `items.${subKey}`,
          shippingBillItemId: oldItem?.id ?? null,
          oldValue: oldVal,
          newValue: newVal,
          oldConfidence: prev.confidence ?? null,
          sourceSnippet: prev.source?.snippet ?? null,
          pageNumber: prev.source?.page ?? null,
        });
      }
      const key = `items[${idx}].${subKey}`;
      const shouldConfirm = params.input.confirmAll || confirmedSet.has(key) || changed;
      nextItemConfidence[subKey] = {
        ...prev,
        confidence: shouldConfirm ? 1.0 : prev.confidence,
        method: changed ? "manual" : prev.method,
        confirmed: prev.confirmed || shouldConfirm,
        warnings: shouldConfirm ? [] : prev.warnings,
      };
    };

    trackItemSub("hsCode", oldItem?.hsCode ?? null, item.hsCode);
    trackItemSub("description", oldItem?.description ?? null, item.description);
    trackItemSub("quantity", oldItem?.quantity ?? null, item.quantity);
    trackItemSub("uqc", oldItem?.uqc ?? null, item.uqc);
    trackItemSub(
      "fobMinor",
      oldItem ? formatMinorUnitsToDecimal(oldItem.fobMinor) : null,
      formatMinorUnitsToDecimal(itemFobMinor)
    );

    return {
      hsCode: item.hsCode,
      description: item.description,
      quantity: item.quantity,
      uqc: item.uqc,
      fobMinor: itemFobMinor,
      fieldConfidence: nextItemConfidence,
    };
  });

  // Re-validate updated draft respecting human confirmations
  const updatedDraft: ParsedShippingBillDraft = {
    sbNumber: params.input.sbNumber,
    sbDate: params.input.sbDate,
    portCode: params.input.portCode,
    leoDate: params.input.leoDate ?? null,
    invoiceNo: params.input.invoiceNo,
    buyerName: params.input.buyerName,
    currency: params.input.currency,
    fobMinor: billFobMinor,
    exchangeRate: params.input.exchangeRate ?? null,
    schemesClaimed: params.input.schemesClaimed as IncentiveScheme[],
    items: nextItems,
    fieldConfidence: nextBillConfidence,
  };

  const revalidated = validateShippingBillDraft(updatedDraft);
  if (revalidated.validationErrors.includes("fobSumMismatch")) {
    throw new ValidationError(
      nextBillConfidence.fobMinor?.warnings.join(" ") ||
        "Sum of item FOB values must match Total FOB within rounding tolerance."
    );
  }

  const remainingReviewFields = params.input.confirmAll ? [] : revalidated.needsReviewFields;
  const isFullyConfirmed =
    remainingReviewFields.length === 0 && params.input.confirmAll
      ? true
      : remainingReviewFields.length === 0;
  const nextStatus: ShippingBillStatus = isFullyConfirmed
    ? existing.status === "needs_review" || existing.status === "queued"
      ? "parsed"
      : existing.status
    : "needs_review";
  const nextDocStatus: DocumentParseStatus = isFullyConfirmed ? "done" : "needs_review";
  const confirmedAt = isFullyConfirmed ? new Date().toISOString() : null;
  const confirmedBy = isFullyConfirmed ? access.user.id : null;

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      await tx.query(
        `update public.shipping_bills
         set sb_number = $2, sb_date = $3, port_code = $4, leo_date = $5,
             invoice_no = $6, buyer_name = $7, currency = $8, fob_minor = $9,
             exchange_rate = $10, schemes_claimed = $11, status = $12,
             field_confidence = $13::jsonb, needs_review_fields = $14,
             confidence_confirmed_at = $15, confidence_confirmed_by = $16,
             updated_at = now()
         where id = $1`,
        [
          existing.id,
          params.input.sbNumber,
          params.input.sbDate,
          params.input.portCode,
          params.input.leoDate ?? null,
          params.input.invoiceNo,
          params.input.buyerName,
          params.input.currency,
          billFobMinor,
          params.input.exchangeRate ?? null,
          params.input.schemesClaimed,
          nextStatus,
          JSON.stringify(nextBillConfidence),
          remainingReviewFields,
          confirmedAt,
          confirmedBy,
        ]
      );

      await tx.query(`delete from public.shipping_bill_items where shipping_bill_id = $1`, [
        existing.id,
      ]);
      for (const item of nextItems) {
        await tx.query(
          `insert into public.shipping_bill_items
             (shipping_bill_id, hs_code, description, quantity, uqc, fob_minor, field_confidence)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            existing.id,
            item.hsCode,
            item.description,
            item.quantity,
            item.uqc,
            item.fobMinor,
            JSON.stringify(item.fieldConfidence),
          ]
        );
      }

      if (existing.documentId) {
        await tx.query(
          `update public.documents set parse_status = $2, updated_at = now() where id = $1`,
          [existing.documentId, nextDocStatus]
        );
      }

      for (const corr of correctionsToInsert) {
        await tx.query(
          `insert into public.shipping_bill_corrections
             (org_id, iec_id, shipping_bill_id, document_id, field_name, old_value, new_value, old_confidence, source_snippet, page_number, corrected_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            access.orgId,
            existing.iecId,
            existing.id,
            existing.documentId,
            corr.fieldName,
            corr.oldValue,
            corr.newValue,
            corr.oldConfidence,
            corr.sourceSnippet,
            corr.pageNumber,
            access.user.id,
          ]
        );
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'update', 'shipping_bills', $3, $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          existing.id,
          JSON.stringify({
            confirmAll: params.input.confirmAll,
            correctionsCount: correctionsToInsert.length,
            nextStatus,
            remainingReviewCount: remainingReviewFields.length,
          }),
        ]
      );
    });
  } else {
    const supabase = await createSupabaseServerClient();
    const { error: sbErr } = await supabase
      .from("shipping_bills")
      .update({
        sb_number: params.input.sbNumber,
        sb_date: params.input.sbDate,
        port_code: params.input.portCode,
        leo_date: params.input.leoDate ?? null,
        invoice_no: params.input.invoiceNo,
        buyer_name: params.input.buyerName,
        currency: params.input.currency,
        fob_minor: billFobMinor,
        exchange_rate: params.input.exchangeRate ?? null,
        schemes_claimed: params.input.schemesClaimed,
        status: nextStatus,
        field_confidence: nextBillConfidence as unknown as Json,
        needs_review_fields: remainingReviewFields,
        confidence_confirmed_at: confirmedAt,
        confidence_confirmed_by: confirmedBy,
      })
      .eq("id", existing.id);

    if (sbErr) {
      throw new ValidationError("Could not update shipping bill fields.");
    }

    await supabase.from("shipping_bill_items").delete().eq("shipping_bill_id", existing.id);
    await supabase.from("shipping_bill_items").insert(
      nextItems.map((item) => ({
        shipping_bill_id: existing.id,
        hs_code: item.hsCode,
        description: item.description,
        quantity: item.quantity,
        uqc: item.uqc,
        fob_minor: item.fobMinor,
        field_confidence: item.fieldConfidence as unknown as Json,
      }))
    );

    if (existing.documentId) {
      await supabase
        .from("documents")
        .update({ parse_status: nextDocStatus })
        .eq("id", existing.documentId);
    }

    if (correctionsToInsert.length > 0) {
      await supabase.from("shipping_bill_corrections").insert(
        correctionsToInsert.map((corr) => ({
          org_id: access.orgId,
          iec_id: existing.iecId,
          shipping_bill_id: existing.id,
          shipping_bill_item_id: corr.shippingBillItemId,
          document_id: existing.documentId,
          field_name: corr.fieldName,
          old_value: corr.oldValue,
          new_value: corr.newValue,
          old_confidence: corr.oldConfidence !== null ? String(corr.oldConfidence) : null,
          source_snippet: corr.sourceSnippet,
          page_number: corr.pageNumber,
          corrected_by: access.user.id,
        }))
      );
    }

    await supabase.from("audit_log").insert({
      org_id: access.orgId,
      actor_id: access.user.id,
      action: "update",
      entity: "shipping_bills",
      entity_id: existing.id,
      diff: {
        confirmAll: params.input.confirmAll,
        correctionsCount: correctionsToInsert.length,
        nextStatus,
        remainingReviewCount: remainingReviewFields.length,
      },
    });
  }

  return getShippingBillForReview({ orgId: access.orgId, sbId: existing.id });
}

export async function getOrgAiParsingSetting(
  orgId: string
): Promise<{ aiParsingEnabled: boolean }> {
  const access = await requireOrgAccess(orgId, "viewer");
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{ ai_parsing_enabled: boolean }>(
        `select ai_parsing_enabled from public.organizations where id = $1`,
        [access.orgId]
      );
      return { aiParsingEnabled: res.rows[0]?.ai_parsing_enabled ?? true };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("ai_parsing_enabled")
    .eq("id", access.orgId)
    .maybeSingle();

  return { aiParsingEnabled: data?.ai_parsing_enabled ?? true };
}

export async function updateOrgAiParsingSetting(params: {
  orgId: string;
  aiParsingEnabled: boolean;
}): Promise<{ aiParsingEnabled: boolean }> {
  const access = await requireOrgAccess(params.orgId, "admin");
  if (access.role !== "owner" && access.role !== "admin") {
    throw new ForbiddenError("Only owners or admins can change AI parsing settings.");
  }

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      await tx.query(
        `update public.organizations set ai_parsing_enabled = $2, updated_at = now() where id = $1`,
        [access.orgId, params.aiParsingEnabled]
      );
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'update', 'organizations', $1, $3::jsonb)`,
        [
          access.orgId,
          access.user.id,
          JSON.stringify({ aiParsingEnabled: params.aiParsingEnabled }),
        ]
      );
      return { aiParsingEnabled: params.aiParsingEnabled };
    });
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("organizations")
    .update({ ai_parsing_enabled: params.aiParsingEnabled })
    .eq("id", access.orgId);
  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "update",
    entity: "organizations",
    entity_id: access.orgId,
    diff: { aiParsingEnabled: params.aiParsingEnabled },
  });

  return { aiParsingEnabled: params.aiParsingEnabled };
}
