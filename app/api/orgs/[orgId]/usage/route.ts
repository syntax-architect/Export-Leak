import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getOrgUsageSnapshot } from "@/lib/billing/entitlements";

export async function GET(_request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "viewer");
    const snapshot = await getOrgUsageSnapshot(access.orgId, access.user.id);
    return NextResponse.json(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
