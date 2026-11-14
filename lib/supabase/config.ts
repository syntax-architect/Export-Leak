export function isPgliteTestAdapterEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.EXPORTLEAK_E2E_ADAPTER === "pglite" ||
    process.env.EXPORTLEAK_FORCE_DEV_LOGIN === "true" ||
    !isSupabaseConfigured()
  );
}

export function isForceLoginAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url && anonKey && !url.includes("your-project") && !anonKey.includes("your-supabase")
  );
}

export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are not configured.");
  }
  return { url, anonKey };
}

export function getSupabaseServiceEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role environment variables are not configured.");
  }
  return { url, serviceRoleKey };
}
