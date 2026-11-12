-- 0001_initial_schema.sql
-- Multi-tenant schema for ExportLeak (integer minor units for all money values).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  type text not null check (type in ('exporter', 'consultant')),
  plan_key text not null default 'free',
  plan_status text not null default 'active',
  trial_ends_at timestamptz,
  razorpay_customer_id text unique,
  ai_parsing_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Memberships
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id)
);

-- 3. IEC Profiles
create table public.iec_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  iec_code text not null check (iec_code ~ '^[A-Za-z0-9]{10}$'),
  legal_name text not null check (char_length(trim(legal_name)) > 0),
  gstin text,
  ad_bank_name text,
  default_currency text not null default 'INR' check (char_length(default_currency) = 3),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, iec_code)
);

-- 4. Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  kind text not null check (kind in ('shipping_bill', 'irm_export', 'scroll', 'other')),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_name text not null,
  parse_status text not null default 'queued'
    check (parse_status in ('queued', 'parsing', 'needs_review', 'done', 'failed')),
  uploaded_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index documents_iec_sha256_active_uidx
  on public.documents (iec_id, sha256)
  where deleted_at is null;

-- 5. Shipping Bills
create table public.shipping_bills (
  id uuid primary key default gen_random_uuid(),
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  sb_number text not null check (char_length(trim(sb_number)) > 0),
  sb_date date not null,
  port_code text not null,
  leo_date date,
  invoice_no text,
  buyer_name text,
  currency text not null check (char_length(currency) = 3),
  fob_minor bigint not null check (fob_minor >= 0),
  exchange_rate numeric(14, 6) check (exchange_rate is null or exchange_rate > 0),
  schemes_claimed text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('queued', 'needs_review', 'parsed', 'pending', 'partially_matched', 'matched', 'ebrc_ready', 'closed')),
  realisation_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (iec_id, sb_number)
);

-- 6. Shipping Bill Items
create table public.shipping_bill_items (
  id uuid primary key default gen_random_uuid(),
  shipping_bill_id uuid not null references public.shipping_bills(id) on delete cascade,
  hs_code text not null check (hs_code ~ '^[0-9]{8}$'),
  description text not null default '',
  quantity numeric(16, 4) not null default 0 check (quantity >= 0),
  uqc text not null default '',
  fob_minor bigint not null check (fob_minor >= 0),
  field_confidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Remittances (IRM)
create table public.remittances (
  id uuid primary key default gen_random_uuid(),
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  irm_number text not null check (char_length(trim(irm_number)) > 0),
  bank_name text not null default '',
  remittance_date date not null,
  currency text not null check (char_length(currency) = 3),
  amount_minor bigint not null check (amount_minor >= 0),
  utilised_minor bigint not null default 0 check (utilised_minor >= 0 and utilised_minor <= amount_minor),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (iec_id, irm_number)
);

-- 8. Shipping Bill <-> Remittance Matches
create table public.sb_remittance_matches (
  id uuid primary key default gen_random_uuid(),
  shipping_bill_id uuid not null references public.shipping_bills(id) on delete cascade,
  remittance_id uuid not null references public.remittances(id) on delete cascade,
  matched_minor bigint not null check (matched_minor > 0),
  method text not null check (method in ('auto', 'manual')),
  confidence numeric(5, 4) not null default 1 check (confidence >= 0 and confidence <= 1),
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_bill_id, remittance_id)
);

-- 9. Incentive Rates (effective-dated reference table)
create table public.incentive_rates (
  id uuid primary key default gen_random_uuid(),
  scheme text not null check (scheme in ('rodtep', 'drawback', 'rosctl')),
  hs_code text not null check (hs_code ~ '^[0-9]{8}$'),
  rate_bps integer not null check (rate_bps >= 0),
  cap_per_unit_minor bigint check (cap_per_unit_minor is null or cap_per_unit_minor >= 0),
  uqc text,
  effective_from date not null,
  effective_to date,
  source_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

-- 10. Incentive Expectations
create table public.incentive_expectations (
  id uuid primary key default gen_random_uuid(),
  shipping_bill_id uuid not null references public.shipping_bills(id) on delete cascade,
  scheme text not null check (scheme in ('rodtep', 'drawback', 'rosctl')),
  expected_minor bigint not null check (expected_minor >= 0),
  rate_id uuid references public.incentive_rates(id) on delete set null,
  calc_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_bill_id, scheme)
);

-- 11. Incentive Credits
create table public.incentive_credits (
  id uuid primary key default gen_random_uuid(),
  shipping_bill_id uuid not null references public.shipping_bills(id) on delete cascade,
  scheme text not null check (scheme in ('rodtep', 'drawback', 'rosctl')),
  credited_minor bigint not null check (credited_minor >= 0),
  credited_on date,
  source_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 12. Scrips
create table public.scrips (
  id uuid primary key default gen_random_uuid(),
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  scrip_number text not null check (char_length(trim(scrip_number)) > 0),
  scheme text not null check (scheme in ('rodtep', 'drawback', 'rosctl')),
  face_minor bigint not null check (face_minor >= 0),
  generated_on date not null,
  expires_on date,
  status text not null default 'active' check (status in ('active', 'utilised', 'transferred', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (iec_id, scrip_number)
);

-- 13. Compliance Rules (effective-dated configuration table)
create table public.compliance_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null check (char_length(trim(key)) > 0),
  value jsonb not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

-- 14. Alerts
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  shipping_bill_id uuid references public.shipping_bills(id) on delete cascade,
  due_on date,
  resolved_at timestamptz,
  sent_channels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 15. Subscriptions (written only by service_role)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  razorpay_subscription_id text not null unique,
  plan_key text not null,
  status text not null,
  current_start timestamptz,
  current_end timestamptz,
  charge_at timestamptz,
  paid_count integer not null default 0 check (paid_count >= 0),
  cancel_at_cycle_end boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 16. Payment Events (written only by service_role)
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  provider text not null default 'razorpay',
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 17. Usage Counters
create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  shipping_bills_used integer not null default 0 check (shipping_bills_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, period_start)
);

-- 18. Audit Log
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cross-organization match guard
create or replace function public.enforce_same_org_sb_remittance_match()
returns trigger
language plpgsql
as $$
declare
  sb_org uuid;
  rem_org uuid;
begin
  select p.org_id into sb_org
  from public.shipping_bills sb
  join public.iec_profiles p on p.id = sb.iec_id
  where sb.id = new.shipping_bill_id;

  select p.org_id into rem_org
  from public.remittances r
  join public.iec_profiles p on p.id = r.iec_id
  where r.id = new.remittance_id;

  if sb_org is null or rem_org is null or sb_org <> rem_org then
    raise exception 'Shipping bill and remittance must belong to the same organization';
  end if;

  return new;
end;
$$;

create trigger trg_sb_remittance_matches_same_org
  before insert or update on public.sb_remittance_matches
  for each row execute function public.enforce_same_org_sb_remittance_match();

-- Foreign-key and query indexes
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_org_id_idx on public.memberships (org_id);
create index iec_profiles_org_id_idx on public.iec_profiles (org_id);
create index documents_iec_id_idx on public.documents (iec_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);
create index shipping_bills_iec_id_idx on public.shipping_bills (iec_id);
create index shipping_bills_document_id_idx on public.shipping_bills (document_id);
create index shipping_bill_items_shipping_bill_id_idx on public.shipping_bill_items (shipping_bill_id);
create index remittances_iec_id_idx on public.remittances (iec_id);
create index sb_remittance_matches_shipping_bill_id_idx on public.sb_remittance_matches (shipping_bill_id);
create index sb_remittance_matches_remittance_id_idx on public.sb_remittance_matches (remittance_id);
create index sb_remittance_matches_confirmed_by_idx on public.sb_remittance_matches (confirmed_by);
create index incentive_rates_lookup_idx on public.incentive_rates (scheme, hs_code, effective_from);
create index incentive_expectations_shipping_bill_id_idx on public.incentive_expectations (shipping_bill_id);
create index incentive_expectations_rate_id_idx on public.incentive_expectations (rate_id);
create index incentive_credits_shipping_bill_id_idx on public.incentive_credits (shipping_bill_id);
create index incentive_credits_source_document_id_idx on public.incentive_credits (source_document_id);
create index scrips_iec_id_idx on public.scrips (iec_id);
create index compliance_rules_lookup_idx on public.compliance_rules (key, effective_from);
create index alerts_iec_id_idx on public.alerts (iec_id);
create index alerts_shipping_bill_id_idx on public.alerts (shipping_bill_id);
create index alerts_due_on_idx on public.alerts (due_on);
create index subscriptions_org_id_idx on public.subscriptions (org_id);
create index payment_events_org_id_idx on public.payment_events (org_id);
create index usage_counters_org_id_idx on public.usage_counters (org_id);
create index audit_log_org_id_idx on public.audit_log (org_id);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

-- updated_at triggers on every table
create trigger trg_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger trg_memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();
create trigger trg_iec_profiles_updated_at before update on public.iec_profiles for each row execute function public.set_updated_at();
create trigger trg_documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger trg_shipping_bills_updated_at before update on public.shipping_bills for each row execute function public.set_updated_at();
create trigger trg_shipping_bill_items_updated_at before update on public.shipping_bill_items for each row execute function public.set_updated_at();
create trigger trg_remittances_updated_at before update on public.remittances for each row execute function public.set_updated_at();
create trigger trg_sb_remittance_matches_updated_at before update on public.sb_remittance_matches for each row execute function public.set_updated_at();
create trigger trg_incentive_rates_updated_at before update on public.incentive_rates for each row execute function public.set_updated_at();
create trigger trg_incentive_expectations_updated_at before update on public.incentive_expectations for each row execute function public.set_updated_at();
create trigger trg_incentive_credits_updated_at before update on public.incentive_credits for each row execute function public.set_updated_at();
create trigger trg_scrips_updated_at before update on public.scrips for each row execute function public.set_updated_at();
create trigger trg_compliance_rules_updated_at before update on public.compliance_rules for each row execute function public.set_updated_at();
create trigger trg_alerts_updated_at before update on public.alerts for each row execute function public.set_updated_at();
create trigger trg_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger trg_payment_events_updated_at before update on public.payment_events for each row execute function public.set_updated_at();
create trigger trg_usage_counters_updated_at before update on public.usage_counters for each row execute function public.set_updated_at();
create trigger trg_audit_log_updated_at before update on public.audit_log for each row execute function public.set_updated_at();
