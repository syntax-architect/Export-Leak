import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, NotFoundError, BadRequestError } from "@/lib/auth/errors";
import {
  getPreferenceByUnsubscribeToken,
  unsubscribeByToken,
  resubscribeByToken,
} from "@/lib/alerts/preferences";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim();
    if (!token) {
      throw new BadRequestError("Missing unsubscribe token.");
    }

    const pref = await getPreferenceByUnsubscribeToken(token);
    if (!pref) {
      throw new NotFoundError("Invalid or expired unsubscribe link.");
    }

    return NextResponse.json({
      valid: true,
      unsubscribed: Boolean(pref.unsubscribedAt),
      unsubscribedAt: pref.unsubscribedAt,
      digestFrequency: pref.digestFrequency,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token?.trim();
    if (!token) {
      throw new BadRequestError("Missing unsubscribe token.");
    }

    const pref = await getPreferenceByUnsubscribeToken(token);
    if (!pref) {
      throw new NotFoundError("Invalid or expired unsubscribe link.");
    }

    const action = body?.action === "resubscribe" ? "resubscribe" : "unsubscribe";

    if (action === "resubscribe") {
      await resubscribeByToken(token);
      return NextResponse.json({
        success: true,
        action: "resubscribed",
        message: "You have been resubscribed to compliance notifications and digests.",
      });
    }

    const result = await unsubscribeByToken(token);
    return NextResponse.json({
      success: true,
      action: "unsubscribed",
      unsubscribedAt: result.unsubscribedAt,
      message:
        "You have been unsubscribed from compliance alerts and digests. You will still receive essential account and billing receipts.",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
