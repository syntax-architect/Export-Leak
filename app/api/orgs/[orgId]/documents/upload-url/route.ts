import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { prepareSignedUploadBatch } from "@/lib/documents/repository";
import { prepareUploadBatchSchema, prepareUploadItemSchema } from "@/lib/validation/documents";

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const raw = (await request.json()) as Record<string, unknown>;

    const files = Array.isArray(raw.files)
      ? prepareUploadBatchSchema.parse(raw).files
      : [prepareUploadItemSchema.parse(raw)];

    const data = await prepareSignedUploadBatch({ orgId, files });
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
