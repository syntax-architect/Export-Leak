-- 0007_shipping_bill_parser.sql
-- Adds field-level confidence, source page text spans, parse run auditability,
-- and human corrections tracking for Prompt 6 Shipping Bill parsing & review.

alter table public.shipping_bills
  add column if not exists field_confidence jsonb not null default '{}'::jsonb,
  add column if not exists source_text_pages jsonb not null default '[]'::jsonb,
  add column if not exists needs_review_fields text[] not null default '{}'::text[],
  add column if not exists used_ocr_fallback boolean not null default false,
  add column if not exists ai_cost_paise integer not null default 0 check (ai_cost_paise >= 0),
  add column if not exists confidence_confirmed_at timestamptz,
  add column if not exists confidence_confirmed_by uuid references auth.users(id) on delete set null;

alter table public.documents
  add column if not exists ai_cost_paise integer not null default 0 check (ai_cost_paise >= 0),
  add column if not exists parse_attempts integer not null default 0 check (parse_attempts >= 0),
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_parsed_at timestamptz;

create index if not exists documents_parse_queue_idx
  on public.documents (parse_status, next_retry_at)
  where deleted_at is null and parse_status in ('queued', 'failed');

create table if not exists public.document_parse_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  attempt_no integer not null check (attempt_no >= 1),
  strategy text not null check (strategy in ('deterministic', 'ocr_deterministic', 'deterministic_plus_ai')),
  ai_tokens integer not null default 0 check (ai_tokens >= 0),
  ai_cost_paise integer not null default 0 check (ai_cost_paise >= 0),
  status text not null check (status in ('running', 'done', 'needs_review', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_parse_runs_document_id_idx
  on public.document_parse_runs (document_id, created_at desc);

drop trigger if exists trg_document_parse_runs_updated_at on public.document_parse_runs;
create trigger trg_document_parse_runs_updated_at
  before update on public.document_parse_runs
  for each row execute function public.set_updated_at();

create table if not exists public.shipping_bill_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  iec_id uuid not null references public.iec_profiles(id) on delete cascade,
  shipping_bill_id uuid not null references public.shipping_bills(id) on delete cascade,
  shipping_bill_item_id uuid references public.shipping_bill_items(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  field_name text not null check (char_length(trim(field_name)) > 0),
  old_value text,
  new_value text,
  old_confidence numeric(5, 4),
  source_snippet text,
  page_number integer check (page_number is null or page_number >= 1),
  corrected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shipping_bill_corrections_org_id_idx
  on public.shipping_bill_corrections (org_id, created_at desc);

create index if not exists shipping_bill_corrections_sb_id_idx
  on public.shipping_bill_corrections (shipping_bill_id, created_at desc);

create index if not exists shipping_bill_corrections_field_name_idx
  on public.shipping_bill_corrections (field_name);

alter table public.document_parse_runs enable row level security;
alter table public.shipping_bill_corrections enable row level security;

grant select, insert, update, delete on public.document_parse_runs to authenticated;
grant select, insert on public.shipping_bill_corrections to authenticated;

create policy document_parse_runs_select on public.document_parse_runs
  for select to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_parse_runs.document_id
        and public.user_is_org_member(public.iec_org_id(d.iec_id))
    )
  );

create policy document_parse_runs_insert on public.document_parse_runs
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = document_parse_runs.document_id
        and public.user_can_write_org(public.iec_org_id(d.iec_id))
    )
  );

create policy document_parse_runs_update on public.document_parse_runs
  for update to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_parse_runs.document_id
        and public.user_can_write_org(public.iec_org_id(d.iec_id))
    )
  )
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = document_parse_runs.document_id
        and public.user_can_write_org(public.iec_org_id(d.iec_id))
    )
  );

create policy shipping_bill_corrections_select on public.shipping_bill_corrections
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy shipping_bill_corrections_insert on public.shipping_bill_corrections
  for insert to authenticated
  with check (public.user_can_write_org(org_id));

