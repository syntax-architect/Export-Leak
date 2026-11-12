-- Prompt 7: IRM Importer & Reconciliation Matching Engine enhancements

alter table public.remittances
  add column if not exists source_document_id uuid references public.documents(id) on delete set null,
  add column if not exists remitter_name text not null default '',
  add column if not exists invoice_reference text not null default '',
  add column if not exists ad_code text;

create index if not exists remittances_source_document_id_idx
  on public.remittances (source_document_id);

alter table public.sb_remittance_matches
  add column if not exists explanation text not null default '',
  add column if not exists signal_breakdown jsonb not null default '{}'::jsonb;

-- Enforce at database level:
-- 1) Shipping Bill and Remittance must share the exact same currency (no cross-currency clubbing).
-- 2) Total allocated amount across matches for a remittance never exceeds remittance.amount_minor.
create or replace function public.enforce_sb_remittance_match_rules()
returns trigger
language plpgsql
as $$
declare
  sb_currency text;
  rem_currency text;
  rem_amount_minor bigint;
  already_allocated_minor bigint;
begin
  select sb.currency into sb_currency
  from public.shipping_bills sb
  where sb.id = new.shipping_bill_id;

  select r.currency, r.amount_minor into rem_currency, rem_amount_minor
  from public.remittances r
  where r.id = new.remittance_id;

  if sb_currency is null or rem_currency is null then
    raise exception 'Shipping bill or remittance not found for match';
  end if;

  if upper(trim(sb_currency)) <> upper(trim(rem_currency)) then
    raise exception 'Payments in different currencies cannot be clubbed (% vs %)', sb_currency, rem_currency;
  end if;

  select coalesce(sum(m.matched_minor), 0) into already_allocated_minor
  from public.sb_remittance_matches m
  where m.remittance_id = new.remittance_id
    and m.id <> new.id;

  if (already_allocated_minor + new.matched_minor) > rem_amount_minor then
    raise exception 'Match allocation (% + %) exceeds remittance amount (%)',
      already_allocated_minor, new.matched_minor, rem_amount_minor;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sb_remittance_matches_rules on public.sb_remittance_matches;
drop trigger if exists trg_z_sb_remittance_matches_rules on public.sb_remittance_matches;
create trigger trg_z_sb_remittance_matches_rules
  before insert or update on public.sb_remittance_matches
  for each row execute function public.enforce_sb_remittance_match_rules();

-- Track IRM import runs with column mapping and fail-loudly row errors
create table if not exists public.irm_import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  filename text not null default '',
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  auto_confirmed_count integer not null default 0 check (auto_confirmed_count >= 0),
  review_needed_count integer not null default 0 check (review_needed_count >= 0),
  column_mapping jsonb not null default '{}'::jsonb,
  failed_rows jsonb not null default '[]'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists irm_import_batches_org_id_idx
  on public.irm_import_batches (org_id, created_at desc);

create index if not exists irm_import_batches_iec_id_idx
  on public.irm_import_batches (iec_id, created_at desc);

create trigger trg_irm_import_batches_updated_at
  before update on public.irm_import_batches
  for each row execute function public.set_updated_at();

-- Track rejected suggested pairs so they do not keep reappearing in Review Matches
create table if not exists public.sb_remittance_rejections (
  id uuid primary key default gen_random_uuid(),
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  shipping_bill_id uuid not null references public.shipping_bills(id) on delete cascade,
  remittance_id uuid not null references public.remittances(id) on delete cascade,
  rejected_by uuid references auth.users(id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_bill_id, remittance_id)
);

create index if not exists sb_remittance_rejections_iec_id_idx
  on public.sb_remittance_rejections (iec_id);

create index if not exists sb_remittance_rejections_sb_id_idx
  on public.sb_remittance_rejections (shipping_bill_id);

create index if not exists sb_remittance_rejections_remittance_id_idx
  on public.sb_remittance_rejections (remittance_id);

create trigger trg_sb_remittance_rejections_updated_at
  before update on public.sb_remittance_rejections
  for each row execute function public.set_updated_at();

alter table public.irm_import_batches enable row level security;
alter table public.sb_remittance_rejections enable row level security;

grant select, insert, update, delete on public.irm_import_batches to authenticated;
grant select, insert, update, delete on public.sb_remittance_rejections to authenticated;

create policy irm_import_batches_select on public.irm_import_batches
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy irm_import_batches_insert on public.irm_import_batches
  for insert to authenticated
  with check (public.user_can_write_org(org_id));

create policy irm_import_batches_update on public.irm_import_batches
  for update to authenticated
  using (public.user_can_write_org(org_id))
  with check (public.user_can_write_org(org_id));

create policy sb_remittance_rejections_select on public.sb_remittance_rejections
  for select to authenticated
  using (public.user_is_org_member(public.iec_org_id(iec_id)));

create policy sb_remittance_rejections_insert on public.sb_remittance_rejections
  for insert to authenticated
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

create policy sb_remittance_rejections_delete on public.sb_remittance_rejections
  for delete to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)));
