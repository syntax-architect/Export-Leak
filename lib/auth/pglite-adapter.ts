import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

export const TEST_SESSION_COOKIE = "exportleak_test_session";

function getSigningSecret(): string {
  return process.env.EXPORTLEAK_E2E_SECRET ?? "exportleak-local-test-signing-key";
}

function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("PGlite test adapter is strictly forbidden in production.");
  }
}

export function signTestSession(user: {
  id: string;
  email: string;
  isPlatformAdmin?: boolean;
}): string {
  assertNotProduction();
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      email: user.email,
      isPlatformAdmin: Boolean(user.isPlatformAdmin),
    }),
    "utf8"
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTestSession(
  rawCookie: string | undefined
): { id: string; email: string; isPlatformAdmin: boolean } | null {
  if (!rawCookie || process.env.NODE_ENV === "production") {
    return null;
  }
  const parts = rawCookie.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      id?: unknown;
      email?: unknown;
      isPlatformAdmin?: unknown;
    };
    if (typeof parsed.id === "string" && typeof parsed.email === "string") {
      return {
        id: parsed.id,
        email: parsed.email,
        isPlatformAdmin: parsed.isPlatformAdmin === true,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const globalForPglite = globalThis as unknown as {
  __exportleakPglitePromise?: Promise<PGlite>;
};

async function createAndMigratePglite(): Promise<PGlite> {
  assertNotProduction();
  const { PGlite } = await import("@electric-sql/pglite");

  const isVitest = Boolean(process.env.VITEST);
  const dataDir = isVitest ? undefined : path.resolve(process.cwd(), ".tmp-storage", "pglite-dev");
  if (dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new PGlite(dataDir);
  await db.waitReady;

  let isInitialized = false;
  try {
    const checkRes = await db.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables where table_schema = 'public' and table_name = '_exportleak_migrations'`
    );
    isInitialized = Number(checkRes.rows[0]?.count ?? "0") > 0;
  } catch {
    isInitialized = false;
  }

  if (!isInitialized) {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      create schema if not exists auth;
      create schema if not exists storage;

      create table auth.users (
        id uuid primary key,
        email text unique
      );

      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      create or replace function auth.role()
      returns text
      language sql
      stable
      as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
      $$;

      create or replace function auth.jwt()
      returns jsonb
      language sql
      stable
      as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;

      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );

      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text not null references storage.buckets(id),
        name text not null,
        owner uuid
      );

      alter table storage.objects enable row level security;

      create or replace function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      as $$
        select case
          when array_length(regexp_split_to_array(name, '/'), 1) > 1
          then (regexp_split_to_array(name, '/'))[1:array_length(regexp_split_to_array(name, '/'), 1) - 1]
          else array[]::text[]
        end;
      $$;

      grant usage on schema public, auth, storage to authenticated, service_role;
      grant select on storage.buckets to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
      grant execute on all functions in schema auth to authenticated;
      grant execute on all functions in schema storage to authenticated;

      create table if not exists public._exportleak_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);
  }

  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = isInitialized
    ? await db.query<{ name: string }>("select name from public._exportleak_migrations")
    : { rows: [] };
  const appliedSet = new Set(appliedRows.rows.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await db.exec(sql);
    await db.query("insert into public._exportleak_migrations (name) values ($1)", [file]);
  }

  await db.exec(`
    grant all on all tables in schema public, auth, storage to service_role;
    grant execute on all functions in schema public to authenticated;
  `);

  return db;
}

export async function getPgliteDb(): Promise<PGlite> {
  assertNotProduction();
  if (!globalForPglite.__exportleakPglitePromise) {
    globalForPglite.__exportleakPglitePromise = createAndMigratePglite();
  }
  return globalForPglite.__exportleakPglitePromise;
}

export async function resetPgliteDb(): Promise<void> {
  assertNotProduction();
  if (globalForPglite.__exportleakPglitePromise) {
    const existing = await globalForPglite.__exportleakPglitePromise;
    await existing.close();
    globalForPglite.__exportleakPglitePromise = undefined;
  }
}

export async function asPgliteUser<T>(
  userId: string,
  fn: (tx: { query: PGlite["query"] }) => Promise<T>,
  options?: { isPlatformAdmin?: boolean }
): Promise<T> {
  const db = await getPgliteDb();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await tx.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: userId,
        role: "authenticated",
        app_metadata: {
          is_platform_admin: Boolean(options?.isPlatformAdmin),
        },
      }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

export async function ensurePgliteUser(email: string): Promise<{ id: string; email: string }> {
  assertNotProduction();
  const db = await getPgliteDb();
  const normalized = email.trim().toLowerCase();
  const existing = await db.query<{ id: string; email: string }>(
    `select id, email from auth.users where email = $1`,
    [normalized]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, normalized]);
  return { id, email: normalized };
}
