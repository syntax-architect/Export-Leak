import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { BadRequestError, toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_ORG_COOKIE, requireOrgAccess } from "@/lib/auth/org-access";
import { cancelOrganizationSubscription } from "@/lib/billing/razorpay";
import { enforceRateLimit } from "@/lib/rate-limit/memory-rate-limiter";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.VITEST) {
      const rateCheck = enforceRateLimit(request, "billing_cancel", "MUTATIONS");
      if (!rateCheck.allowed) return rateCheck.response;
    }

    const body = (await request.json().catch(() => ({}))) as {
      orgId?: string;
    };

    const cookieStore = await cookies();
    const resolvedOrgId =
      body.orgId ||
      request.nextUrl.searchParams.get("orgId") ||
      cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

    if (!resolvedOrgId) {
      throw new BadRequestError("Organization ID is required.");
    }

    const access = await requireOrgAccess(resolvedOrgId, "admin");

    const result = await cancelOrganizationSubscription({
      orgId: access.orgId,
      actorId: access.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
