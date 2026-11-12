import { z } from "zod";
import { MAX_BATCH_FILES, MAX_DOCUMENT_BYTES } from "@/lib/documents/file-security";

export const documentKindSchema = z.enum(["shipping_bill", "irm_export", "scroll", "other"]);

export const documentParseStatusSchema = z.enum([
  "queued",
  "parsing",
  "needs_review",
  "done",
  "failed",
]);

export const sha256HexSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{64}$/, "Invalid SHA-256 checksum.");

export const safeFilenameSchema = z
  .string()
  .trim()
  .min(1, "Filename is required.")
  .max(255, "Filename must be 255 characters or less.")
  .refine((name) => !name.includes("..") && !name.includes("/") && !name.includes("\\"), {
    message: "Invalid filename.",
  });

export const prepareUploadItemSchema = z.object({
  iecId: z.string().uuid(),
  kind: documentKindSchema,
  originalName: safeFilenameSchema,
  sha256: sha256HexSchema,
  fileSizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  mimeType: z.string().trim().max(120).optional(),
  headerBase64: z.string().min(4).max(2048),
});

export const prepareUploadBatchSchema = z.object({
  files: z.array(prepareUploadItemSchema).min(1).max(MAX_BATCH_FILES),
});

export const commitUploadedDocumentSchema = z.object({
  docId: z.string().uuid(),
  iecId: z.string().uuid(),
  kind: documentKindSchema,
  originalName: safeFilenameSchema,
  sha256: sha256HexSchema,
  storagePath: z.string().trim().min(10).max(500),
  fileSizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  mimeType: z.string().trim().max(120).optional(),
});

export const documentActionSchema = z.object({
  action: z.enum(["retry"]),
});
