import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { parsePendingDocumentsForOrg } from "@/lib/documents/parse-repository";

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(rawLimit) ? rawLimit : 20;

    const result = await parsePendingDocumentsForOrg({ orgId, limit });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
