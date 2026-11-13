import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { PLANS, type PlanKey } from "@/config/plans";
import { BadRequestError, toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_ORG_COOKIE, requireOrgAccess } from "@/lib/auth/org-access";
import { createOrganizationSubscription } from "@/lib/billing/razorpay";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      planKey?: string;
      orgId?: string;
    };

    if (!body.planKey || !(body.planKey in PLANS)) {
      throw new BadRequestError("A valid planKey is required.");
    }

    const planKey = body.planKey as PlanKey;
    if (planKey === "free" || planKey === "trial_pro") {
      throw new BadRequestError("Cannot subscribe to free or trial plan via Razorpay.");
    }

    const cookieStore = await cookies();
    const resolvedOrgId =
      body.orgId ||
      request.nextUrl.searchParams.get("orgId") ||
      cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

    if (!resolvedOrgId) {
      throw new BadRequestError("Organization ID is required.");
    }

    // Must be admin or owner to manage billing/subscriptions
    const access = await requireOrgAccess(resolvedOrgId, "admin");

    const result = await createOrganizationSubscription({
      orgId: access.orgId,
      actorId: access.user.id,
      planKey,
      customerEmail: access.user.email,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
