import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { isPgliteTestAdapterEnabled, isSupabaseConfigured } from "@/lib/supabase/config";

function isProtectedAppRoute(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isOnboardingRoute(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

function redirectToLogin(request: NextRequest, errorCode?: string): NextResponse {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  if (errorCode) {
    loginUrl.searchParams.set("error", errorCode);
  }
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = isProtectedAppRoute(pathname) || isOnboardingRoute(pathname);

  const testSessionCookie = request.cookies.get("exportleak_test_session")?.value;
  if (
    isPgliteTestAdapterEnabled() ||
    (process.env.NODE_ENV !== "production" && testSessionCookie)
  ) {
    const { TEST_SESSION_COOKIE, asPgliteUser, verifyTestSession } =
      await import("@/lib/auth/pglite-adapter");
    const user = verifyTestSession(request.cookies.get(TEST_SESSION_COOKIE)?.value);

    if (!user && needsAuth) {
      return redirectToLogin(request);
    }

    if (user && isProtectedAppRoute(pathname)) {
      const orgCount = await asPgliteUser(user.id, async (tx) => {
        const res = await tx.query<{ count: string }>(
          `select count(*)::text as count from public.memberships where user_id = $1`,
          [user.id]
        );
        return Number(res.rows[0]?.count ?? 0);
      });

      if (orgCount === 0) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
    }

    return NextResponse.next();
  }

  if (!isSupabaseConfigured()) {
    if (needsAuth) {
      return redirectToLogin(request, "auth_unconfigured");
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && needsAuth) {
    return redirectToLogin(request);
  }

  if (user && isProtectedAppRoute(pathname)) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*", "/login", "/invite/:path*"],
};
