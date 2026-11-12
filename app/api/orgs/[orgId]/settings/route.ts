import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getOrgAiParsingSetting,
  updateOrgAiParsingSetting,
} from "@/lib/documents/parse-repository";
import { OrgSettingsPatchSchema } from "@/lib/validation/shipping-bills";

export async function GET(_request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const settings = await getOrgAiParsingSetting(orgId);
    return NextResponse.json(settings);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "admin");
    const body = await request.json();
    const parsed = OrgSettingsPatchSchema.parse(body);

    const updated = await updateOrgAiParsingSetting({
      orgId: access.orgId,
      aiParsingEnabled: parsed.aiParsingEnabled,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
