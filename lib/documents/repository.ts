import crypto from "node:crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import {
  assertCanUploadBatch,
  getOrgUsageSummary,
  incrementShippingBillUsage,
  type OrgUsageSummary,
} from "@/lib/billing/entitlements";
import { startTrial } from "@/lib/billing/trial";
import type { DocumentKind, DocumentParseStatus } from "@/lib/database.types";
import {
  CANONICAL_MIME_BY_EXTENSION,
  decodeHeaderBase64,
  getDocumentExtension,
  validateMagicBytes,
} from "@/lib/documents/file-security";
import {
  assertValidStoragePath,
  buildStoragePath,
  createSignedDocumentUploadUrl,
  deleteStorageObjects,
  getSafeDownloadTarget,
  verifyUploadedStorageObject,
} from "@/lib/documents/storage";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface DocumentListEntry {
  id: string;
  iecId: string;
  iecCode: string;
  kind: DocumentKind;
  originalName: string;
  parseStatus: DocumentParseStatus;
  fileSizeBytes: number | null;
  mimeType: string | null;
  parseError: string | null;
  shippingBillId?: string | null;
  sha256: string;
  createdAt: string;
}

export interface DocumentListFilter {
  search?: string;
  kind?: DocumentKind;
  parseStatus?: DocumentParseStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface PreparedUploadResultItem {
  originalName: string;
  sha256: string;
  status: "ready" | "duplicate" | "rejected";
  docId?: string;
  storagePath?: string;
  signedUrl?: string;
  mimeType?: string;
  existingDocumentId?: string;
  message?: string;
}

function getDateOnlyKolkata(isoString: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

function filterDocumentRows(
  rows: DocumentListEntry[],
  filters: DocumentListFilter
): DocumentListEntry[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (filters.kind && row.kind !== filters.kind) return false;
    if (filters.parseStatus && row.parseStatus !== filters.parseStatus) return false;
    if (search && !row.originalName.toLowerCase().includes(search)) return false;
    if (filters.dateFrom || filters.dateTo) {
      const kolkataDate = getDateOnlyKolkata(row.createdAt);
      if (filters.dateFrom && kolkataDate < filters.dateFrom) return false;
      if (filters.dateTo && kolkataDate > filters.dateTo) return false;
    }
    return true;
  });
}

export async function listDocumentsWithUsage(
  orgId: string,
  filters: DocumentListFilter = {}
): Promise<{ documents: DocumentListEntry[]; usage: OrgUsageSummary }> {
  const access = await requireOrgAccess(orgId, "viewer");

  let rows: DocumentListEntry[] = [];

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    rows = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        iec_id: string;
        iec_code: string;
        kind: DocumentKind;
        original_name: string;
        parse_status: DocumentParseStatus;
        file_size_bytes: number | null;
        mime_type: string | null;
        parse_error: string | null;
        shipping_bill_id: string | null;
        sha256: string;
        created_at: string;
      }>(
        `select d.id, d.iec_id, p.iec_code, d.kind, d.original_name, d.parse_status,
                d.file_size_bytes, d.mime_type, d.parse_error, sb.id as shipping_bill_id,
                d.sha256, d.created_at::text
         from public.documents d
         join public.iec_profiles p on p.id = d.iec_id
         left join public.shipping_bills sb on sb.document_id = d.id
         where p.org_id = $1 and d.deleted_at is null
         order by d.created_at desc`,
        [access.orgId]
      );

      return res.rows.map((r) => ({
        id: r.id,
        iecId: r.iec_id,
        iecCode: r.iec_code,
        kind: r.kind,
        originalName: r.original_name,
        parseStatus: r.parse_status,
        fileSizeBytes: r.file_size_bytes,
        mimeType: r.mime_type,
        parseError: r.parse_error,
        shippingBillId: r.shipping_bill_id,
        sha256: r.sha256,
        createdAt: r.created_at,
      }));
    });
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("documents")
      .select(
        "id, iec_id, kind, original_name, parse_status, file_size_bytes, mime_type, parse_error, sha256, created_at, iec_profiles!inner(org_id, iec_code), shipping_bills(id)"
      )
      .eq("iec_profiles.org_id", access.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    rows = (data ?? []).map((r) => {
      const joined = Array.isArray(r.iec_profiles) ? r.iec_profiles[0] : r.iec_profiles;
      const sbJoined = Array.isArray(r.shipping_bills) ? r.shipping_bills[0] : r.shipping_bills;
      return {
        id: r.id,
        iecId: r.iec_id,
        iecCode: joined?.iec_code ?? "",
        kind: r.kind,
        originalName: r.original_name,
        parseStatus: r.parse_status,
        fileSizeBytes: r.file_size_bytes,
        mimeType: r.mime_type,
        parseError: r.parse_error,
        shippingBillId: sbJoined?.id ?? null,
        sha256: r.sha256,
        createdAt: r.created_at,
      };
    });
  }

  const usage = await getOrgUsageSummary(access.orgId, access.user.id);
  return {
    documents: filterDocumentRows(rows, filters),
    usage,
  };
}

export async function prepareSignedUploadBatch(params: {
  orgId: string;
  files: Array<{
    iecId: string;
    kind: DocumentKind;
    originalName: string;
    sha256: string;
    fileSizeBytes: number;
    mimeType?: string;
    headerBase64: string;
  }>;
}): Promise<{ results: PreparedUploadResultItem[]; usage: OrgUsageSummary }> {
  const access = await requireOrgAccess(params.orgId, "member");
  const uniqueIecIds = Array.from(new Set(params.files.map((f) => f.iecId)));

  const iecDemoMap = new Map<string, boolean>();
  const existingDocByIecSha = new Map<string, string>();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const iecsRes = await tx.query<{ id: string; is_demo: boolean }>(
        `select id, is_demo from public.iec_profiles where org_id = $1 and id = any($2::uuid[])`,
        [access.orgId, uniqueIecIds]
      );
      for (const row of iecsRes.rows) {
        iecDemoMap.set(row.id, row.is_demo);
      }

      const shas = Array.from(new Set(params.files.map((f) => f.sha256)));
      if (shas.length > 0 && iecsRes.rows.length > 0) {
        const dupRes = await tx.query<{ id: string; iec_id: string; sha256: string }>(
          `select id, iec_id, sha256
           from public.documents
           where iec_id = any($1::uuid[])
             and sha256 = any($2::text[])
             and deleted_at is null`,
          [iecsRes.rows.map((r) => r.id), shas]
        );
        for (const row of dupRes.rows) {
          existingDocByIecSha.set(`${row.iec_id}:${row.sha256}`, row.id);
        }
      }
    });
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: iecsRows } = await supabase
      .from("iec_profiles")
      .select("id, is_demo")
      .eq("org_id", access.orgId)
      .in("id", uniqueIecIds);

    for (const row of iecsRows ?? []) {
      iecDemoMap.set(row.id, row.is_demo);
    }

    const shas = Array.from(new Set(params.files.map((f) => f.sha256)));
    const validIds = Array.from(iecDemoMap.keys());
    if (shas.length > 0 && validIds.length > 0) {
      const { data: dupRows } = await supabase
        .from("documents")
        .select("id, iec_id, sha256")
        .in("iec_id", validIds)
        .in("sha256", shas)
        .is("deleted_at", null);

      for (const row of dupRows ?? []) {
        existingDocByIecSha.set(`${row.iec_id}:${row.sha256}`, row.id);
      }
    }
  }

  for (const iecId of uniqueIecIds) {
    if (!iecDemoMap.has(iecId)) {
      throw new ForbiddenError("IEC profile does not belong to this organization.");
    }
  }

  const seenInBatch = new Set<string>();
  let newRealShippingBillsCount = 0;

  type Candidate =
    | { kind: "duplicate"; item: PreparedUploadResultItem }
    | { kind: "rejected"; item: PreparedUploadResultItem }
    | {
        kind: "ready";
        iecId: string;
        docKind: DocumentKind;
        originalName: string;
        sha256: string;
        storagePath: string;
        mimeType: string;
      };

  const candidates: Candidate[] = params.files.map((file) => {
    const ext = getDocumentExtension(file.originalName);
    if (!ext) {
      return {
        kind: "rejected",
        item: {
          originalName: file.originalName,
          sha256: file.sha256,
          status: "rejected",
          message: "Unsupported file type. Allowed: PDF, XLSX, XLS, CSV.",
        },
      };
    }

    const headerBytes = decodeHeaderBase64(file.headerBase64);
    const magicResult = validateMagicBytes(headerBytes, ext);
    if (!magicResult.valid) {
      return {
        kind: "rejected",
        item: {
          originalName: file.originalName,
          sha256: file.sha256,
          status: "rejected",
          message: magicResult.reason ?? "Invalid file signature.",
        },
      };
    }

    const key = `${file.iecId}:${file.sha256}`;
    const existingId = existingDocByIecSha.get(key);
    if (existingId || seenInBatch.has(key)) {
      return {
        kind: "duplicate",
        item: {
          originalName: file.originalName,
          sha256: file.sha256,
          status: "duplicate",
          existingDocumentId: existingId,
          message: "Already uploaded",
        },
      };
    }

    seenInBatch.add(key);
    if (file.kind === "shipping_bill" && !iecDemoMap.get(file.iecId)) {
      newRealShippingBillsCount += 1;
    }

    const docId = crypto.randomUUID();
    const storagePath = buildStoragePath({
      orgId: access.orgId,
      iecId: file.iecId,
      docId,
      extension: ext,
    });

    return {
      kind: "ready",
      iecId: file.iecId,
      docKind: file.kind,
      originalName: file.originalName,
      sha256: file.sha256,
      storagePath,
      mimeType: CANONICAL_MIME_BY_EXTENSION[ext],
    };
  });

  if (params.files.length === 1 && candidates[0]?.kind === "rejected") {
    throw new ValidationError(candidates[0].item.message ?? "Unsupported or unsafe file.");
  }

  // Enforce monthly shipping-bill allowance before issuing signed upload URLs
  const usage = await assertCanUploadBatch({
    orgId: access.orgId,
    userId: access.user.id,
    shippingBillCount: newRealShippingBillsCount,
  });

  const results: PreparedUploadResultItem[] = await Promise.all(
    candidates.map(async (c) => {
      if (c.kind === "duplicate" || c.kind === "rejected") {
        return c.item;
      }
      const signed = await createSignedDocumentUploadUrl({
        orgId: access.orgId,
        storagePath: c.storagePath,
      });
      const docId = c.storagePath.split("/").pop()!.split(".")[0]!;
      return {
        originalName: c.originalName,
        sha256: c.sha256,
        status: "ready",
        docId,
        storagePath: signed.storagePath,
        signedUrl: signed.signedUrl,
        mimeType: c.mimeType,
      };
    })
  );

  return { results, usage };
}

async function getIecDemoFlag(params: {
  orgId: string;
  userId: string;
  iecId: string;
}): Promise<{ id: string; iecCode: string; isDemo: boolean } | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      const res = await tx.query<{ id: string; iec_code: string; is_demo: boolean }>(
        `select id, iec_code, is_demo from public.iec_profiles where id = $1 and org_id = $2`,
        [params.iecId, params.orgId]
      );
      const row = res.rows[0];
      return row ? { id: row.id, iecCode: row.iec_code, isDemo: row.is_demo } : null;
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("iec_profiles")
    .select("id, iec_code, is_demo")
    .eq("id", params.iecId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  return data ? { id: data.id, iecCode: data.iec_code, isDemo: data.is_demo } : null;
}

export async function commitUploadedDocument(params: {
  orgId: string;
  docId: string;
  iecId: string;
  kind: DocumentKind;
  originalName: string;
  sha256: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType?: string;
}): Promise<{
  duplicate: boolean;
  message?: string;
  document: DocumentListEntry;
  trialStarted: boolean;
}> {
  const access = await requireOrgAccess(params.orgId, "member");
  const safePath = assertValidStoragePath(params.storagePath, access.orgId);

  if (!safePath.startsWith(`${access.orgId}/${params.iecId}/${params.docId}.`)) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError("Storage path does not match document metadata.");
  }

  // Check duplicate first so we avoid extra storage downloads on retries
  const existing = await findActiveDocumentBySha({
    userId: access.user.id,
    orgId: access.orgId,
    iecId: params.iecId,
    sha256: params.sha256,
  });

  if (existing) {
    await deleteStorageObjects([safePath]);
    return {
      duplicate: true,
      message: "Already uploaded",
      document: existing,
      trialStarted: false,
    };
  }

  // Re-verify magic bytes + SHA-256 directly on the uploaded object
  const verified = await verifyUploadedStorageObject({
    orgId: access.orgId,
    storagePath: safePath,
    originalName: params.originalName,
    expectedSha256: params.sha256,
    expectedBytes: params.fileSizeBytes,
  });

  if (params.kind === "shipping_bill") {
    const iecMeta = await getIecDemoFlag({
      orgId: access.orgId,
      userId: access.user.id,
      iecId: params.iecId,
    });
    if (iecMeta && !iecMeta.isDemo) {
      await assertCanUploadBatch({
        orgId: access.orgId,
        userId: access.user.id,
        shippingBillCount: 1,
        isDemo: false,
      });
    }
  }

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const txOut = await asPgliteUser(access.user.id, async (tx) => {
      const iecCheck = await tx.query<{ id: string; iec_code: string; is_demo: boolean }>(
        `select id, iec_code, is_demo from public.iec_profiles where id = $1 and org_id = $2`,
        [params.iecId, access.orgId]
      );
      const iecRow = iecCheck.rows[0];
      if (!iecRow) {
        throw new ForbiddenError("IEC profile does not belong to this organization.");
      }

      const inserted = await tx.query<{
        id: string;
        iec_id: string;
        kind: DocumentKind;
        original_name: string;
        parse_status: DocumentParseStatus;
        file_size_bytes: number | null;
        mime_type: string | null;
        parse_error: string | null;
        sha256: string;
        created_at: string;
      }>(
        `insert into public.documents
           (id, iec_id, kind, storage_path, sha256, original_name, parse_status, file_size_bytes, mime_type, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $9)
         returning id, iec_id, kind, original_name, parse_status, file_size_bytes, mime_type, parse_error, sha256, created_at::text`,
        [
          params.docId,
          params.iecId,
          params.kind,
          safePath,
          params.sha256,
          params.originalName,
          verified.actualSizeBytes,
          verified.canonicalMimeType,
          access.user.id,
        ]
      );

      const row = inserted.rows[0];
      if (!row) {
        throw new ValidationError("Could not persist document record.");
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create', 'documents', $3, $4::jsonb)`,
        [
          access.orgId,
          access.user.id,
          row.id,
          JSON.stringify({ kind: row.kind, sha256: row.sha256, bytes: row.file_size_bytes }),
        ]
      );

      return {
        isDemo: iecRow.is_demo,
        document: {
          id: row.id,
          iecId: row.iec_id,
          iecCode: iecRow.iec_code,
          kind: row.kind,
          originalName: row.original_name,
          parseStatus: row.parse_status,
          fileSizeBytes: row.file_size_bytes,
          mimeType: row.mime_type,
          parseError: row.parse_error,
          sha256: row.sha256,
          createdAt: row.created_at,
        },
      };
    });

    if (params.kind === "shipping_bill" && !txOut.isDemo) {
      await incrementShippingBillUsage({ orgId: access.orgId, delta: 1 });
    }

    const trial = txOut.isDemo ? null : await startTrial(access.orgId, access.user.id);
    return {
      duplicate: false,
      document: txOut.document,
      trialStarted: trial?.started ?? false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: iecRow } = await supabase
    .from("iec_profiles")
    .select("id, iec_code, is_demo")
    .eq("id", params.iecId)
    .eq("org_id", access.orgId)
    .maybeSingle();

  if (!iecRow) {
    await deleteStorageObjects([safePath]);
    throw new ForbiddenError("IEC profile does not belong to this organization.");
  }

  if (params.kind === "shipping_bill" && !iecRow.is_demo) {
    await assertCanUploadBatch({
      orgId: access.orgId,
      userId: access.user.id,
      shippingBillCount: 1,
      isDemo: false,
    });
  }

  const { data: inserted, error } = await supabase
    .from("documents")
    .insert({
      id: params.docId,
      iec_id: params.iecId,
      kind: params.kind,
      storage_path: safePath,
      sha256: params.sha256,
      original_name: params.originalName,
      parse_status: "queued",
      file_size_bytes: verified.actualSizeBytes,
      mime_type: verified.canonicalMimeType,
      uploaded_by: access.user.id,
    })
    .select(
      "id, iec_id, kind, original_name, parse_status, file_size_bytes, mime_type, parse_error, sha256, created_at"
    )
    .single();

  if (error || !inserted) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError("Could not persist uploaded document.");
  }

  if (params.kind === "shipping_bill" && !iecRow.is_demo) {
    await incrementShippingBillUsage({ orgId: access.orgId, delta: 1 });
  }

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "create",
    entity: "documents",
    entity_id: inserted.id,
    diff: {
      kind: inserted.kind,
      sha256: inserted.sha256,
      bytes: inserted.file_size_bytes,
    },
  });

  const trial = iecRow.is_demo ? null : await startTrial(access.orgId, access.user.id);

  return {
    duplicate: false,
    document: {
      id: inserted.id,
      iecId: inserted.iec_id,
      iecCode: iecRow.iec_code,
      kind: inserted.kind,
      originalName: inserted.original_name,
      parseStatus: inserted.parse_status,
      fileSizeBytes: inserted.file_size_bytes,
      mimeType: inserted.mime_type,
      parseError: inserted.parse_error,
      sha256: inserted.sha256,
      createdAt: inserted.created_at,
    },
    trialStarted: trial?.started ?? false,
  };
}

async function findActiveDocumentBySha(params: {
  userId: string;
  orgId: string;
  iecId: string;
  sha256: string;
}): Promise<DocumentListEntry | null> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.userId, async (tx) => {
      const res = await tx.query<{
        id: string;
        iec_id: string;
        iec_code: string;
        kind: DocumentKind;
        original_name: string;
        parse_status: DocumentParseStatus;
        file_size_bytes: number | null;
        mime_type: string | null;
        parse_error: string | null;
        sha256: string;
        created_at: string;
      }>(
        `select d.id, d.iec_id, p.iec_code, d.kind, d.original_name, d.parse_status,
                d.file_size_bytes, d.mime_type, d.parse_error, d.sha256, d.created_at::text
         from public.documents d
         join public.iec_profiles p on p.id = d.iec_id
         where p.org_id = $1
           and d.iec_id = $2
           and d.sha256 = $3
           and d.deleted_at is null
         limit 1`,
        [params.orgId, params.iecId, params.sha256]
      );
      const r = res.rows[0];
      if (!r) return null;
      return {
        id: r.id,
        iecId: r.iec_id,
        iecCode: r.iec_code,
        kind: r.kind,
        originalName: r.original_name,
        parseStatus: r.parse_status,
        fileSizeBytes: r.file_size_bytes,
        mimeType: r.mime_type,
        parseError: r.parse_error,
        sha256: r.sha256,
        createdAt: r.created_at,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, iec_id, kind, original_name, parse_status, file_size_bytes, mime_type, parse_error, sha256, created_at, iec_profiles!inner(org_id, iec_code)"
    )
    .eq("iec_profiles.org_id", params.orgId)
    .eq("iec_id", params.iecId)
    .eq("sha256", params.sha256)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const joined = Array.isArray(data.iec_profiles) ? data.iec_profiles[0] : data.iec_profiles;
  return {
    id: data.id,
    iecId: data.iec_id,
    iecCode: joined?.iec_code ?? "",
    kind: data.kind,
    originalName: data.original_name,
    parseStatus: data.parse_status,
    fileSizeBytes: data.file_size_bytes,
    mimeType: data.mime_type,
    parseError: data.parse_error,
    sha256: data.sha256,
    createdAt: data.created_at,
  };
}

export async function retryDocumentParse(params: { orgId: string; docId: string }): Promise<void> {
  const access = await requireOrgAccess(params.orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{ id: string }>(
        `update public.documents d
         set parse_status = 'queued', parse_error = null
         from public.iec_profiles p
         where d.id = $1 and d.iec_id = p.id and p.org_id = $2 and d.deleted_at is null
         returning d.id`,
        [params.docId, access.orgId]
      );
      if (!res.rows[0]) {
        throw new NotFoundError("Document not found.");
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'update', 'documents', $3, '{"parse_status":"queued"}'::jsonb)`,
        [access.orgId, access.user.id, params.docId]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, iec_profiles!inner(org_id)")
    .eq("id", params.docId)
    .eq("iec_profiles.org_id", access.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) {
    throw new NotFoundError("Document not found.");
  }

  await supabase
    .from("documents")
    .update({ parse_status: "queued", parse_error: null })
    .eq("id", params.docId);

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "update",
    entity: "documents",
    entity_id: params.docId,
    diff: { parse_status: "queued" },
  });
}

export async function getDocumentDownload(params: { orgId: string; docId: string }) {
  const access = await requireOrgAccess(params.orgId, "viewer");

  let storagePath: string | null = null;
  let originalName = "document";

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const found = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{ storage_path: string; original_name: string }>(
        `select d.storage_path, d.original_name
         from public.documents d
         join public.iec_profiles p on p.id = d.iec_id
         where d.id = $1 and p.org_id = $2 and d.deleted_at is null`,
        [params.docId, access.orgId]
      );
      return res.rows[0] ?? null;
    });

    if (!found) {
      throw new NotFoundError("Document not found.");
    }
    storagePath = found.storage_path;
    originalName = found.original_name;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("documents")
      .select("storage_path, original_name, iec_profiles!inner(org_id)")
      .eq("id", params.docId)
      .eq("iec_profiles.org_id", access.orgId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!data) {
      throw new NotFoundError("Document not found.");
    }
    storagePath = data.storage_path;
    originalName = data.original_name;
  }

  const target = await getSafeDownloadTarget({
    orgId: access.orgId,
    storagePath,
    originalName,
  });

  return {
    originalName,
    target,
  };
}

export async function purgeExpiredDeletedDocuments(
  now: Date = new Date()
): Promise<{ purgedCount: number; purgedIds: string[] }> {
  const cutoffIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const expired = await db.query<{ id: string; storage_path: string }>(
      `select id, storage_path
       from public.documents
       where deleted_at is not null and deleted_at <= $1::timestamptz`,
      [cutoffIso]
    );

    if (expired.rows.length === 0) {
      return { purgedCount: 0, purgedIds: [] };
    }

    await deleteStorageObjects(
      expired.rows.map((r) => r.storage_path),
      { useServiceRole: true }
    );

    const ids = expired.rows.map((r) => r.id);
    await db.query(`delete from public.documents where id = any($1::uuid[])`, [ids]);

    return { purgedCount: ids.length, purgedIds: ids };
  }

  const service = createSupabaseServiceRoleClient();
  const { data: expired } = await service
    .from("documents")
    .select("id, storage_path")
    .not("deleted_at", "is", null)
    .lte("deleted_at", cutoffIso);

  const rows = expired ?? [];
  if (rows.length === 0) {
    return { purgedCount: 0, purgedIds: [] };
  }

  await deleteStorageObjects(
    rows.map((r) => r.storage_path),
    { useServiceRole: true }
  );

  const ids = rows.map((r) => r.id);
  await service.from("documents").delete().in("id", ids);

  return { purgedCount: ids.length, purgedIds: ids };
}
