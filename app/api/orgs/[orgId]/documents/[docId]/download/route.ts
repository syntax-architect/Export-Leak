import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/auth/errors";
import { getDocumentDownload } from "@/lib/documents/repository";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; docId: string }> }
) {
  try {
    const { orgId, docId } = await context.params;
    const { originalName, target } = await getDocumentDownload({ orgId, docId });
    const modeParam = new URL(request.url).searchParams.get("mode");

    if (target.mode === "redirect") {
      if (modeParam === "json") {
        return NextResponse.json({ url: target.url });
      }
      return NextResponse.redirect(target.url, { status: 302 });
    }

    const safeName =
      path
        .basename(originalName)
        .replace(/[^\w.\-() ]+/g, "_")
        .slice(0, 120) || "document";

    if (modeParam === "json") {
      return NextResponse.json({
        url: `/api/orgs/${orgId}/documents/${docId}/download`,
        fileName: safeName,
      });
    }

    return new NextResponse(new Uint8Array(target.bytes), {
      status: 200,
      headers: {
        "Content-Type": target.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
