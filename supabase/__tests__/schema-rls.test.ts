import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const SEED_PATH = path.resolve(process.cwd(), "supabase/seed.sql");

const USER_A = "aaaaaaaa-0000-4000-8000-000000000001";
const VIEWER_A = "aaaaaaaa-0000-4000-8000-000000000002";
const USER_B = "bbbbbbbb-0000-4000-8000-000000000001";

const ORG_A = "aaaa1111-0000-4000-8000-000000000001";
const ORG_B = "bbbb1111-0000-4000-8000-000000000001";

const IEC_A = "aaaa2222-0000-4000-8000-000000000001";
const IEC_B = "bbbb2222-0000-4000-8000-000000000001";

const DOC_A = "aaaa3333-0000-4000-8000-000000000001";
const DOC_B = "bbbb3333-0000-4000-8000-000000000001";

const SB_A = "aaaa4444-0000-4000-8000-000000000001";
const SB_B = "bbbb4444-0000-4000-8000-000000000001";

const SB_ITEM_A = "aaaa4555-0000-4000-8000-000000000001";
const SB_ITEM_B = "bbbb4555-0000-4000-8000-000000000001";

const REM_A = "aaaa5555-0000-4000-8000-000000000001";
const REM_B = "bbbb5555-0000-4000-8000-000000000001";

const MATCH_A = "aaaa5666-0000-4000-8000-000000000001";
const MATCH_B = "bbbb5666-0000-4000-8000-000000000001";

const RATE_ID = "cccc1111-0000-4000-8000-000000000001";
const RULE_ID = "cccc2222-0000-4000-8000-000000000001";

const EXP_A = "aaaa6666-0000-4000-8000-000000000001";
const EXP_B = "bbbb6666-0000-4000-8000-000000000001";

const CRED_A = "aaaa7777-0000-4000-8000-000000000001";
const CRED_B = "bbbb7777-0000-4000-8000-000000000001";

const SCRIP_A = "aaaa8888-0000-4000-8000-000000000001";
const SCRIP_B = "bbbb8888-0000-4000-8000-000000000001";

const ALERT_A = "aaaa9999-0000-4000-8000-000000000001";
const ALERT_B = "bbbb9999-0000-4000-8000-000000000001";

const SUB_A = "aaaa1010-0000-4000-8000-000000000001";
const SUB_B = "bbbb1010-0000-4000-8000-000000000001";

const PAY_A = "aaaa1212-0000-4000-8000-000000000001";
const PAY_B = "bbbb1212-0000-4000-8000-000000000001";

const USAGE_A = "aaaa1313-0000-4000-8000-000000000001";
const USAGE_B = "bbbb1313-0000-4000-8000-000000000001";

const AUDIT_A = "aaaa1414-0000-4000-8000-000000000001";
const AUDIT_B = "bbbb1414-0000-4000-8000-000000000001";

const TRIAL_NOTIF_A = "aaaa1515-0000-4000-8000-000000000001";
const TRIAL_NOTIF_B = "bbbb1515-0000-4000-8000-000000000001";

const BILL_EVT_A = "aaaa1616-0000-4000-8000-000000000001";
const BILL_EVT_B = "bbbb1616-0000-4000-8000-000000000001";

const STORAGE_A = `${ORG_A}/${IEC_A}/11111111-1111-4111-8111-111111111111.pdf`;
const STORAGE_B = `${ORG_B}/${IEC_B}/22222222-2222-4222-8222-222222222222.pdf`;

async function bootstrapSupabaseEnv(db: PGlite) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema if not exists auth;
    create schema if not exists storage;

    create table auth.users (
      id uuid primary key,
      email text
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
  `);
}

async function applyMigrationsFromEmpty(db: PGlite) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  expect(files.length).toBeGreaterThanOrEqual(3);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.exec(sql);
  }

  await db.exec(`
    grant all on all tables in schema public, auth, storage to service_role;
    grant execute on all functions in schema public to authenticated;
  `);
}

async function asUser<T>(
  db: PGlite,
  userId: string,
  fn: (tx: { query: PGlite["query"] }) => Promise<T>,
  claims: Record<string, unknown> = {}
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await tx.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", ...claims }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

describe("Database schema, seed, and multi-tenant RLS", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await bootstrapSupabaseEnv(db);
    await applyMigrationsFromEmpty(db);

    const seedSql = fs.readFileSync(SEED_PATH, "utf8");
    await db.exec(seedSql);

    // Insert two isolated test organizations (Org A and Org B) with rows in every table
    await db.exec(`
      insert into auth.users (id, email) values
        ('${USER_A}', 'usera@example.invalid'),
        ('${VIEWER_A}', 'viewera@example.invalid'),
        ('${USER_B}', 'userb@example.invalid');

      insert into public.organizations (id, name, type) values
        ('${ORG_A}', 'Demo Alpha Exports', 'exporter'),
        ('${ORG_B}', 'Demo Beta Consultants', 'consultant');

      insert into public.memberships (user_id, org_id, role) values
        ('${USER_A}', '${ORG_A}', 'owner'),
        ('${VIEWER_A}', '${ORG_A}', 'viewer'),
        ('${USER_B}', '${ORG_B}', 'owner');

      insert into public.iec_profiles (id, org_id, iec_code, legal_name) values
        ('${IEC_A}', '${ORG_A}', 'DEMO111111', 'Demo Alpha Exports Pvt Ltd'),
        ('${IEC_B}', '${ORG_B}', 'DEMO222222', 'Demo Beta Imports Exports');

      insert into public.documents (id, iec_id, kind, storage_path, sha256, original_name, uploaded_by) values
        ('${DOC_A}', '${IEC_A}', 'shipping_bill', '${STORAGE_A}', repeat('a', 64), 'alpha-sb.pdf', '${USER_A}'),
        ('${DOC_B}', '${IEC_B}', 'shipping_bill', '${STORAGE_B}', repeat('b', 64), 'beta-sb.pdf', '${USER_B}');

      insert into public.shipping_bills (id, iec_id, document_id, sb_number, sb_date, port_code, currency, fob_minor) values
        ('${SB_A}', '${IEC_A}', '${DOC_A}', 'SB-A-1001', '2026-11-01', 'INTUT6', 'USD', 500000),
        ('${SB_B}', '${IEC_B}', '${DOC_B}', 'SB-B-2001', '2026-11-02', 'INNSA1', 'USD', 750000);

      insert into public.shipping_bill_items (id, shipping_bill_id, hs_code, description, quantity, uqc, fob_minor) values
        ('${SB_ITEM_A}', '${SB_A}', '61091000', 'Alpha item', 100, 'PCS', 500000),
        ('${SB_ITEM_B}', '${SB_B}', '61091000', 'Beta item', 150, 'PCS', 750000);

      insert into public.remittances (id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor) values
        ('${REM_A}', '${IEC_A}', 'IRM-A-01', 'Demo Bank A', '2026-11-05', 'USD', 500000),
        ('${REM_B}', '${IEC_B}', 'IRM-B-01', 'Demo Bank B', '2026-11-06', 'USD', 750000);

      insert into public.sb_remittance_matches (id, shipping_bill_id, remittance_id, matched_minor, method, confirmed_by) values
        ('${MATCH_A}', '${SB_A}', '${REM_A}', 500000, 'manual', '${USER_A}'),
        ('${MATCH_B}', '${SB_B}', '${REM_B}', 750000, 'manual', '${USER_B}');

      insert into public.incentive_rates (id, scheme, hs_code, rate_bps, effective_from, source_note) values
        ('${RATE_ID}', 'rodtep', '61091000', 100, '2026-01-01', 'TEST_SYNTHETIC_FIXTURE');

      insert into public.compliance_rules (id, key, value, effective_from) values
        ('${RULE_ID}', 'scrip_validity_months', '{"months": 24}'::jsonb, '2026-01-01');

      insert into public.incentive_expectations (id, shipping_bill_id, scheme, expected_minor, rate_id) values
        ('${EXP_A}', '${SB_A}', 'rodtep', 5000, '${RATE_ID}'),
        ('${EXP_B}', '${SB_B}', 'rodtep', 7500, '${RATE_ID}');

      insert into public.incentive_credits (id, shipping_bill_id, scheme, credited_minor, source_document_id) values
        ('${CRED_A}', '${SB_A}', 'rodtep', 5000, '${DOC_A}'),
        ('${CRED_B}', '${SB_B}', 'rodtep', 7500, '${DOC_B}');

      insert into public.scrips (id, iec_id, scrip_number, scheme, face_minor, generated_on) values
        ('${SCRIP_A}', '${IEC_A}', 'SCRIP-A-1', 'rodtep', 5000, '2026-11-08'),
        ('${SCRIP_B}', '${IEC_B}', 'SCRIP-B-1', 'rodtep', 7500, '2026-11-08');

      insert into public.alerts (id, iec_id, kind, severity, shipping_bill_id, due_on) values
        ('${ALERT_A}', '${IEC_A}', 'realisation_deadline', 'warning', '${SB_A}', '2027-08-01'),
        ('${ALERT_B}', '${IEC_B}', 'realisation_deadline', 'warning', '${SB_B}', '2027-08-02');

      insert into public.subscriptions (id, org_id, razorpay_subscription_id, plan_key, status) values
        ('${SUB_A}', '${ORG_A}', 'sub_test_a', 'exporter_monthly', 'active'),
        ('${SUB_B}', '${ORG_B}', 'sub_test_b', 'consultant_monthly', 'active');

      insert into public.payment_events (id, org_id, provider, provider_event_id, event_type) values
        ('${PAY_A}', '${ORG_A}', 'razorpay', 'evt_test_a', 'subscription.activated'),
        ('${PAY_B}', '${ORG_B}', 'razorpay', 'evt_test_b', 'subscription.activated');

      insert into public.usage_counters (id, org_id, period_start, shipping_bills_used) values
        ('${USAGE_A}', '${ORG_A}', '2026-11-01', 1),
        ('${USAGE_B}', '${ORG_B}', '2026-11-01', 1);

      insert into public.audit_log (id, org_id, actor_id, action, entity, entity_id) values
        ('${AUDIT_A}', '${ORG_A}', '${USER_A}', 'create', 'shipping_bills', '${SB_A}'),
        ('${AUDIT_B}', '${ORG_B}', '${USER_B}', 'create', 'shipping_bills', '${SB_B}');

      insert into public.trial_notifications (id, org_id, recipient_user_id, recipient_email, kind, channel, status, subject, body_text, upgrade_url, trial_window_key) values
        ('${TRIAL_NOTIF_A}', '${ORG_A}', '${USER_A}', 'a@export.test', 'trial_day_5', 'email', 'queued', 'Trial reminder', 'Test body A', 'http://localhost:3000/app/billing', '2026-11-19T00:00:00.000Z'),
        ('${TRIAL_NOTIF_B}', '${ORG_B}', '${USER_B}', 'b@export.test', 'trial_day_5', 'email', 'queued', 'Trial reminder', 'Test body B', 'http://localhost:3000/app/billing', '2026-11-19T00:00:00.000Z');

      insert into public.billing_events (id, org_id, actor_id, event_type, metadata) values
        ('${BILL_EVT_A}', '${ORG_A}', '${USER_A}', 'trial_started', '{}'::jsonb),
        ('${BILL_EVT_B}', '${ORG_B}', '${USER_B}', 'trial_started', '{}'::jsonb);

      insert into storage.objects (bucket_id, name, owner) values
        ('documents', '${STORAGE_A}', '${USER_A}'),
        ('documents', '${STORAGE_B}', '${USER_B}');
    `);
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it("creates all 18 tables, enables RLS on all of them, and creates required indexes", async () => {
    const tablesRes = await db.query<{ tablename: string; rowsecurity: boolean }>(`
      select tablename, rowsecurity
      from pg_tables
      where schemaname = 'public'
      order by tablename
    `);

    const expectedTables: Array<keyof Database["public"]["Tables"]> = [
      "alerts",
      "audit_log",
      "billing_events",
      "compliance_rules",
      "dashboard_saved_views",
      "document_parse_runs",
      "documents",
      "iec_profiles",
      "incentive_credits",
      "incentive_expectations",
      "incentive_rates",
      "irm_import_batches",
      "memberships",
      "notification_dispatches",
      "notification_preferences",
      "notification_templates",
      "onboarding_events",
      "onboarding_profiles",
      "org_invites",
      "organizations",
      "payment_events",
      "remittances",
      "sb_remittance_matches",
      "sb_remittance_rejections",
      "scrips",
      "shipping_bill_corrections",
      "shipping_bill_items",
      "shipping_bills",
      "subscriptions",
      "trial_notifications",
      "usage_counters",
    ];

    expect(tablesRes.rows.map((r) => r.tablename)).toEqual(expectedTables);
    for (const row of tablesRes.rows) {
      expect(row.rowsecurity, `RLS disabled on ${row.tablename}`).toBe(true);
    }

    const idxRes = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`
    );
    const indexNames = idxRes.rows.map((r) => r.indexname);
    expect(indexNames).toContain("alerts_due_on_idx");
    expect(indexNames).toContain("documents_iec_sha256_active_uidx");
    expect(indexNames).toContain("shipping_bills_iec_id_sb_number_key");
    expect(indexNames).toContain("remittances_iec_id_irm_number_key");
  });

  it("prevents user A from reading or updating user B's rows in ANY table or storage bucket", async () => {
    await asUser(db, USER_A, async (tx) => {
      // 1. User A cannot read Org B rows in any of the 16 tenant-scoped tables
      const tenantSelectChecks: Array<{ table: string; id: string }> = [
        { table: "organizations", id: ORG_B },
        { table: "memberships", id: ORG_B }, // checked by org_id below
        { table: "iec_profiles", id: IEC_B },
        { table: "documents", id: DOC_B },
        { table: "shipping_bills", id: SB_B },
        { table: "shipping_bill_items", id: SB_ITEM_B },
        { table: "remittances", id: REM_B },
        { table: "sb_remittance_matches", id: MATCH_B },
        { table: "incentive_expectations", id: EXP_B },
        { table: "incentive_credits", id: CRED_B },
        { table: "scrips", id: SCRIP_B },
        { table: "alerts", id: ALERT_B },
        { table: "subscriptions", id: SUB_B },
        { table: "payment_events", id: PAY_B },
        { table: "usage_counters", id: USAGE_B },
        { table: "audit_log", id: AUDIT_B },
        { table: "trial_notifications", id: TRIAL_NOTIF_B },
        { table: "billing_events", id: BILL_EVT_B },
      ];

      for (const check of tenantSelectChecks) {
        const col = check.table === "memberships" ? "org_id" : "id";
        const res = await tx.query<{ id: string }>(
          `select id from public.${check.table} where ${col} = $1`,
          [check.id]
        );
        expect(res.rows, `User A leaked row from ${check.table}`).toHaveLength(0);
      }

      // Storage isolation check
      const storageReadB = await tx.query<{ name: string }>(
        `select name from storage.objects where bucket_id = 'documents' and name = $1`,
        [STORAGE_B]
      );
      expect(storageReadB.rows).toHaveLength(0);

      const storageReadA = await tx.query<{ name: string }>(
        `select name from storage.objects where bucket_id = 'documents' and name = $1`,
        [STORAGE_A]
      );
      expect(storageReadA.rows).toHaveLength(1);

      // 2. User A cannot UPDATE Org B rows in any writable tenant table
      const tenantUpdates: Array<{ sql: string; params: unknown[] }> = [
        { sql: `update public.organizations set name = 'Hacked' where id = $1`, params: [ORG_B] },
        { sql: `update public.memberships set role = 'viewer' where org_id = $1`, params: [ORG_B] },
        {
          sql: `update public.iec_profiles set legal_name = 'Hacked' where id = $1`,
          params: [IEC_B],
        },
        {
          sql: `update public.documents set original_name = 'hack.pdf' where id = $1`,
          params: [DOC_B],
        },
        {
          sql: `update public.shipping_bills set buyer_name = 'Hacked' where id = $1`,
          params: [SB_B],
        },
        {
          sql: `update public.shipping_bill_items set description = 'Hacked' where id = $1`,
          params: [SB_ITEM_B],
        },
        {
          sql: `update public.remittances set bank_name = 'Hacked' where id = $1`,
          params: [REM_B],
        },
        {
          sql: `update public.sb_remittance_matches set matched_minor = 1 where id = $1`,
          params: [MATCH_B],
        },
        {
          sql: `update public.incentive_expectations set expected_minor = 1 where id = $1`,
          params: [EXP_B],
        },
        {
          sql: `update public.incentive_credits set credited_minor = 1 where id = $1`,
          params: [CRED_B],
        },
        { sql: `update public.scrips set status = 'expired' where id = $1`, params: [SCRIP_B] },
        { sql: `update public.alerts set kind = 'hacked' where id = $1`, params: [ALERT_B] },
        {
          sql: `update public.usage_counters set shipping_bills_used = 999 where id = $1`,
          params: [USAGE_B],
        },
        { sql: `update storage.objects set name = 'hacked' where name = $1`, params: [STORAGE_B] },
      ];

      for (const u of tenantUpdates) {
        const res = await tx.query(u.sql, u.params);
        expect(res.affectedRows ?? 0, `User A updated Org B via: ${u.sql}`).toBe(0);
      }

      // 3. User A CAN read Org A rows
      const orgARes = await tx.query<{ id: string }>(
        `select id from public.shipping_bills where id = $1`,
        [SB_A]
      );
      expect(orgARes.rows).toHaveLength(1);
    });
  });

  it("enforces viewer read-only, service_role-only billing tables, and admin-only rate/rule writes", async () => {
    // Viewer A can read Org A but cannot insert or update
    await expect(
      asUser(db, VIEWER_A, async (tx) => {
        const res = await tx.query(`select id from public.shipping_bills where id = $1`, [SB_A]);
        expect(res.rows).toHaveLength(1);
        await tx.query(
          `insert into public.scrips (iec_id, scrip_number, scheme, face_minor, generated_on)
           values ($1, 'VIEWER-FAIL', 'rodtep', 100, '2026-11-10')`,
          [IEC_A]
        );
      })
    ).rejects.toThrow();

    const viewerUpdateRes = await asUser(db, VIEWER_A, async (tx) => {
      return tx.query(`update public.organizations set name = 'Viewer Edit' where id = $1`, [
        ORG_A,
      ]);
    });
    expect(viewerUpdateRes.affectedRows ?? 0).toBe(0);

    const orgAfterViewer = await db.query<{ name: string }>(
      `select name from public.organizations where id = $1`,
      [ORG_A]
    );
    expect(orgAfterViewer.rows[0]?.name).toBe("Demo Alpha Exports");

    // User A cannot insert into subscriptions or payment_events
    await expect(
      asUser(db, USER_A, async (tx) => {
        await tx.query(
          `insert into public.subscriptions (org_id, razorpay_subscription_id, plan_key, status)
           values ($1, 'sub_forged', 'consultant_annual', 'active')`,
          [ORG_A]
        );
      })
    ).rejects.toThrow();

    await expect(
      asUser(db, USER_A, async (tx) => {
        await tx.query(
          `insert into public.payment_events (org_id, provider, provider_event_id, event_type)
           values ($1, 'razorpay', 'evt_forged', 'subscription.activated')`,
          [ORG_A]
        );
      })
    ).rejects.toThrow();

    // User A cannot mutate audit_log
    await expect(
      asUser(db, USER_A, async (tx) => {
        await tx.query(`update public.audit_log set action = 'tampered' where id = $1`, [AUDIT_A]);
      })
    ).rejects.toThrow();

    // User A can read incentive_rates and compliance_rules, but cannot write without admin flag
    await asUser(db, USER_A, async (tx) => {
      const rates = await tx.query(`select id from public.incentive_rates where id = $1`, [
        RATE_ID,
      ]);
      const rules = await tx.query(`select id from public.compliance_rules where id = $1`, [
        RULE_ID,
      ]);
      expect(rates.rows).toHaveLength(1);
      expect(rules.rows).toHaveLength(1);
    });

    await expect(
      asUser(db, USER_A, async (tx) => {
        await tx.query(
          `insert into public.incentive_rates (scheme, hs_code, rate_bps, effective_from)
           values ('rodtep', '61091000', 200, '2026-06-01')`
        );
      })
    ).rejects.toThrow();

    // Platform admin JWT claim CAN write incentive_rates & compliance_rules
    await asUser(
      db,
      USER_A,
      async (tx) => {
        await tx.query(
          `insert into public.compliance_rules (key, value, effective_from)
           values ('inr_realisation_months', '{"months": 9}'::jsonb, '2026-10-01')`
        );
      },
      { app_metadata: { is_platform_admin: true } }
    );
  });

  it("blocks duplicate shipping bill number for the same IEC via unique constraint", async () => {
    await expect(
      db.query(
        `insert into public.shipping_bills (iec_id, sb_number, sb_date, port_code, currency, fob_minor)
         values ($1, 'SB-A-1001', '2026-11-10', 'INTUT6', 'USD', 100000)`,
        [IEC_A]
      )
    ).rejects.toThrow(/duplicate key|unique constraint/i);

    // Same sb_number under a DIFFERENT IEC is allowed
    await expect(
      db.query(
        `insert into public.shipping_bills (iec_id, sb_number, sb_date, port_code, currency, fob_minor)
         values ($1, 'SB-A-1001', '2026-11-10', 'INNSA1', 'USD', 100000)`,
        [IEC_B]
      )
    ).resolves.toBeDefined();
  });

  it("blocks cross-organization shipping bill to remittance match", async () => {
    await expect(
      db.query(
        `insert into public.sb_remittance_matches (shipping_bill_id, remittance_id, matched_minor, method)
         values ($1, $2, 1000, 'manual')`,
        [SB_A, REM_B]
      )
    ).rejects.toThrow(/same organization/i);
  });

  it("isolates document_parse_runs and shipping_bill_corrections across orgs and blocks viewer writes", async () => {
    await db.query(
      `insert into public.document_parse_runs (id, document_id, attempt_no, strategy, status)
       values ('aaaa1515-0000-4000-8000-000000000001', $1, 1, 'deterministic', 'done')`,
      [DOC_A]
    );
    await db.query(
      `insert into public.document_parse_runs (id, document_id, attempt_no, strategy, status)
       values ('bbbb1515-0000-4000-8000-000000000001', $1, 1, 'deterministic', 'done')`,
      [DOC_B]
    );
    await db.query(
      `insert into public.shipping_bill_corrections (id, org_id, iec_id, shipping_bill_id, document_id, field_name, old_value, new_value)
       values ('aaaa1616-0000-4000-8000-000000000001', $1, $2, $3, $4, 'port_code', 'INNSA4', 'INNSA1')`,
      [ORG_A, IEC_A, SB_A, DOC_A]
    );
    await db.query(
      `insert into public.shipping_bill_corrections (id, org_id, iec_id, shipping_bill_id, document_id, field_name, old_value, new_value)
       values ('bbbb1616-0000-4000-8000-000000000001', $1, $2, $3, $4, 'port_code', 'INBOM1', 'INBOM4')`,
      [ORG_B, IEC_B, SB_B, DOC_B]
    );

    await asUser(db, USER_A, async (tx) => {
      const runs = await tx.query<{ id: string }>(
        `select id from public.document_parse_runs order by id`
      );
      const corrections = await tx.query<{ id: string }>(
        `select id from public.shipping_bill_corrections order by id`
      );
      expect(runs.rows.map((r) => r.id)).toEqual(["aaaa1515-0000-4000-8000-000000000001"]);
      expect(corrections.rows.map((c) => c.id)).toEqual(["aaaa1616-0000-4000-8000-000000000001"]);
    });

    await expect(
      asUser(db, VIEWER_A, async (tx) => {
        await tx.query(
          `insert into public.shipping_bill_corrections (org_id, iec_id, shipping_bill_id, document_id, field_name, old_value, new_value)
           values ($1, $2, $3, $4, 'currency', 'USD', 'EUR')`,
          [ORG_A, IEC_A, SB_A, DOC_A]
        );
      })
    ).rejects.toThrow();
  });

  it("isolates irm_import_batches and sb_remittance_rejections, blocks viewer writes, and enforces currency/balance DB triggers", async () => {
    await db.query(
      `insert into public.irm_import_batches (id, org_id, iec_id, filename, total_rows, imported_count)
       values ('aaaa1717-0000-4000-8000-000000000001', $1, $2, 'a.csv', 1, 1)`,
      [ORG_A, IEC_A]
    );
    await db.query(
      `insert into public.irm_import_batches (id, org_id, iec_id, filename, total_rows, imported_count)
       values ('bbbb1717-0000-4000-8000-000000000001', $1, $2, 'b.csv', 1, 1)`,
      [ORG_B, IEC_B]
    );
    await db.query(
      `insert into public.sb_remittance_rejections (id, iec_id, shipping_bill_id, remittance_id, reason)
       values ('aaaa1818-0000-4000-8000-000000000001', $1, $2, $3, 'mismatch')`,
      [IEC_A, SB_A, REM_A]
    );
    await db.query(
      `insert into public.sb_remittance_rejections (id, iec_id, shipping_bill_id, remittance_id, reason)
       values ('bbbb1818-0000-4000-8000-000000000001', $1, $2, $3, 'mismatch')`,
      [IEC_B, SB_B, REM_B]
    );

    await asUser(db, USER_A, async (tx) => {
      const batches = await tx.query<{ id: string }>(
        `select id from public.irm_import_batches order by id`
      );
      const rejections = await tx.query<{ id: string }>(
        `select id from public.sb_remittance_rejections order by id`
      );
      expect(batches.rows.map((r) => r.id)).toEqual(["aaaa1717-0000-4000-8000-000000000001"]);
      expect(rejections.rows.map((r) => r.id)).toEqual(["aaaa1818-0000-4000-8000-000000000001"]);
    });

    await expect(
      asUser(db, VIEWER_A, async (tx) => {
        await tx.query(
          `insert into public.sb_remittance_rejections (iec_id, shipping_bill_id, remittance_id, reason)
           values ($1, $2, $3, 'viewer blocked')`,
          [IEC_A, SB_A, REM_A]
        );
      })
    ).rejects.toThrow();

    // DB Trigger Rule 4: cross-currency match inside SAME org MUST fail
    const eurRemId = "aaaa1919-0000-4000-8000-000000000001";
    await db.query(
      `insert into public.remittances (id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor)
       values ($1, $2, 'IRM-EUR-TRIG', 'HDFC', '2026-11-11', 'EUR', 50000)`,
      [eurRemId, IEC_A]
    );
    await expect(
      db.query(
        `insert into public.sb_remittance_matches (shipping_bill_id, remittance_id, matched_minor, method)
         values ($1, $2, 10000, 'manual')`,
        [SB_A, eurRemId]
      )
    ).rejects.toThrow(/different currencies/i);

    // DB Trigger over-allocation: matched_minor exceeding amount_minor MUST fail
    const usdRemId = "aaaa2020-0000-4000-8000-000000000001";
    await db.query(
      `insert into public.remittances (id, iec_id, irm_number, bank_name, remittance_date, currency, amount_minor)
       values ($1, $2, 'IRM-USD-TRIG', 'HDFC', '2026-11-11', 'USD', 50000)`,
      [usdRemId, IEC_A]
    );
    await expect(
      db.query(
        `insert into public.sb_remittance_matches (shipping_bill_id, remittance_id, matched_minor, method)
         values ($1, $2, 60000, 'manual')`,
        [SB_A, usdRemId]
      )
    ).rejects.toThrow(/exceeds remittance amount/i);
  });

  it("enforces overlapping incentive_rates trigger, platform-admin writes, and DELETE RLS on incentive tables", async () => {
    // Non-admin user cannot insert or update incentive_rates or compliance_rules
    await expect(
      asUser(db, USER_A, async (tx) => {
        await tx.query(
          `insert into public.incentive_rates (scheme, hs_code, rate_bps, effective_from)
           values ('rodtep', '61091000', 150, '2026-01-01')`
        );
      })
    ).rejects.toThrow();

    await expect(
      asUser(db, USER_A, async (tx) => {
        await tx.query(
          `insert into public.compliance_rules (key, value, effective_from)
           values ('scrip_validity_months', '{"confirmed":true,"months":12}'::jsonb, '2026-01-01')`
        );
      })
    ).rejects.toThrow();

    // Platform admin CAN insert non-overlapping rate rows
    await asUser(
      db,
      USER_A,
      async (tx) => {
        await tx.query(
          `insert into public.incentive_rates (scheme, hs_code, rate_bps, effective_from, effective_to)
           values ('rodtep', '84834099', 150, '2026-01-01', '2026-06-30')`
        );
      },
      { app_metadata: { is_platform_admin: true } }
    );

    // Overlapping date range MUST fail at DB trigger level even for platform admin / service_role
    await expect(
      asUser(
        db,
        USER_A,
        async (tx) => {
          await tx.query(
            `insert into public.incentive_rates (scheme, hs_code, rate_bps, effective_from, effective_to)
             values ('rodtep', '84834099', 175, '2026-06-15', '2026-12-31')`
          );
        },
        { app_metadata: { is_platform_admin: true } }
      )
    ).rejects.toThrow(/Overlapping effective date range/i);

    // DELETE RLS policies: Viewer deletes 0 rows, User B deletes 0 rows, User A deletes own row
    const viewerDel = await asUser(db, VIEWER_A, async (tx) => {
      return tx.query(`delete from public.scrips where id = $1 returning id`, [SCRIP_A]);
    });
    expect(viewerDel.rows).toHaveLength(0);

    const crossOrgDel = await asUser(db, USER_B, async (tx) => {
      return tx.query(`delete from public.scrips where id = $1 returning id`, [SCRIP_A]);
    });
    expect(crossOrgDel.rows).toHaveLength(0);

    const ownerDel = await asUser(db, USER_A, async (tx) => {
      return tx.query(`delete from public.incentive_credits where id = $1 returning id`, [CRED_A]);
    });
    expect(ownerDel.rows).toHaveLength(1);
  });

  it("enforces RLS on dashboard_saved_views and alerts snooze/delete (migration 0010)", async () => {
    const viewId = "dddd1111-0000-4000-8000-000000000001";

    // Viewer cannot insert saved view (requires write role in org)
    await expect(
      asUser(db, VIEWER_A, async (tx) => {
        await tx.query(
          `insert into public.dashboard_saved_views (id, org_id, user_id, name, filters)
           values ($1, $2, $3, 'Viewer View', '{}'::jsonb)`,
          [viewId, ORG_A, VIEWER_A]
        );
      })
    ).rejects.toThrow();

    // User A inserts personal saved view in Org A
    await asUser(db, USER_A, async (tx) => {
      await tx.query(
        `insert into public.dashboard_saved_views (id, org_id, user_id, name, filters)
         values ($1, $2, $3, 'At Risk Focus', '{"preset":"at_risk"}'::jsonb)`,
        [viewId, ORG_A, USER_A]
      );
    });

    // Cross-org User B sees 0 saved views from Org A
    const crossRead = await asUser(db, USER_B, async (tx) => {
      return tx.query(`select id from public.dashboard_saved_views where id = $1`, [viewId]);
    });
    expect(crossRead.rows).toHaveLength(0);

    // User A can snooze and delete Alert A; Viewer A deletes 0 alerts
    const snoozeRes = await asUser(db, USER_A, async (tx) => {
      return tx.query(
        `update public.alerts set snoozed_until = now() + interval '7 days' where id = $1 returning id`,
        [ALERT_A]
      );
    });
    expect(snoozeRes.rows).toHaveLength(1);

    const viewerDelAlert = await asUser(db, VIEWER_A, async (tx) => {
      return tx.query(`delete from public.alerts where id = $1 returning id`, [ALERT_A]);
    });
    expect(viewerDelAlert.rows).toHaveLength(0);
  });
});
