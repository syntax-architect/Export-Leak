import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_IEC_COOKIE } from "@/lib/auth/org-access";
import {
  createDemoWorkspaceForOrg,
  deleteDemoWorkspaceForOrg,
  getDashboardSummary,
} from "@/lib/onboarding/repository";

export async function POST(_request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const created = await createDemoWorkspaceForOrg(orgId);
    const summary = await getDashboardSummary(orgId, created.iecId);

    const response = NextResponse.json(
      { ...created, summary },
      { status: created.alreadyExists ? 200 : 201 }
    );
    response.cookies.set(ACTIVE_IEC_COOKIE, created.iecId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    const result = await deleteDemoWorkspaceForOrg(orgId);
    const response = NextResponse.json(result);
    response.cookies.delete(ACTIVE_IEC_COOKIE);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
