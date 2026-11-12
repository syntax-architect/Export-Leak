import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { softDeleteDocument } from "@/lib/auth/repository";
import { retryDocumentParse } from "@/lib/documents/repository";
import { documentActionSchema } from "@/lib/validation/documents";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; docId: string }> }
) {
  try {
    const { orgId, docId } = await context.params;
    const body = await request.json();
    const parsed = documentActionSchema.parse(body);

    if (parsed.action === "retry") {
      await retryDocumentParse({ orgId, docId });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; docId: string }> }
) {
  try {
    const { orgId, docId } = await context.params;
    await softDeleteDocument({ orgId, docId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
