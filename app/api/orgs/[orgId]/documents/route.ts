import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { createDocumentRecord } from "@/lib/auth/repository";
import { getOrgDocumentBatchSummary } from "@/lib/documents/parse-repository";
import { commitUploadedDocument, listDocumentsWithUsage } from "@/lib/documents/repository";
import { createDocumentStubSchema } from "@/lib/validation/auth";
import {
  commitUploadedDocumentSchema,
  documentKindSchema,
  documentParseStatusSchema,
} from "@/lib/validation/documents";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const { searchParams } = new URL(request.url);

    const rawKind = searchParams.get("kind");
    const rawStatus = searchParams.get("status");
    const kind = rawKind && rawKind !== "all" ? documentKindSchema.parse(rawKind) : undefined;
    const parseStatus =
      rawStatus && rawStatus !== "all" ? documentParseStatusSchema.parse(rawStatus) : undefined;
    const search = searchParams.get("q") ?? undefined;
    const dateFrom = searchParams.get("from") || undefined;
    const dateTo = searchParams.get("to") || undefined;

    const [data, batchSummary] = await Promise.all([
      listDocumentsWithUsage(orgId, {
        search,
        kind,
        parseStatus,
        dateFrom,
        dateTo,
      }),
      getOrgDocumentBatchSummary(orgId),
    ]);
    return NextResponse.json({ ...data, batchSummary });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const raw = (await request.json()) as Record<string, unknown>;

    if ("storagePath" in raw && "sha256" in raw && "docId" in raw) {
      const parsed = commitUploadedDocumentSchema.parse(raw);
      const result = await commitUploadedDocument({
        orgId,
        docId: parsed.docId,
        iecId: parsed.iecId,
        kind: parsed.kind,
        originalName: parsed.originalName,
        sha256: parsed.sha256,
        storagePath: parsed.storagePath,
        fileSizeBytes: parsed.fileSizeBytes,
        mimeType: parsed.mimeType,
      });

      return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
    }

    const parsed = createDocumentStubSchema.parse(raw);
    const { trialStarted, ...document } = await createDocumentRecord({
      orgId,
      iecId: parsed.iecId,
      kind: parsed.kind,
      originalName: parsed.originalName,
    });

    return NextResponse.json({ document, trialStarted: Boolean(trialStarted) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
