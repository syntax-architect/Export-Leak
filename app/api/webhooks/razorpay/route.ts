import { NextResponse, type NextRequest } from "next/server";
import { processRazorpayWebhook } from "@/lib/billing/webhook-processor";

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body text FIRST before any JSON parsing
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const eventIdHeader = request.headers.get("x-razorpay-event-id");

    // 2. Process webhook through cryptographic signature verification,
    // unique event insertion, and state machine transitions
    const result = await processRazorpayWebhook({
      rawBody,
      signature,
      eventIdHeader,
    });

    return NextResponse.json({
      received: true,
      status: result.status,
      eventId: result.eventId,
      eventType: result.eventType,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Webhook processing failed";

    // If signature check failed, return 400 (fail closed)
    if (errorMsg.includes("signature") || errorMsg.includes("Invalid JSON")) {
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    // For database or server errors, log error and return 500 so Razorpay retries
    console.error("Razorpay webhook processing error:", error);
    const safeMsg =
      process.env.NODE_ENV === "production" ? "Webhook processing failed" : errorMsg;
    return NextResponse.json({ error: safeMsg }, { status: 500 });
  }
}
