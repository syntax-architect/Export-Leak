-- Prompt 9: Dashboard alerts snooze/detail metadata, saved views, and DELETE RLS for alerts.

alter table public.alerts
  add column if not exists snoozed_until timestamptz,
  add column if not exists title text not null default '',
  add column if not exists message text not null default '';

create index if not exists idx_alerts_iec_open
  on public.alerts (iec_id, due_on)
  where resolved_at is null;

drop policy if exists alerts_delete on public.alerts;
create policy alerts_delete on public.alerts
  for delete to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)));

create table if not exists public.dashboard_saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  filters jsonb not null default '{}'::jsonb,
  sort_by text not null default 'days_left'
    check (sort_by in ('days_left', 'sb_date', 'fob_minor', 'expected_incentive', 'unclaimed_incentive', 'sb_number')),
  sort_dir text not null default 'asc'
    check (sort_dir in ('asc', 'desc')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, name)
);

drop trigger if exists trg_dashboard_saved_views_updated_at on public.dashboard_saved_views;
create trigger trg_dashboard_saved_views_updated_at
  before update on public.dashboard_saved_views
  for each row execute function public.set_updated_at();

alter table public.dashboard_saved_views enable row level security;
grant select, insert, update, delete on public.dashboard_saved_views to authenticated;

drop policy if exists dashboard_saved_views_select on public.dashboard_saved_views;
create policy dashboard_saved_views_select on public.dashboard_saved_views
  for select to authenticated
  using (public.user_is_org_member(org_id) and user_id = auth.uid());

drop policy if exists dashboard_saved_views_insert on public.dashboard_saved_views;
create policy dashboard_saved_views_insert on public.dashboard_saved_views
  for insert to authenticated
  with check (public.user_can_write_org(org_id) and user_id = auth.uid());

drop policy if exists dashboard_saved_views_update on public.dashboard_saved_views;
create policy dashboard_saved_views_update on public.dashboard_saved_views
  for update to authenticated
  using (public.user_can_write_org(org_id) and user_id = auth.uid())
  with check (public.user_can_write_org(org_id) and user_id = auth.uid());

drop policy if exists dashboard_saved_views_delete on public.dashboard_saved_views;
create policy dashboard_saved_views_delete on public.dashboard_saved_views
  for delete to authenticated
  using (public.user_can_write_org(org_id) and user_id = auth.uid());

