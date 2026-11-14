import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit/memory-rate-limiter";
import { calculatePublicIncentive } from "@/lib/incentives/public-lookup";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rateCheck = checkRateLimit(ip, "calculate_incentive", 100, 3600);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.friendlyMessage },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.resetSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { hsCode, fobInr, quantity, uqc, scheme, shippingDate } = body || {};

    if (!hsCode || typeof hsCode !== "string") {
      return NextResponse.json(
        { error: "Valid 8-digit HS code is required (e.g. 61091000)." },
        { status: 400 }
      );
    }

    const cleanHs = hsCode.replace(/[^0-9]/g, "").slice(0, 8);
    if (cleanHs.length !== 8) {
      return NextResponse.json({ error: "HS code must be exactly 8 digits." }, { status: 400 });
    }

    const fobNum = Number(fobInr);
    if (isNaN(fobNum) || fobNum <= 0) {
      return NextResponse.json(
        { error: "FOB value must be a positive numeric amount." },
        { status: 400 }
      );
    }

    // Convert INR to paise minor units
    const fobMinor = Math.round(fobNum * 100);

    const result = await calculatePublicIncentive({
      hsCode: cleanHs,
      fobMinor,
      quantity: quantity ? Number(quantity) : undefined,
      uqc: uqc ? String(uqc).trim().toUpperCase() : undefined,
      scheme: scheme || "all",
      shippingDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rateCheck = checkRateLimit(ip, "calculate_incentive", 100, 3600);
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
    const hsCode = searchParams.get("hsCode") || "";
    const fobInr = searchParams.get("fobInr") || "100000";
    const quantity = searchParams.get("quantity") || undefined;
    const uqc = searchParams.get("uqc") || undefined;
    const scheme =
      (searchParams.get("scheme") as "rodtep" | "drawback" | "rosctl" | "all") || "all";
    const shippingDate = searchParams.get("shippingDate") || undefined;

    const cleanHs = hsCode.replace(/[^0-9]/g, "").slice(0, 8);
    if (cleanHs.length !== 8) {
      return NextResponse.json({ error: "HS code must be exactly 8 digits." }, { status: 400 });
    }

    const fobNum = Number(fobInr);
    if (isNaN(fobNum) || fobNum <= 0) {
      return NextResponse.json(
        { error: "FOB value must be a positive numeric amount." },
        { status: 400 }
      );
    }

    const fobMinor = Math.round(fobNum * 100);

    const result = await calculatePublicIncentive({
      hsCode: cleanHs,
      fobMinor,
      quantity: quantity ? Number(quantity) : undefined,
      uqc: uqc ? String(uqc).trim().toUpperCase() : undefined,
      scheme,
      shippingDate,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
