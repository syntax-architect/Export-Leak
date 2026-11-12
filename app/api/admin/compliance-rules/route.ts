import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { getAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/org-access";
import { listComplianceRules, upsertComplianceRule } from "@/lib/dashboard/repository";
import { upsertComplianceRuleSchema } from "@/lib/validation/deadlines";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }
    const rules = await listComplianceRules();
    return NextResponse.json({ rules });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = await request.json();
    const parsed = upsertComplianceRuleSchema.parse(body);
    const rule = await upsertComplianceRule(parsed);
    return NextResponse.json({ rule });
  } catch (error) {
    return toErrorResponse(error);
  }
}
