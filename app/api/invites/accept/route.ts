import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { acceptTeamInvite } from "@/lib/auth/repository";
import { acceptInviteSchema } from "@/lib/validation/auth";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }

    const body = await request.json();
    const parsed = acceptInviteSchema.parse(body);
    const result = await acceptTeamInvite({ user, rawToken: parsed.token });

    const response = NextResponse.json(result);
    response.cookies.set(ACTIVE_ORG_COOKIE, result.orgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
