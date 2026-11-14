-- Prompt 16: Alerts, Deduplication, Notification Preferences, Channels, and Templates

-- 1. Extend public.alerts with deduplication key, entity references, and threshold
alter table public.alerts
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists threshold integer,
  add column if not exists dedup_key text;

-- Unique index to guarantee at database level that (iec_id, dedup_key) produces exactly one alert
create unique index if not exists idx_alerts_iec_dedup
  on public.alerts (iec_id, dedup_key)
  where dedup_key is not null;

create index if not exists idx_alerts_entity
  on public.alerts (entity_type, entity_id)
  where entity_id is not null;

-- 2. Notification Preferences
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  iec_id uuid references public.iec_profiles(id) on delete cascade,
  alert_types jsonb not null default '{
    "realisation_deadlines": true,
    "scrip_expiry": true,
    "missing_payments": true,
    "unclaimed_incentives": true,
    "billing": true
  }'::jsonb,
  channels jsonb not null default '{
    "in_app": true,
    "email": true,
    "whatsapp": false
  }'::jsonb,
  digest_frequency text not null default 'realtime'
    check (digest_frequency in ('realtime', 'daily', 'weekly', 'none')),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start text not null default '22:00',
  quiet_hours_end text not null default '08:00',
  unsubscribed_at timestamptz,
  unsubscribe_token text not null unique default md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, iec_id)
);

create index if not exists idx_notification_preferences_user
  on public.notification_preferences (user_id, org_id);

create unique index if not exists idx_notification_preferences_org_user_default
  on public.notification_preferences (org_id, user_id)
  where iec_id is null;

create unique index if not exists idx_notification_preferences_org_user_client
  on public.notification_preferences (org_id, user_id, iec_id)
  where iec_id is not null;

create index if not exists idx_notification_preferences_token
  on public.notification_preferences (unsubscribe_token);

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
grant select, insert, update on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (public.user_is_org_member(org_id) and user_id = auth.uid());

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated
  with check (public.user_is_org_member(org_id) and user_id = auth.uid());

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (public.user_is_org_member(org_id) and user_id = auth.uid())
  with check (public.user_is_org_member(org_id) and user_id = auth.uid());

-- 3. Notification Dispatches Log
create table if not exists public.notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  channel text not null check (channel in ('in_app', 'email', 'whatsapp')),
  recipient text not null,
  subject text,
  body text,
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped', 'unsubscribed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_dispatches_org
  on public.notification_dispatches (org_id, created_at desc);

alter table public.notification_dispatches enable row level security;
grant select on public.notification_dispatches to authenticated;

drop policy if exists notification_dispatches_select on public.notification_dispatches;
create policy notification_dispatches_select on public.notification_dispatches
  for select to authenticated
  using (public.user_is_org_member(org_id));

-- 4. Seed WhatsApp-ready and Email notification templates in public.notification_templates
insert into public.notification_templates (key, channel, subject, body_template, active)
values
  (
    'whatsapp_deadline_alert',
    'whatsapp',
    null,
    'ExportLeak Alert: Shipment {{1}} (FOB {{2}}) has FEMA realisation deadline approaching in {{3}} days on {{4}}. Action required: reconcile bank IRM or file extension.',
    true
  ),
  (
    'whatsapp_scrip_alert',
    'whatsapp',
    null,
    'ExportLeak Alert: RoDTEP/Drawback scrip {{1}} of value {{2}} is expiring in {{3}} days on {{4}}. Action required: utilise scrip before expiry.',
    true
  ),
  (
    'whatsapp_unclaimed_alert',
    'whatsapp',
    null,
    'ExportLeak Alert: Unclaimed export incentive of {{1}} identified for Shipping Bill {{2}}. Review details in ExportLeak dashboard.',
    true
  ),
  (
    'whatsapp_payment_problem',
    'whatsapp',
    null,
    'ExportLeak Notice: Subscription payment retry pending for your organization. Please update payment method within 3 days to maintain premium access.',
    true
  ),
  (
    'email_deadline_alert',
    'email',
    'Action Required: FEMA Realisation Deadline in {{days}} Days (SB #{{sbNumber}})',
    'Hello {{name}},\n\nShipping Bill #{{sbNumber}} (Port: {{portCode}}, FOB: {{fobFormatted}}) has an upcoming FEMA realisation deadline on {{dueDate}} ({{days}} days remaining).\n\nAction required: Upload your bank Inward Remittance Message (IRM) or mark the eBRC ready in ExportLeak.\n\nOpen details: {{appUrl}}\n\n---\nExportLeak Alerts\nTo unsubscribe from deadline alerts: {{unsubscribeUrl}}',
    true
  ),
  (
    'email_scrip_alert',
    'email',
    'Action Required: Duty Scrip #{{scripNumber}} Expiring in {{days}} Days',
    'Hello {{name}},\n\nExport incentive scrip #{{scripNumber}} ({{scheme}}, Face Value: {{amountFormatted}}) will expire on {{expiresOn}} ({{days}} days remaining).\n\nAction required: Utilise this scrip against customs duty before expiry.\n\nOpen details: {{appUrl}}\n\n---\nExportLeak Alerts\nTo unsubscribe from scrip alerts: {{unsubscribeUrl}}',
    true
  ),
  (
    'email_weekly_digest',
    'email',
    'Your ExportLeak Weekly Digest: {{activeAlertsCount}} open items needing review',
    'Hello {{name}},\n\nHere is your weekly export compliance digest:\n- Approaching deadlines: {{deadlinesCount}}\n- Expiring scrips: {{scripsCount}}\n- Unclaimed export incentives: {{unclaimedFormatted}}\n- Unmatched inward remittances: {{unmatchedCount}}\n\nReview your workspace: {{appUrl}}\n\n---\nExportLeak Alerts\nTo manage notification frequency or unsubscribe: {{unsubscribeUrl}}',
    true
  ),
  (
    'email_payment_problem',
    'email',
    'Urgent: Action required on your ExportLeak subscription payment',
    'Hello {{name}},\n\nA scheduled renewal payment for your ExportLeak {{planName}} subscription could not be processed. We have placed your account in a 3-day grace period with full features active.\n\nPlease update your payment method to avoid downgrade to the Free plan: {{billingUrl}}\n\n---\nExportLeak Billing Team\nEssential billing notices cannot be disabled.',
    true
  )
on conflict (key) do update
set
  subject = excluded.subject,
  body_template = excluded.body_template,
  active = excluded.active;

