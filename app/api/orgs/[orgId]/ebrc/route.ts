import { NextResponse, type NextRequest } from "next/server";
import { ValidationError, toErrorResponse } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  generateBulkEbrcExportForOrg,
  getEbrcWorkspaceData,
  validateOrFixOrgEbrcRows,
} from "@/lib/ebrc/repository";
import { EbrcActionSchema, EbrcPreviewQuerySchema } from "@/lib/validation/ebrc";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const access = await requireOrgAccess(orgId, "viewer");
    const url = new URL(request.url);

    const rawIecId = url.searchParams.get("iecId");
    const rawDateFrom = url.searchParams.get("dateFrom");
    const rawDateTo = url.searchParams.get("dateTo");
    const rawIrmIds = url.searchParams.getAll("irmId").filter(Boolean);

    const parsed = EbrcPreviewQuerySchema.safeParse({
      iecId: rawIecId || undefined,
      dateFrom: rawDateFrom || undefined,
      dateTo: rawDateTo || undefined,
      irmIds: rawIrmIds.length > 0 ? rawIrmIds : undefined,
    });

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid eBRC preview filters.");
    }

    const data = await getEbrcWorkspaceData({
      orgId: access.orgId,
      iecId: parsed.data.iecId ?? null,
      dateFrom: parsed.data.dateFrom ?? null,
      dateTo: parsed.data.dateTo ?? null,
      irmIds: parsed.data.irmIds,
    });

    return NextResponse.json(data);
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

    const parsed = EbrcActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid eBRC payload.");
    }

    const { action, iecId, rows } = parsed.data;

    if (action === "validate" || action === "autofix") {
      const result = await validateOrFixOrgEbrcRows({
        orgId: access.orgId,
        iecId: iecId ?? null,
        rows,
        applyAutoFix: action === "autofix",
      });
      return NextResponse.json(result);
    }

    const generated = await generateBulkEbrcExportForOrg({
      orgId: access.orgId,
      iecId: iecId ?? null,
      rows,
    });

    return new NextResponse(new Uint8Array(generated.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${generated.filename}"`,
        "X-ExportLeak-Template-Version": generated.templateVersion,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
