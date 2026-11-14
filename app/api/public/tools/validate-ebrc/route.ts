import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit/memory-rate-limiter";
import {
  autoFixBulkEbrcRows,
  parseBulkEbrcWorkbook,
  validateBulkEbrcRows,
} from "@/lib/ebrc/validator";
import { buildBulkEbrcWorkbook } from "@/lib/ebrc/generator";
import { EBRC_MAX_FILE_BYTES } from "@/config/ebrc";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rateCheck = checkRateLimit(ip, "ebrc_validate", 30, 3600);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.friendlyMessage },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.resetSeconds) },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const autoFixRequested = searchParams.get("autoFix") === "true";

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Please upload a valid .xlsx Bulk eBRC Excel file." },
        { status: 400 }
      );
    }

    if (file.size > EBRC_MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File size exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse workbook in memory
    const parsed = await parseBulkEbrcWorkbook(buffer);

    if (parsed.headerErrors.length > 0) {
      return NextResponse.json(
        {
          valid: false,
          totalRows: parsed.rows.length,
          errorRowsCount: parsed.rows.length,
          autoFixableCount: 0,
          headerErrors: parsed.headerErrors,
          errors: parsed.headerErrors,
          memoryOnlyNotice:
            "Your file was processed strictly in memory and was not saved to any database or storage bucket.",
        },
        { status: 200 }
      );
    }

    // Validate rows
    const validation = validateBulkEbrcRows(parsed.rows);

    if (autoFixRequested) {
      const fixed = autoFixBulkEbrcRows(parsed.rows);
      const generated = await buildBulkEbrcWorkbook(fixed.rows);

      return new NextResponse(generated.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="dgft-bulk-ebrc-autofixed.xlsx"',
          "X-Autofix-Count": String(fixed.fixesApplied),
        },
      });
    }

    return NextResponse.json({
      valid: validation.valid,
      totalRows: validation.totalRows,
      errorRowsCount: validation.errorRowsCount,
      autoFixableCount: validation.autoFixableCount,
      totalAmountByCurrency: validation.totalAmountByCurrency,
      errors: validation.errors.slice(0, 100), // Cap payload to first 100 errors for fast mobile display
      totalErrors: validation.errors.length,
      memoryOnlyNotice:
        "Your file was validated strictly in memory and was not saved to any database or storage bucket.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
