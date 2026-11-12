import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, ValidationError } from "@/lib/auth/errors";
import { ACTIVE_IEC_COOKIE, requireOrgAccess } from "@/lib/auth/org-access";
import { buildLeakageReportPdf, buildLeakageReportWorkbook } from "@/lib/dashboard/export-report";
import { getLeakageDashboardData, recordReportExportAudit } from "@/lib/dashboard/repository";

export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "viewer");

    const format = request.nextUrl.searchParams.get("format") ?? "pdf";
    if (format !== "pdf" && format !== "xlsx") {
      throw new ValidationError("format must be 'pdf' or 'xlsx'.");
    }

    const cookieStore = await cookies();
    const activeIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null;
    const data = await getLeakageDashboardData(orgId, activeIecId);

    await recordReportExportAudit({
      orgId,
      format,
      shipmentCount: data.shipments.length,
      unclaimedIncentivePaise: data.summary.unclaimedIncentivePaise,
    });

    const safeSlug =
      data.summary.orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "exportleak";

    if (format === "pdf") {
      const pdfBytes = await buildLeakageReportPdf(data);
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeSlug}-leakage-report.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const xlsxBytes = await buildLeakageReportWorkbook(data);
    return new NextResponse(Buffer.from(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeSlug}-leakage-report.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
