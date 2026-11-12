import { NextResponse } from "next/server";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/auth/org-access";
import { isPgliteTestAdapterEnabled, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isPgliteTestAdapterEnabled() && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACTIVE_ORG_COOKIE);
  response.cookies.delete(ACTIVE_IEC_COOKIE);

  if (isPgliteTestAdapterEnabled()) {
    const { TEST_SESSION_COOKIE } = await import("@/lib/auth/pglite-adapter");
    response.cookies.delete(TEST_SESSION_COOKIE);
  }

  return response;
}
