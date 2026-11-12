import type { DocumentKind } from "@/lib/database.types";

export const ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "xlsx", "xls", "csv"] as const;
export type AllowedDocumentExtension = (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number];

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_BATCH_FILES = 50;

export const ALLOWED_MIME_TYPES_BY_EXTENSION: Record<AllowedDocumentExtension, readonly string[]> =
  {
    pdf: ["application/pdf"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    xls: ["application/vnd.ms-excel"],
    csv: ["text/csv", "application/csv", "text/plain"],
  };

export const CANONICAL_MIME_BY_EXTENSION: Record<AllowedDocumentExtension, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

export interface MagicByteCheckResult {
  valid: boolean;
  reason?: string;
}

export function getDocumentExtension(filename: string): AllowedDocumentExtension | null {
  const trimmed = filename.trim().toLowerCase();
  const dotIdx = trimmed.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === trimmed.length - 1) return null;
  const ext = trimmed.slice(dotIdx + 1);
  if ((ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return ext as AllowedDocumentExtension;
  }
  return null;
}

export function suggestDocumentKind(
  extension: AllowedDocumentExtension,
  filename: string
): DocumentKind {
  const lower = filename.toLowerCase();
  if (lower.includes("irm") || lower.includes("remittance") || lower.includes("firc")) {
    return "irm_export";
  }
  if (lower.includes("scroll") || lower.includes("rodtep") || lower.includes("ledger")) {
    return "scroll";
  }
  if (extension === "pdf") {
    return "shipping_bill";
  }
  return "irm_export";
}

function startsWithBytes(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

export function detectDangerousBinarySignature(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "File is empty.";

  // Windows PE/EXE/DLL: "MZ"
  if (startsWithBytes(bytes, [0x4d, 0x5a])) {
    return "Executable Windows binary (MZ) rejected for security.";
  }

  // Linux ELF binary
  if (startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    return "Executable ELF binary rejected for security.";
  }

  // Mach-O / Java class binary
  if (
    startsWithBytes(bytes, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWithBytes(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWithBytes(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWithBytes(bytes, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    return "Executable binary signature rejected for security.";
  }

  // Shell script shebang
  if (startsWithBytes(bytes, [0x23, 0x21])) {
    return "Executable script header (#!) rejected for security.";
  }

  return null;
}

export function validateMagicBytes(
  bytes: Uint8Array,
  extension: AllowedDocumentExtension
): MagicByteCheckResult {
  const dangerous = detectDangerousBinarySignature(bytes);
  if (dangerous) {
    return { valid: false, reason: dangerous };
  }

  if (extension === "pdf") {
    // Require "%PDF-" header
    if (!startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      return {
        valid: false,
        reason: "Invalid PDF signature: file header does not start with %PDF-.",
      };
    }
    return { valid: true };
  }

  if (extension === "xlsx") {
    // Require OOXML ZIP local header "PK\x03\x04"
    if (!startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
      return {
        valid: false,
        reason: "Invalid XLSX signature: file is not a valid OOXML spreadsheet.",
      };
    }
    return { valid: true };
  }

  if (extension === "xls") {
    // Require OLE2 compound document header D0 CF 11 E0 A1 B1 1A E1
    if (!startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
      return {
        valid: false,
        reason: "Invalid XLS signature: file is not a valid Excel compound workbook.",
      };
    }
    return { valid: true };
  }

  // CSV: reject NUL bytes and binary control chars, verify valid UTF-8
  for (let i = 0; i < Math.min(bytes.length, 4096); i += 1) {
    if (bytes[i] === 0x00) {
      return {
        valid: false,
        reason: "Invalid CSV content: binary NUL bytes detected.",
      };
    }
  }

  try {
    const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample);
    if (decoded.trim().length === 0) {
      return { valid: false, reason: "CSV file appears empty." };
    }
  } catch {
    return { valid: false, reason: "Invalid CSV encoding: expected UTF-8 plain text." };
  }

  return { valid: true };
}

export function encodeHeaderBase64(bytes: Uint8Array): string {
  const slice = bytes.subarray(0, Math.min(bytes.length, 512));
  if (typeof Buffer !== "undefined") {
    return Buffer.from(slice).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < slice.length; i += 1) {
    binary += String.fromCharCode(slice[i]!);
  }
  return btoa(binary);
}

export function decodeHeaderBase64(encoded: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(encoded, "base64"));
  }
  const binary = atob(encoded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function computeSha256HexClient(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}
