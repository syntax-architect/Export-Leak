import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/auth/errors";
import { requirePlatformAdmin } from "@/lib/auth/org-access";
import { extendOrganizationTrial } from "@/lib/billing/trial";

const extendTrialSchema = z.object({
  orgId: z.string().uuid("Valid organization ID is required."),
  days: z.number().int().min(1).max(90),
  reason: z.string().trim().min(3).max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await request.json();
    const parsed = extendTrialSchema.parse(body);
    const result = await extendOrganizationTrial({
      orgId: parsed.orgId,
      days: parsed.days,
      adminUserId: admin.id,
      reason: parsed.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
