import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, ValidationError } from "@/lib/auth/errors";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  commitScrollImportForOrg,
  previewScrollImportForOrg,
  recalculateIncentivesForOrg,
} from "@/lib/incentives/repository";
import { extractTabularUploadFromFormData } from "@/lib/incentives/upload-helpers";
import { commitScrollImportSchema } from "@/lib/validation/incentives";

export async function POST(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    await requireOrgAccess(orgId, "member");

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const iecId = String(formData.get("iecId") ?? "").trim();
      if (!iecId) {
        throw new ValidationError(
          "Select an active IEC profile (`iecId`) before importing a scroll."
        );
      }
      const { filename, bytes } = await extractTabularUploadFromFormData(formData);
      const preview = await previewScrollImportForOrg({
        orgId,
        iecId,
        filename,
        bytes,
      });
      return NextResponse.json({ mode: "preview", ...preview });
    }

    const body = await request.json();
    const parsed = commitScrollImportSchema.parse(body);
    const result = await commitScrollImportForOrg({
      orgId,
      iecId: parsed.iecId,
      rows: parsed.rows,
    });
    await recalculateIncentivesForOrg({ orgId, iecId: parsed.iecId });
    return NextResponse.json({ mode: "commit", ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
