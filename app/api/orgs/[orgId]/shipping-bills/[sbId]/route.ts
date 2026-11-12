import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  confirmAndSaveShippingBillReview,
  getShippingBillForReview,
} from "@/lib/documents/parse-repository";
import { ConfirmShippingBillReviewSchema } from "@/lib/validation/shipping-bills";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; sbId: string }> }
) {
  try {
    const { orgId, sbId } = await context.params;
    const detail = await getShippingBillForReview({ orgId, sbId });
    return NextResponse.json({ shippingBill: detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; sbId: string }> }
) {
  try {
    const { orgId, sbId } = await context.params;
    const access = await requireOrgAccess(orgId, "member");
    const body = await request.json();
    const parsed = ConfirmShippingBillReviewSchema.parse(body);

    const updated = await confirmAndSaveShippingBillReview({
      orgId: access.orgId,
      sbId,
      input: parsed,
    });
    return NextResponse.json({ shippingBill: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
