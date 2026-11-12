import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { updateAlertForOrg } from "@/lib/dashboard/repository";
import { alertActionSchema } from "@/lib/validation/deadlines";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; alertId: string }> }
) {
  try {
    const { orgId, alertId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const body = await request.json();
    const parsed = alertActionSchema.parse(body);
    const alert = await updateAlertForOrg(orgId, alertId, parsed);
    return NextResponse.json({ alert });
  } catch (error) {
    return toErrorResponse(error);
  }
}
