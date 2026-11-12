import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/validation/auth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const errorParam = searchParams.get("error") ?? searchParams.get("error_code");
  const nextPath = sanitizeNextPath(searchParams.get("next"), "/app");

  if (errorParam) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set(
      "error",
      errorParam.includes("expired") || errorParam === "access_denied"
        ? "expired_link"
        : "auth_failed"
    );
    if (nextPath !== "/app") {
      loginUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=auth_unconfigured", origin));
  }

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "expired_link");
      return NextResponse.redirect(loginUrl);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "expired_link");
      return NextResponse.redirect(loginUrl);
    }
  } else {
    return NextResponse.redirect(new URL("/login?error=expired_link", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=expired_link", origin));
  }

  if (nextPath.startsWith("/invite/")) {
    return NextResponse.redirect(new URL(nextPath, origin));
  }

  const [{ data: membership }, { data: obProfile }] = await Promise.all([
    supabase.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("completed_at, skipped_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const onboardingDone = Boolean(obProfile?.completed_at || obProfile?.skipped_at);
  if (!membership || !onboardingDone) {
    return NextResponse.redirect(new URL("/onboarding", origin));
  }

  return NextResponse.redirect(new URL(nextPath, origin));
}
