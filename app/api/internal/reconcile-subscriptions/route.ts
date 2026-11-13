import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { runDailySubscriptionReconciliationJob } from "@/lib/billing/reconciliation";

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.EXPORTLEAK_INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  const actualBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(secret, "utf8");
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      throw new UnauthorizedError("Invalid cron authorization.");
    }

    const result = await runDailySubscriptionReconciliationJob();
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
