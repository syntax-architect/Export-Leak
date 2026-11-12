import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  createSavedViewForOrg,
  deleteSavedViewForOrg,
  getLeakageDashboardData,
} from "@/lib/dashboard/repository";
import { createSavedViewSchema } from "@/lib/validation/deadlines";

export async function GET(_request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "viewer");
    const data = await getLeakageDashboardData(orgId);
    return NextResponse.json({ savedViews: data.savedViews });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const body = await request.json();
    const parsed = createSavedViewSchema.parse(body);
    const savedView = await createSavedViewForOrg(orgId, parsed);
    return NextResponse.json({ savedView }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const viewId = request.nextUrl.searchParams.get("viewId")?.trim();
    if (!viewId) {
      throw new ValidationError("viewId query parameter is required.");
    }
    await deleteSavedViewForOrg(orgId, viewId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
