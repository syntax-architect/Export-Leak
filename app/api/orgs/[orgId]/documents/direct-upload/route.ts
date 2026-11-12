import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, NotFoundError, toErrorResponse, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/file-security";
import {
  assertValidStoragePath,
  verifyLocalUploadToken,
  writeLocalStorageObject,
} from "@/lib/documents/storage";

export async function PUT(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    if (!isPgliteTestAdapterEnabled()) {
      throw new NotFoundError("Direct local upload endpoint is disabled.");
    }

    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "member");

    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get("path") ?? "";
    const expRaw = searchParams.get("exp") ?? "";
    const sig = searchParams.get("sig") ?? "";

    const storagePath = assertValidStoragePath(rawPath, orgId);
    const expiresAtMs = Number(expRaw);

    if (!verifyLocalUploadToken({ storagePath, expiresAtMs, signature: sig })) {
      throw new ForbiddenError("Signed upload token is invalid or expired.");
    }

    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_DOCUMENT_BYTES) {
      throw new ValidationError("File size must be between 1 byte and 10 MB.");
    }

    await writeLocalStorageObject(storagePath, Buffer.from(arrayBuffer));
    return NextResponse.json({ ok: true, storagePath });
  } catch (error) {
    return toErrorResponse(error);
  }
}
