import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { getAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/org-access";
import {
  commitIncentiveRatesImport,
  listIncentiveRates,
  previewIncentiveRatesImport,
  upsertScripValidityRule,
} from "@/lib/incentives/repository";
import { extractTabularUploadFromFormData } from "@/lib/incentives/upload-helpers";
import {
  commitRateImportSchema,
  incentiveSchemeSchema,
  updateScripValidityRuleSchema,
} from "@/lib/validation/incentives";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }

    const rawScheme = request.nextUrl.searchParams.get("scheme");
    const scheme = rawScheme ? incentiveSchemeSchema.parse(rawScheme) : undefined;
    const hsCode = request.nextUrl.searchParams.get("hsCode")?.trim() || undefined;
    const data = await listIncentiveRates({ scheme, hsCode });
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const { filename, bytes } = await extractTabularUploadFromFormData(formData);
      const preview = await previewIncentiveRatesImport({ filename, bytes });
      return NextResponse.json({ mode: "preview", ...preview });
    }

    const body = await request.json();
    const parsed = commitRateImportSchema.parse(body);
    const result = await commitIncentiveRatesImport({
      rows: parsed.rows,
      orgId: parsed.orgId,
    });
    return NextResponse.json({ mode: "commit", ...result }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = await request.json();
    const parsed = updateScripValidityRuleSchema.parse(body);
    const rule = await upsertScripValidityRule({
      confirmed: parsed.confirmed,
      months: parsed.months,
      days: parsed.days,
      sourceNote: parsed.sourceNote,
      effectiveFrom: parsed.effectiveFrom,
      orgId: parsed.orgId,
    });
    return NextResponse.json({ validityRule: rule });
  } catch (error) {
    return toErrorResponse(error);
  }
}
