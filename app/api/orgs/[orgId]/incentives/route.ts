import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getIncentivesWorkspaceForOrg,
  recalculateIncentivesForOrg,
} from "@/lib/incentives/repository";
import { recalculateIncentivesSchema } from "@/lib/validation/incentives";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "viewer");
    const iecId = request.nextUrl.searchParams.get("iecId") ?? undefined;
    const workspace = await getIncentivesWorkspaceForOrg({ orgId, iecId });
    return NextResponse.json(workspace);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const body = await request.json().catch(() => ({}));
    const parsed = recalculateIncentivesSchema.parse(body);
    const result = await recalculateIncentivesForOrg({
      orgId,
      iecId: parsed.iecId,
      shippingBillId: parsed.shippingBillId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
