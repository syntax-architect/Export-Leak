import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { listShippingBillsForOrg } from "@/lib/documents/parse-repository";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const { searchParams } = new URL(request.url);
    const iecId = searchParams.get("iecId");
    const statusFilter = searchParams.get("status") ?? "all";

    const result = await listShippingBillsForOrg({
      orgId,
      iecId,
      statusFilter,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
