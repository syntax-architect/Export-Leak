import { NextResponse, type NextRequest } from "next/server";
import { BadRequestError, toErrorResponse } from "@/lib/auth/errors";
import { verifySubscriptionPaymentSignature } from "@/lib/billing/razorpay";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      razorpay_payment_id?: string;
      razorpay_subscription_id?: string;
      razorpay_signature?: string;
    };

    const paymentId = body.razorpay_payment_id?.trim();
    const subscriptionId = body.razorpay_subscription_id?.trim();
    const signature = body.razorpay_signature?.trim();

    if (!paymentId || !subscriptionId || !signature) {
      throw new BadRequestError(
        "Missing required payment verification parameters (razorpay_payment_id, razorpay_subscription_id, razorpay_signature)."
      );
    }

    const isValid = verifySubscriptionPaymentSignature({
      paymentId,
      subscriptionId,
      signature,
    });

    if (!isValid) {
      return NextResponse.json(
        {
          verified: false,
          error: "Invalid payment signature.",
        },
        { status: 400 }
      );
    }

    // Hard Rule 10 & Prompt 13: This result is used ONLY to update the UI message.
    // It NEVER activates the plan on the server. The webhook is the sole source of truth.
    return NextResponse.json({
      verified: true,
      message: "Payment signature verified. Waiting for webhook activation.",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
