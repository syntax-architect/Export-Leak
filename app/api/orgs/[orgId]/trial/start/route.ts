import { NextResponse } from "next/server";
import { ConflictError, toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { startTrial } from "@/lib/billing/trial";

export async function POST(_request: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "member");
    const result = await startTrial(access.orgId, access.user.id);

    if (!result.started && !result.alreadyTrialingOrPaid) {
      throw new ConflictError(
        result.reason ?? "This organization is not eligible for another 7-day Pro trial."
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
