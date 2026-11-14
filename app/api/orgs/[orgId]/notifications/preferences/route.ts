import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/alerts/preferences";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "viewer");
    const { searchParams } = new URL(request.url);
    const iecId = searchParams.get("iecId");

    const preferences = await getNotificationPreferences(orgId, access.user.id, iecId);
    return NextResponse.json({ preferences });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "viewer");
    const body = await request.json();
    const { iecId, ...input } = body || {};

    const preferences = await updateNotificationPreferences(orgId, access.user.id, input, iecId);
    return NextResponse.json({ preferences });
  } catch (error) {
    return toErrorResponse(error);
  }
}
