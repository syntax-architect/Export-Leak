import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError, toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  confirmMatchesForOrg,
  getReconciliationWorkspace,
  rejectMatchSuggestionForOrg,
  runAutoMatchForOrg,
} from "@/lib/matching/irm-repository";
import { MatchesActionSchema } from "@/lib/validation/matching";

const OptionalUuidSchema = z.string().uuid().nullable();

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "viewer");
    const rawIecId = new URL(request.url).searchParams.get("iecId");
    const iecCheck = OptionalUuidSchema.safeParse(rawIecId);
    if (!iecCheck.success) {
      throw new ValidationError("Invalid IEC identifier.");
    }

    const workspace = await getReconciliationWorkspace({
      orgId: access.orgId,
      iecId: iecCheck.data,
    });
    return NextResponse.json(workspace);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "member");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("Invalid JSON request body.");
    }

    const parsed = MatchesActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid match action.");
    }

    const action = parsed.data;
    if (action.action === "auto_match") {
      const result = await runAutoMatchForOrg({
        orgId: access.orgId,
        iecId: action.iecId ?? null,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action.action === "confirm") {
      const confirmedCount = await confirmMatchesForOrg({
        orgId: access.orgId,
        pairs: [action.pair],
      });
      return NextResponse.json({ ok: true, confirmedCount });
    }

    if (action.action === "bulk_confirm") {
      const confirmedCount = await confirmMatchesForOrg({
        orgId: access.orgId,
        pairs: action.pairs,
      });
      return NextResponse.json({ ok: true, confirmedCount });
    }

    await rejectMatchSuggestionForOrg({
      orgId: access.orgId,
      shippingBillId: action.shippingBillId,
      remittanceId: action.remittanceId,
      reason: action.reason,
    });
    return NextResponse.json({ ok: true, rejected: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
