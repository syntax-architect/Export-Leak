import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { createOrganization, listUserOrganizations } from "@/lib/auth/repository";
import { createOrgSchema, mapRoleChoiceToOrgType } from "@/lib/validation/auth";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }
    const organizations = await listUserOrganizations(user.id);
    return NextResponse.json({ organizations });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }

    const body = await request.json();
    const parsed = createOrgSchema.parse(body);
    const orgType = mapRoleChoiceToOrgType(parsed.roleChoice);

    const organization = await createOrganization({
      user,
      name: parsed.name,
      type: orgType,
    });

    const response = NextResponse.json({ organization }, { status: 201 });
    response.cookies.set(ACTIVE_ORG_COOKIE, organization.orgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
