import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit/memory-rate-limiter";
import { validateMagicBytes } from "@/lib/documents/file-security";
import { extractPdfPagesText } from "@/lib/documents/parsing/pdf-extract";
import { runDeterministicShippingBillParser } from "@/lib/documents/parsing/deterministic-parser";
import type { ParsedShippingBillItemDraft } from "@/lib/documents/parsing/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    // 5 free PDF extractions per 24 hours (86,400 seconds)
    const rateCheck = checkRateLimit(ip, "pdf_extract", 5, 86400);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error:
            "You have reached the free limit of 5 Shipping Bill PDF extractions for today. Create a free ExportLeak account for unlimited uploads, automated bank IRM matching, and bulk DGFT eBRC generation.",
          limitReached: true,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.resetSeconds) },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const downloadExcel = searchParams.get("format") === "excel";

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data submission." }, { status: 400 });
    }
    const file = formData.get("file");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Please upload a valid Shipping Bill PDF file." },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds the 10 MB maximum limit." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    const magicCheck = validateMagicBytes(pdfBytes, "pdf");
    if (!magicCheck.valid) {
      return NextResponse.json(
        { error: magicCheck.reason ?? "Invalid or unsafe PDF file signature." },
        { status: 400 }
      );
    }

    // In-memory text extraction
    const pdfResult = await extractPdfPagesText(pdfBytes);
    const parsed = runDeterministicShippingBillParser({
      pages: pdfResult.pageTexts,
      usedOcrFallback: false,
    });

    if (downloadExcel) {
      const wb = new ExcelJS.Workbook();
      wb.creator = "ExportLeak Free Extractor";

      // Sheet 1: Header
      const headerSheet = wb.addWorksheet("Shipping Bill");
      headerSheet.columns = [
        { header: "Field", key: "field", width: 28 },
        { header: "Extracted Value", key: "value", width: 40 },
      ];
      headerSheet.addRow({
        field: "Shipping Bill Number",
        value: parsed.sbNumber ?? "Not detected",
      });
      headerSheet.addRow({ field: "Shipping Bill Date", value: parsed.sbDate ?? "Not detected" });
      headerSheet.addRow({ field: "Port Code", value: parsed.portCode ?? "Not detected" });
      headerSheet.addRow({ field: "LEO Date", value: parsed.leoDate ?? "Not detected" });
      headerSheet.addRow({ field: "Invoice Number", value: parsed.invoiceNo ?? "Not detected" });
      headerSheet.addRow({ field: "Buyer Name", value: parsed.buyerName ?? "Not detected" });
      headerSheet.addRow({ field: "Currency", value: parsed.currency ?? "INR" });
      headerSheet.addRow({
        field: "FOB Value",
        value: parsed.fobMinor !== null ? (parsed.fobMinor / 100).toFixed(2) : "Not detected",
      });
      headerSheet.addRow({
        field: "Schemes Claimed",
        value: parsed.schemesClaimed.join(", ") || "None detected",
      });

      // Sheet 2: Line items
      const itemsSheet = wb.addWorksheet("Line Items");
      itemsSheet.columns = [
        { header: "Item #", key: "itemNo", width: 10 },
        { header: "HS Code", key: "hsCode", width: 14 },
        { header: "Description", key: "desc", width: 45 },
        { header: "Quantity", key: "qty", width: 14 },
        { header: "UQC", key: "uqc", width: 10 },
        { header: "Item FOB", key: "fob", width: 16 },
      ];

      parsed.items.forEach((item: ParsedShippingBillItemDraft, idx: number) => {
        itemsSheet.addRow({
          itemNo: idx + 1,
          hsCode: item.hsCode,
          desc: item.description,
          qty: item.quantity,
          uqc: item.uqc,
          fob: (item.fobMinor / 100).toFixed(2),
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="shipping-bill-${parsed.sbNumber || "extracted"}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      extracted: {
        sbNumber: parsed.sbNumber,
        sbDate: parsed.sbDate,
        portCode: parsed.portCode,
        leoDate: parsed.leoDate,
        invoiceNo: parsed.invoiceNo,
        buyerName: parsed.buyerName,
        currency: parsed.currency,
        fobValue: parsed.fobMinor !== null ? parsed.fobMinor / 100 : null,
        schemesClaimed: parsed.schemesClaimed,
        itemsCount: parsed.items.length,
        items: parsed.items.map((i: ParsedShippingBillItemDraft) => ({
          hsCode: i.hsCode,
          description: i.description,
          quantity: i.quantity,
          uqc: i.uqc,
          itemFob: i.fobMinor / 100,
        })),
      },
      remainingFreeUses: rateCheck.remaining,
      conversionNudge:
        "Ready to automate bank IRM matching, calculate RoDTEP discrepancies, and generate your bulk DGFT eBRC file? Start your 7-day card-free trial.",
      memoryOnlyNotice:
        "Your file was processed strictly in memory and was not saved to any database or storage bucket.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
