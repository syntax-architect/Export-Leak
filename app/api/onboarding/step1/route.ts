import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { saveOnboardingStepOne } from "@/lib/onboarding/repository";
import { onboardingStepOneSchema } from "@/lib/validation/onboarding";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }

    const body = await request.json();
    const parsed = onboardingStepOneSchema.parse(body);

    const result = await saveOnboardingStepOne({
      user,
      roleChoice: parsed.roleChoice,
      name: parsed.name,
      iecCode: parsed.iecCode,
      gstin: parsed.gstin,
    });

    const response = NextResponse.json(result, { status: 201 });
    response.cookies.set(ACTIVE_ORG_COOKIE, result.organization.orgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
