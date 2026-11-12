import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { createTeamInvite } from "@/lib/auth/repository";
import { createInviteSchema } from "@/lib/validation/auth";

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const body = await request.json();
    const parsed = createInviteSchema.parse(body);

    const { invite, rawToken } = await createTeamInvite({
      orgId,
      email: parsed.email,
      role: parsed.role,
    });

    const invitePath = `/invite/${rawToken}`;
    const appOrigin = new URL(request.url).origin;

    return NextResponse.json(
      {
        invite,
        inviteUrl: `${appOrigin}${invitePath}`,
        invitePath,
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
