import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, requireOrgAccess } from "@/lib/auth/org-access";
import { setActiveOrgSchema } from "@/lib/validation/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = setActiveOrgSchema.parse(body);

    await requireOrgAccess(parsed.orgId, "viewer");

    const response = NextResponse.json({
      ok: true,
      orgId: parsed.orgId,
      iecId: parsed.iecId ?? null,
    });
    response.cookies.set(ACTIVE_ORG_COOKIE, parsed.orgId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });

    if (parsed.iecId) {
      response.cookies.set(ACTIVE_IEC_COOKIE, parsed.iecId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    } else {
      response.cookies.delete(ACTIVE_IEC_COOKIE);
    }

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
