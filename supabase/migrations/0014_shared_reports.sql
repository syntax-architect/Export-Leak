-- Prompt 17: Shared Summary Reports for CAs / Accountants (Share Loop)

create table if not exists public.shared_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  iec_id uuid references public.iec_profiles(id) on delete cascade,
  token text not null unique,
  title text not null default 'Export Reconciliation Summary',
  totals jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_shared_reports_token on public.shared_reports (token);
create index if not exists idx_shared_reports_org on public.shared_reports (org_id);

alter table public.shared_reports enable row level security;

-- Org members can manage their shared reports
create policy "shared_reports_org_members"
  on public.shared_reports
  for all
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = shared_reports.org_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = shared_reports.org_id
        and m.user_id = auth.uid()
    )
  );

-- Public can view active unexpired, unrevoked reports by token
create policy "shared_reports_public_read"
  on public.shared_reports
  for select
  to public
  using (
    revoked_at is null
    and expires_at > now()
  );

