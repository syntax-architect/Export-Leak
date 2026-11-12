-- 0005_onboarding_and_events.sql
-- Guided onboarding state, user preferences, and funnel analytics events with strict RLS.

create table public.onboarding_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  current_step integer not null default 1 check (current_step between 1 and 4),
  completed_at timestamptz,
  skipped_at timestamptz,
  preferences jsonb not null default '{"checkRodtep":true,"checkDeadlines":true,"checkEbrc":true}'::jsonb,
  tour_completed_at timestamptz,
  checklist_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_profiles_org_id_idx on public.onboarding_profiles (org_id);

create trigger trg_onboarding_profiles_updated_at
  before update on public.onboarding_profiles
  for each row execute function public.set_updated_at();

alter table public.onboarding_profiles enable row level security;

grant select, insert, update on public.onboarding_profiles to authenticated;

create policy onboarding_profiles_select on public.onboarding_profiles
  for select to authenticated
  using (auth.uid() = user_id);

create policy onboarding_profiles_insert on public.onboarding_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy onboarding_profiles_update on public.onboarding_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  event_type text not null check (
    event_type in (
      'step_viewed',
      'step_completed',
      'step_skipped',
      'wizard_completed',
      'wizard_skipped',
      'demo_created',
      'demo_deleted',
      'tour_started',
      'tour_completed',
      'tour_dismissed'
    )
  ),
  step_number integer check (step_number is null or step_number between 1 and 4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index onboarding_events_user_id_idx on public.onboarding_events (user_id);
create index onboarding_events_org_id_idx on public.onboarding_events (org_id);
create index onboarding_events_event_type_idx on public.onboarding_events (event_type);

alter table public.onboarding_events enable row level security;

grant select, insert on public.onboarding_events to authenticated;

create policy onboarding_events_select on public.onboarding_events
  for select to authenticated
  using (
    auth.uid() = user_id
    or (org_id is not null and public.user_is_org_member(org_id))
  );

create policy onboarding_events_insert on public.onboarding_events
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Allow org writers (owner/admin/member) to 1-click delete demo IECs, and org admins to delete org IECs.
create policy iec_profiles_delete_demo on public.iec_profiles
  for delete to authenticated
  using (
    (is_demo = true and public.user_can_write_org(org_id))
    or public.user_is_org_admin(org_id)
  );

