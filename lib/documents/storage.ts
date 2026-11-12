import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "@/lib/auth/errors";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import {
  CANONICAL_MIME_BY_EXTENSION,
  type AllowedDocumentExtension,
  getDocumentExtension,
  validateMagicBytes,
} from "@/lib/documents/file-security";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const STORAGE_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|xlsx|xls|csv)$/i;

const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), ".tmp-storage", "documents");

function getLocalSigningSecret(): string {
  return process.env.EXPORTLEAK_LOCAL_SIGNING_SECRET ?? "exportleak-local-test-upload-secret";
}

export function buildStoragePath(params: {
  orgId: string;
  iecId: string;
  docId: string;
  extension: AllowedDocumentExtension;
}): string {
  return `${params.orgId}/${params.iecId}/${params.docId}.${params.extension}`;
}

export function assertValidStoragePath(storagePath: string, expectedOrgId?: string): string {
  const normalized = storagePath.trim();
  if (!STORAGE_PATH_REGEX.test(normalized)) {
    throw new ValidationError("Invalid storage path.");
  }
  if (expectedOrgId && !normalized.startsWith(`${expectedOrgId}/`)) {
    throw new ValidationError("Storage path does not match organization.");
  }
  return normalized;
}

export function signLocalUploadToken(storagePath: string, expiresAtMs: number): string {
  return crypto
    .createHmac("sha256", getLocalSigningSecret())
    .update(`${storagePath}:${expiresAtMs}`)
    .digest("hex");
}

export function verifyLocalUploadToken(params: {
  storagePath: string;
  expiresAtMs: number;
  signature: string;
}): boolean {
  if (!Number.isFinite(params.expiresAtMs) || Date.now() > params.expiresAtMs) {
    return false;
  }
  const expected = signLocalUploadToken(params.storagePath, params.expiresAtMs);
  const actualBuf = Buffer.from(params.signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function resolveLocalFilePath(storagePath: string): string {
  const safePath = assertValidStoragePath(storagePath);
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, safePath);
  if (!resolved.startsWith(`${LOCAL_STORAGE_ROOT}${path.sep}`)) {
    throw new ValidationError("Invalid local storage path.");
  }
  return resolved;
}

export async function createSignedDocumentUploadUrl(params: {
  orgId: string;
  storagePath: string;
}): Promise<{ signedUrl: string; storagePath: string }> {
  const safePath = assertValidStoragePath(params.storagePath, params.orgId);

  if (isPgliteTestAdapterEnabled()) {
    const exp = Date.now() + 10 * 60 * 1000;
    const sig = signLocalUploadToken(safePath, exp);
    return {
      storagePath: safePath,
      signedUrl: `/api/orgs/${params.orgId}/documents/direct-upload?path=${encodeURIComponent(safePath)}&exp=${exp}&sig=${sig}`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(safePath, { upsert: false });

  if (error || !data?.signedUrl) {
    throw new ValidationError("Could not generate signed upload URL.");
  }

  return {
    storagePath: safePath,
    signedUrl: data.signedUrl,
  };
}

export async function writeLocalStorageObject(storagePath: string, bytes: Buffer): Promise<void> {
  const fullPath = resolveLocalFilePath(storagePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, bytes);
}

export async function readStorageObjectBytes(storagePath: string): Promise<Buffer> {
  const safePath = assertValidStoragePath(storagePath);

  if (isPgliteTestAdapterEnabled()) {
    const fullPath = resolveLocalFilePath(safePath);
    try {
      return await fs.readFile(fullPath);
    } catch {
      throw new ValidationError("Uploaded file was not found in temporary storage.");
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from("documents").download(safePath);
  if (error || !data) {
    throw new ValidationError("Uploaded file was not found in private storage.");
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteStorageObjects(
  storagePaths: readonly string[],
  options: { useServiceRole?: boolean } = {}
): Promise<void> {
  const validPaths = storagePaths.filter((p) => STORAGE_PATH_REGEX.test(p));
  if (validPaths.length === 0) return;

  if (isPgliteTestAdapterEnabled()) {
    await Promise.all(
      validPaths.map(async (p) => {
        try {
          await fs.unlink(resolveLocalFilePath(p));
        } catch {
          // Ignore missing files during cleanup
        }
      })
    );
    return;
  }

  const client = options.useServiceRole
    ? createSupabaseServiceRoleClient()
    : await createSupabaseServerClient();

  await client.storage.from("documents").remove(validPaths);
}

export async function verifyUploadedStorageObject(params: {
  orgId: string;
  storagePath: string;
  originalName: string;
  expectedSha256: string;
  expectedBytes: number;
}): Promise<{ actualSizeBytes: number; canonicalMimeType: string }> {
  const safePath = assertValidStoragePath(params.storagePath, params.orgId);
  const ext = getDocumentExtension(params.originalName);
  if (!ext) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError("Unsupported file extension. Allowed: PDF, XLSX, XLS, CSV.");
  }

  if (!safePath.toLowerCase().endsWith(`.${ext}`)) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError("File extension does not match storage path.");
  }

  const bytes = await readStorageObjectBytes(safePath);

  if (bytes.length === 0 || bytes.length !== params.expectedBytes) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError("Uploaded file size mismatch.");
  }

  const actualSha = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actualSha !== params.expectedSha256.toLowerCase()) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError("Uploaded file checksum (SHA-256) mismatch.");
  }

  const magicCheck = validateMagicBytes(new Uint8Array(bytes), ext);
  if (!magicCheck.valid) {
    await deleteStorageObjects([safePath]);
    throw new ValidationError(magicCheck.reason ?? "Invalid or unsafe file signature.");
  }

  return {
    actualSizeBytes: bytes.length,
    canonicalMimeType: CANONICAL_MIME_BY_EXTENSION[ext],
  };
}

export async function getSafeDownloadTarget(params: {
  orgId: string;
  storagePath: string;
  originalName: string;
}): Promise<
  { mode: "redirect"; url: string } | { mode: "buffer"; bytes: Buffer; mimeType: string }
> {
  const safePath = assertValidStoragePath(params.storagePath, params.orgId);
  const ext = getDocumentExtension(params.originalName) ?? "pdf";
  const mimeType = CANONICAL_MIME_BY_EXTENSION[ext];

  if (isPgliteTestAdapterEnabled()) {
    const bytes = await readStorageObjectBytes(safePath);
    return { mode: "buffer", bytes, mimeType };
  }

  const safeDownloadName = path.basename(params.originalName).replace(/[^\w.\-() ]+/g, "_");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(safePath, 60, { download: safeDownloadName || "document" });

  if (error || !data?.signedUrl) {
    throw new ValidationError("Could not generate download link.");
  }

  return { mode: "redirect", url: data.signedUrl };
}
