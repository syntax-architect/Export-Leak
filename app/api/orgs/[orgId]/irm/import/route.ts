import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError, toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  MAX_DOCUMENT_BYTES,
  getDocumentExtension,
  validateMagicBytes,
} from "@/lib/documents/file-security";
import {
  commitIrmImportAndRunMatching,
  loadStoredDocumentForIrmPreview,
  previewIrmImportForOrg,
} from "@/lib/matching/irm-repository";
import type { IrmColumnMapping } from "@/lib/matching/types";
import { IrmColumnMappingSchema } from "@/lib/validation/matching";

const JsonIrmImportBodySchema = z
  .object({
    action: z.enum(["preview", "commit"]),
    docId: z.string().uuid().optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    fileBase64: z.string().min(1).optional(),
    iecId: z.string().uuid().nullable().optional(),
    columnMapping: IrmColumnMappingSchema.optional(),
  })
  .superRefine((val, ctx) => {
    const hasDocId = Boolean(val.docId);
    const hasFile = Boolean(val.filename && val.fileBase64);
    if (!hasDocId && !hasFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a stored docId or both filename and fileBase64.",
      });
    }
  });

const UuidOptionalSchema = z.string().uuid().optional();

function assertTabularExtension(filename: string): "xlsx" | "xls" | "csv" {
  const ext = getDocumentExtension(filename);
  if (ext !== "xlsx" && ext !== "xls" && ext !== "csv") {
    throw new ValidationError("IRM import supports .xlsx, .xls, and .csv files only.");
  }
  return ext;
}

function parseOptionalMappingJson(
  raw: FormDataEntryValue | null
): Partial<IrmColumnMapping> | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new ValidationError("Invalid columnMapping JSON payload.");
  }
  const parsed = IrmColumnMappingSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid column mapping.");
  }
  return parsed.data;
}

async function executeIrmAction(params: {
  orgId: string;
  action: "preview" | "commit";
  iecId: string | null;
  sourceDocumentId: string | null;
  filename: string;
  bytes: Uint8Array;
  columnMapping?: Partial<IrmColumnMapping>;
}) {
  if (params.action === "preview") {
    const preview = await previewIrmImportForOrg({
      orgId: params.orgId,
      filename: params.filename,
      bytes: params.bytes,
      overrideMapping: params.columnMapping,
    });
    return NextResponse.json({
      mode: "preview",
      sourceDocumentId: params.sourceDocumentId,
      iecId: params.iecId,
      preview,
    });
  }

  const result = await commitIrmImportAndRunMatching({
    orgId: params.orgId,
    iecId: params.iecId,
    sourceDocumentId: params.sourceDocumentId,
    filename: params.filename,
    bytes: params.bytes,
    columnMapping: params.columnMapping,
  });
  return NextResponse.json({ mode: "commit", result });
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "member");
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const rawAction = String(formData.get("action") ?? "preview");
      if (rawAction !== "preview" && rawAction !== "commit") {
        throw new ValidationError("Action must be 'preview' or 'commit'.");
      }

      const rawDocId = formData.get("docId");
      const rawIecId = formData.get("iecId");
      const iecCheck = UuidOptionalSchema.safeParse(
        typeof rawIecId === "string" && rawIecId.trim().length > 0 ? rawIecId.trim() : undefined
      );
      if (!iecCheck.success) {
        throw new ValidationError("Invalid IEC identifier.");
      }

      const columnMapping = parseOptionalMappingJson(formData.get("columnMapping"));
      const uploaded = formData.get("file");
      const uploadedBlob =
        uploaded && typeof uploaded === "object" && "size" in uploaded && "name" in uploaded
          ? (uploaded as Blob & { name: string })
          : null;

      let filename: string;
      let bytes: Uint8Array;
      let sourceDocumentId: string | null = null;
      let resolvedIecId: string | null = iecCheck.data ?? null;

      if (uploadedBlob && uploadedBlob.size > 0) {
        if (uploadedBlob.size > MAX_DOCUMENT_BYTES) {
          throw new ValidationError("IRM file exceeds 10 MB limit.");
        }
        const ext = assertTabularExtension(uploadedBlob.name);
        bytes = new Uint8Array(await uploadedBlob.arrayBuffer());
        const magic = validateMagicBytes(bytes, ext);
        if (!magic.valid) {
          throw new ValidationError(magic.reason ?? "Uploaded file failed magic-byte checks.");
        }
        filename = uploadedBlob.name;
      } else if (typeof rawDocId === "string" && rawDocId.trim().length > 0) {
        const docCheck = z.string().uuid().safeParse(rawDocId.trim());
        if (!docCheck.success) {
          throw new ValidationError("Invalid document identifier.");
        }
        const stored = await loadStoredDocumentForIrmPreview({
          orgId: access.orgId,
          docId: docCheck.data,
        });
        assertTabularExtension(stored.filename);
        filename = stored.filename;
        bytes = stored.bytes;
        sourceDocumentId = docCheck.data;
        resolvedIecId = resolvedIecId ?? stored.iecId;
      } else {
        throw new ValidationError(
          "Upload an .xlsx, .xls, or .csv IRM file or select an existing document."
        );
      }

      return executeIrmAction({
        orgId: access.orgId,
        action: rawAction,
        iecId: resolvedIecId,
        sourceDocumentId,
        filename,
        bytes,
        columnMapping,
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("Invalid JSON request body.");
    }

    const parsed = JsonIrmImportBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid IRM import request.");
    }

    let filename: string;
    let bytes: Uint8Array;
    let sourceDocumentId: string | null = null;
    let resolvedIecId: string | null = parsed.data.iecId ?? null;

    if (parsed.data.filename && parsed.data.fileBase64) {
      const ext = assertTabularExtension(parsed.data.filename);
      const decoded = Buffer.from(parsed.data.fileBase64, "base64");
      if (decoded.length === 0) {
        throw new ValidationError("Uploaded file payload is empty.");
      }
      if (decoded.length > MAX_DOCUMENT_BYTES) {
        throw new ValidationError("IRM file exceeds 10 MB limit.");
      }
      bytes = new Uint8Array(decoded);
      const magic = validateMagicBytes(bytes, ext);
      if (!magic.valid) {
        throw new ValidationError(magic.reason ?? "Uploaded file failed magic-byte checks.");
      }
      filename = parsed.data.filename;
    } else if (parsed.data.docId) {
      const stored = await loadStoredDocumentForIrmPreview({
        orgId: access.orgId,
        docId: parsed.data.docId,
      });
      assertTabularExtension(stored.filename);
      filename = stored.filename;
      bytes = stored.bytes;
      sourceDocumentId = parsed.data.docId;
      resolvedIecId = resolvedIecId ?? stored.iecId;
    } else {
      throw new ValidationError("Provide either a stored docId or uploaded spreadsheet file.");
    }

    return executeIrmAction({
      orgId: access.orgId,
      action: parsed.data.action,
      iecId: resolvedIecId,
      sourceDocumentId,
      filename,
      bytes,
      columnMapping: parsed.data.columnMapping,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
