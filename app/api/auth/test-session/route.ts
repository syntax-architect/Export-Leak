import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";

const testSignInSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((v) => v.toLowerCase()),
  isPlatformAdmin: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || !isPgliteTestAdapterEnabled()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const parsed = testSignInSchema.parse(body);

    const { TEST_SESSION_COOKIE, ensurePgliteUser, signTestSession } =
      await import("@/lib/auth/pglite-adapter");
    const baseUser = await ensurePgliteUser(parsed.email);
    const user = {
      ...baseUser,
      isPlatformAdmin: Boolean(parsed.isPlatformAdmin),
    };
    const signedCookie = signTestSession(user);

    const response = NextResponse.json({ user });
    response.cookies.set(TEST_SESSION_COOKIE, signedCookie, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    response.cookies.delete(ACTIVE_ORG_COOKIE);
    response.cookies.delete(ACTIVE_IEC_COOKIE);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
