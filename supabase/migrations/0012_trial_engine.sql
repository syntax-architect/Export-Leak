-- 0012_trial_engine.sql
-- 7-day no-card trial lifecycle, reminder templates & deduplicated outbox, and trial analytics events.

alter table public.organizations
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_converted_at timestamptz;

create index if not exists organizations_trial_active_idx
  on public.organizations (plan_key, trial_ends_at)
  where plan_key = 'trial_pro' and trial_ends_at is not null;

-- 1. Notification templates (including stored WhatsApp templates for future integration)
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (char_length(trim(key)) > 0),
  channel text not null check (channel in ('email', 'whatsapp')),
  subject text,
  body_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_notification_templates_updated_at on public.notification_templates;
create trigger trg_notification_templates_updated_at
  before update on public.notification_templates
  for each row execute function public.set_updated_at();

alter table public.notification_templates enable row level security;

grant select on public.notification_templates to authenticated;
grant insert, update, delete on public.notification_templates to authenticated;

drop policy if exists notification_templates_select on public.notification_templates;
create policy notification_templates_select on public.notification_templates
  for select to authenticated
  using (true);

drop policy if exists notification_templates_insert on public.notification_templates;
create policy notification_templates_insert on public.notification_templates
  for insert to authenticated
  with check (public.is_platform_admin());

drop policy if exists notification_templates_update on public.notification_templates;
create policy notification_templates_update on public.notification_templates
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists notification_templates_delete on public.notification_templates;
create policy notification_templates_delete on public.notification_templates
  for delete to authenticated
  using (public.is_platform_admin());

-- Seed default trial reminder templates (email + WhatsApp placeholder template)
insert into public.notification_templates (key, channel, subject, body_template, active)
values
  (
    'trial_day_5_email',
    'email',
    'Your 7-day Pro trial ends soon — see what you found',
    'Hi {{orgName}}, you have {{unclaimedFormatted}} in unclaimed incentives flagged during your ExportLeak Pro trial. Choose a plan to keep Bulk eBRC export and reports unlocked: {{upgradeUrl}}',
    true
  ),
  (
    'trial_day_7_email',
    'email',
    'Your 7-day Pro trial has ended — your data stays safe',
    'Hi {{orgName}}, your 7-day Pro trial ended today and your workspace moved gently to the Free plan. All existing files and {{unclaimedFormatted}} in unclaimed incentive tracking remain readable. Upgrade anytime here: {{upgradeUrl}}',
    true
  ),
  (
    'trial_day_5_whatsapp',
    'whatsapp',
    null,
    'ExportLeak reminder for {{orgName}}: {{daysLeftText}} on your Pro trial. You have {{unclaimedFormatted}} in unclaimed incentives flagged. Choose a plan: {{upgradeUrl}}',
    true
  ),
  (
    'trial_day_7_whatsapp',
    'whatsapp',
    null,
    'ExportLeak update for {{orgName}}: Your 7-day Pro trial has ended and your workspace moved to Free (all data kept readable). You have {{unclaimedFormatted}} in unclaimed incentives flagged. Upgrade: {{upgradeUrl}}',
    true
  )
on conflict (key) do nothing;

-- 2. Trial notifications outbox & delivery log (deduplicated per org/kind/channel/window)
create table if not exists public.trial_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  kind text not null check (kind in ('trial_day_5', 'trial_day_7')),
  channel text not null check (channel in ('email', 'whatsapp_template')),
  status text not null check (status in ('queued', 'sent', 'failed', 'stored_template')),
  subject text,
  body_text text not null,
  unclaimed_incentive_paise bigint not null default 0 check (unclaimed_incentive_paise >= 0),
  upgrade_url text not null,
  trial_ends_at timestamptz,
  trial_window_key text not null,
  provider_message_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, kind, channel, trial_window_key)
);

create index if not exists trial_notifications_org_id_idx
  on public.trial_notifications (org_id, created_at desc);

drop trigger if exists trg_trial_notifications_updated_at on public.trial_notifications;
create trigger trg_trial_notifications_updated_at
  before update on public.trial_notifications
  for each row execute function public.set_updated_at();

alter table public.trial_notifications enable row level security;

grant select on public.trial_notifications to authenticated;

drop policy if exists trial_notifications_select on public.trial_notifications;
create policy trial_notifications_select on public.trial_notifications
  for select to authenticated
  using (public.user_is_org_member(org_id));

-- 3. Trial & billing analytics events
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'trial_started',
      'trial_day_5_email',
      'trial_expired',
      'trial_converted',
      'trial_extended'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_org_id_idx
  on public.billing_events (org_id, created_at desc);

create index if not exists billing_events_type_idx
  on public.billing_events (event_type, created_at desc);

alter table public.billing_events enable row level security;

grant select, insert on public.billing_events to authenticated;

drop policy if exists billing_events_select on public.billing_events;
create policy billing_events_select on public.billing_events
  for select to authenticated
  using (public.user_is_org_member(org_id));

drop policy if exists billing_events_insert on public.billing_events;
create policy billing_events_insert on public.billing_events
  for insert to authenticated
  with check (public.user_can_write_org(org_id));

