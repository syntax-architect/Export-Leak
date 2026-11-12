import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { listMembersAndInvites } from "@/lib/auth/repository";

export async function GET(_request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const result = await listMembersAndInvites(orgId);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
