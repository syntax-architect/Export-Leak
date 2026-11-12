import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { parseDocumentById } from "@/lib/documents/parse-repository";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; docId: string }> }
) {
  try {
    const { orgId, docId } = await context.params;
    const access = await requireOrgAccess(orgId, "member");
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    const result = await parseDocumentById({
      orgId: access.orgId,
      docId,
      actorUserId: access.user.id,
      force,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
