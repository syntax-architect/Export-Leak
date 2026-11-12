import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { deleteScripForOrg, updateScripForOrg } from "@/lib/incentives/repository";
import { updateScripSchema } from "@/lib/validation/incentives";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; scripId: string }> }
) {
  try {
    const { orgId, scripId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const body = await request.json();
    const parsed = updateScripSchema.parse(body);
    const updated = await updateScripForOrg({
      orgId,
      scripId,
      status: parsed.status,
      expiresOn: parsed.expiresOn,
      notes: parsed.notes,
    });
    return NextResponse.json({ scrip: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; scripId: string }> }
) {
  try {
    const { orgId, scripId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const result = await deleteScripForOrg({ orgId, scripId });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
