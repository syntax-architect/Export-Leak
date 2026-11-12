import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_IEC_COOKIE, requireOrgAccess } from "@/lib/auth/org-access";
import { getLeakageDashboardData } from "@/lib/dashboard/repository";
import { getDashboardSummary } from "@/lib/onboarding/repository";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "viewer");
    const cookieStore = await cookies();
    const queryIecId = request.nextUrl.searchParams.get("iecId");
    const activeIecId =
      queryIecId === "all"
        ? null
        : (queryIecId ?? cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null);

    const view = request.nextUrl.searchParams.get("view");
    if (view === "full") {
      const [summary, dashboard] = await Promise.all([
        getDashboardSummary(orgId, activeIecId),
        getLeakageDashboardData(orgId, activeIecId),
      ]);
      return NextResponse.json({ summary, dashboard });
    }

    const summary = await getDashboardSummary(orgId, activeIecId);
    return NextResponse.json({ summary });
  } catch (error) {
    return toErrorResponse(error);
  }
}
