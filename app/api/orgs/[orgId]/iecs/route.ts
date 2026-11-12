import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { createIecProfile, listIecProfilesWithAlerts } from "@/lib/auth/repository";
import { createIecSchema } from "@/lib/validation/auth";

export async function GET(_request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const iecs = await listIecProfilesWithAlerts(orgId);
    return NextResponse.json({ iecs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const body = await request.json();
    const parsed = createIecSchema.parse(body);

    const iec = await createIecProfile({
      orgId,
      iecCode: parsed.iecCode,
      legalName: parsed.legalName,
      gstin: parsed.gstin ?? null,
      adBankName: parsed.adBankName ?? null,
    });

    return NextResponse.json({ iec }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
