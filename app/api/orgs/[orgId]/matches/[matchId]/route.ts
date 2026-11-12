import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError, toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { unmatchRemittanceForOrg } from "@/lib/matching/irm-repository";

const UuidSchema = z.string().uuid();

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; matchId: string }> }
) {
  try {
    const { orgId, matchId } = await context.params;
    const access = await requireOrgAccess(orgId, "member");
    const idCheck = UuidSchema.safeParse(matchId);
    if (!idCheck.success) {
      throw new ValidationError("Invalid match identifier.");
    }

    await unmatchRemittanceForOrg({
      orgId: access.orgId,
      matchId: idCheck.data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
