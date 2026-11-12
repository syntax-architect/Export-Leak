-- 0004_team_invites.sql
-- Team invitation tokens (stored hashed) with multi-tenant RLS.

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) > 3),
  role text not null check (role in ('admin', 'member', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index org_invites_pending_email_uidx
  on public.org_invites (org_id, email)
  where accepted_at is null and revoked_at is null;

create index org_invites_org_id_idx on public.org_invites (org_id);
create index org_invites_invited_by_idx on public.org_invites (invited_by);

create trigger trg_org_invites_updated_at
  before update on public.org_invites
  for each row execute function public.set_updated_at();

alter table public.org_invites enable row level security;

grant select, insert, update, delete on public.org_invites to authenticated;

create policy org_invites_select on public.org_invites
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy org_invites_insert on public.org_invites
  for insert to authenticated
  with check (public.user_is_org_admin(org_id));

create policy org_invites_update on public.org_invites
  for update to authenticated
  using (public.user_is_org_admin(org_id))
  with check (public.user_is_org_admin(org_id));

create policy org_invites_delete on public.org_invites
  for delete to authenticated
  using (public.user_is_org_admin(org_id));

