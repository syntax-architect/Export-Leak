import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { createOrImportScripsForOrg } from "@/lib/incentives/repository";
import { batchImportScripsSchema, createScripItemSchema } from "@/lib/validation/incentives";

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "member");
    const body = await request.json();

    if (body && typeof body === "object" && Array.isArray((body as { scrips?: unknown }).scrips)) {
      const parsed = batchImportScripsSchema.parse(body);
      const result = await createOrImportScripsForOrg({
        orgId,
        iecId: parsed.iecId,
        items: parsed.scrips,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const parsed = createScripItemSchema.parse(body);
    const result = await createOrImportScripsForOrg({
      orgId,
      iecId: parsed.iecId,
      items: [parsed],
    });
    return NextResponse.json({ scrip: result.scrips[0], scrips: result.scrips }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
