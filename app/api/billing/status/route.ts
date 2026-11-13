import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { BadRequestError, toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_ORG_COOKIE, requireOrgAccess } from "@/lib/auth/org-access";
import { getOrganizationBillingStatus } from "@/lib/billing/razorpay";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const resolvedOrgId =
      request.nextUrl.searchParams.get("orgId") || cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

    if (!resolvedOrgId) {
      throw new BadRequestError("Organization ID is required.");
    }

    const access = await requireOrgAccess(resolvedOrgId, "viewer");
    const status = await getOrganizationBillingStatus(access.orgId);

    return NextResponse.json(status);
  } catch (error) {
    return toErrorResponse(error);
  }
}
