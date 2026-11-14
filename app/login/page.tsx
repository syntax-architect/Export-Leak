import { LoginForm } from "@/components/auth/login-form";
import { isPgliteTestAdapterEnabled, isSupabaseConfigured } from "@/lib/supabase/config";
import { sanitizeNextPath } from "@/lib/validation/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next, "/app");

  return (
    <main
      id="main-content"
      className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-4 py-10"
    >
      <LoginForm
        nextPath={nextPath}
        initialError={params.error}
        supabaseEnabled={isSupabaseConfigured()}
        pgliteTestMode={isPgliteTestAdapterEnabled()}
      />
    </main>
  );
}
