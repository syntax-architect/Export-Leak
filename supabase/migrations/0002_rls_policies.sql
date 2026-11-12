-- 0002_rls_policies.sql
-- Row Level Security helpers and multi-tenant isolation policies for all 18 tables.

-- SECURITY DEFINER helpers prevent RLS recursion on memberships and simplify org resolution.
create or replace function public.user_is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_write_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.user_is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.iec_org_id(target_iec_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id from public.iec_profiles p where p.id = target_iec_id;
$$;

create or replace function public.sb_org_id(target_sb_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
  from public.shipping_bills sb
  join public.iec_profiles p on p.id = sb.iec_id
  where sb.id = target_sb_id;
$$;

create or replace function public.remittance_org_id(target_remittance_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
  from public.remittances r
  join public.iec_profiles p on p.id = r.iec_id
  where r.id = target_remittance_id;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_platform_admin')::boolean, false);
$$;

-- Automatically grant owner membership when an authenticated user creates an organization.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null then
    insert into public.memberships (user_id, org_id, role)
    values (auth.uid(), new.id, 'owner')
    on conflict (user_id, org_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_organizations_owner_membership
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- Enable RLS on every table
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.iec_profiles enable row level security;
alter table public.documents enable row level security;
alter table public.shipping_bills enable row level security;
alter table public.shipping_bill_items enable row level security;
alter table public.remittances enable row level security;
alter table public.sb_remittance_matches enable row level security;
alter table public.incentive_rates enable row level security;
alter table public.incentive_expectations enable row level security;
alter table public.incentive_credits enable row level security;
alter table public.scrips enable row level security;
alter table public.compliance_rules enable row level security;
alter table public.alerts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.usage_counters enable row level security;
alter table public.audit_log enable row level security;

-- Lock down privileges for anon/authenticated (RLS still enforces row-level rules)
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.payment_events from authenticated;
revoke update, delete on public.audit_log from authenticated;

-- 1. organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.user_is_org_member(id));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (auth.uid() is not null);

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.user_can_write_org(id))
  with check (public.user_can_write_org(id));

-- 2. memberships (only org owner/admin can mutate memberships)
create policy memberships_select on public.memberships
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.user_is_org_admin(org_id));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.user_is_org_admin(org_id))
  with check (public.user_is_org_admin(org_id));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.user_is_org_admin(org_id));

-- 3. iec_profiles
create policy iec_profiles_select on public.iec_profiles
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy iec_profiles_insert on public.iec_profiles
  for insert to authenticated
  with check (public.user_can_write_org(org_id));

create policy iec_profiles_update on public.iec_profiles
  for update to authenticated
  using (public.user_can_write_org(org_id))
  with check (public.user_can_write_org(org_id));

-- 4. documents
create policy documents_select on public.documents
  for select to authenticated
  using (public.user_is_org_member(public.iec_org_id(iec_id)));

create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

create policy documents_update on public.documents
  for update to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)))
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

-- 5. shipping_bills
create policy shipping_bills_select on public.shipping_bills
  for select to authenticated
  using (public.user_is_org_member(public.iec_org_id(iec_id)));

create policy shipping_bills_insert on public.shipping_bills
  for insert to authenticated
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

create policy shipping_bills_update on public.shipping_bills
  for update to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)))
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

-- 6. shipping_bill_items
create policy shipping_bill_items_select on public.shipping_bill_items
  for select to authenticated
  using (public.user_is_org_member(public.sb_org_id(shipping_bill_id)));

create policy shipping_bill_items_insert on public.shipping_bill_items
  for insert to authenticated
  with check (public.user_can_write_org(public.sb_org_id(shipping_bill_id)));

create policy shipping_bill_items_update on public.shipping_bill_items
  for update to authenticated
  using (public.user_can_write_org(public.sb_org_id(shipping_bill_id)))
  with check (public.user_can_write_org(public.sb_org_id(shipping_bill_id)));

-- 7. remittances
create policy remittances_select on public.remittances
  for select to authenticated
  using (public.user_is_org_member(public.iec_org_id(iec_id)));

create policy remittances_insert on public.remittances
  for insert to authenticated
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

create policy remittances_update on public.remittances
  for update to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)))
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

-- 8. sb_remittance_matches
create policy sb_remittance_matches_select on public.sb_remittance_matches
  for select to authenticated
  using (
    public.user_is_org_member(public.sb_org_id(shipping_bill_id))
    and public.user_is_org_member(public.remittance_org_id(remittance_id))
  );

create policy sb_remittance_matches_insert on public.sb_remittance_matches
  for insert to authenticated
  with check (
    public.user_can_write_org(public.sb_org_id(shipping_bill_id))
    and public.user_can_write_org(public.remittance_org_id(remittance_id))
  );

create policy sb_remittance_matches_update on public.sb_remittance_matches
  for update to authenticated
  using (
    public.user_can_write_org(public.sb_org_id(shipping_bill_id))
    and public.user_can_write_org(public.remittance_org_id(remittance_id))
  )
  with check (
    public.user_can_write_org(public.sb_org_id(shipping_bill_id))
    and public.user_can_write_org(public.remittance_org_id(remittance_id))
  );

create policy sb_remittance_matches_delete on public.sb_remittance_matches
  for delete to authenticated
  using (
    public.user_can_write_org(public.sb_org_id(shipping_bill_id))
    and public.user_can_write_org(public.remittance_org_id(remittance_id))
  );

-- 9. incentive_rates (readable by authenticated, writable only by platform admin)
create policy incentive_rates_select on public.incentive_rates
  for select to authenticated
  using (true);

create policy incentive_rates_insert on public.incentive_rates
  for insert to authenticated
  with check (public.is_platform_admin());

create policy incentive_rates_update on public.incentive_rates
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy incentive_rates_delete on public.incentive_rates
  for delete to authenticated
  using (public.is_platform_admin());

-- 10. incentive_expectations
create policy incentive_expectations_select on public.incentive_expectations
  for select to authenticated
  using (public.user_is_org_member(public.sb_org_id(shipping_bill_id)));

create policy incentive_expectations_insert on public.incentive_expectations
  for insert to authenticated
  with check (public.user_can_write_org(public.sb_org_id(shipping_bill_id)));

create policy incentive_expectations_update on public.incentive_expectations
  for update to authenticated
  using (public.user_can_write_org(public.sb_org_id(shipping_bill_id)))
  with check (public.user_can_write_org(public.sb_org_id(shipping_bill_id)));

-- 11. incentive_credits
create policy incentive_credits_select on public.incentive_credits
  for select to authenticated
  using (public.user_is_org_member(public.sb_org_id(shipping_bill_id)));

create policy incentive_credits_insert on public.incentive_credits
  for insert to authenticated
  with check (public.user_can_write_org(public.sb_org_id(shipping_bill_id)));

create policy incentive_credits_update on public.incentive_credits
  for update to authenticated
  using (public.user_can_write_org(public.sb_org_id(shipping_bill_id)))
  with check (public.user_can_write_org(public.sb_org_id(shipping_bill_id)));

-- 12. scrips
create policy scrips_select on public.scrips
  for select to authenticated
  using (public.user_is_org_member(public.iec_org_id(iec_id)));

create policy scrips_insert on public.scrips
  for insert to authenticated
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

create policy scrips_update on public.scrips
  for update to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)))
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

-- 13. compliance_rules (readable by authenticated, writable only by platform admin)
create policy compliance_rules_select on public.compliance_rules
  for select to authenticated
  using (true);

create policy compliance_rules_insert on public.compliance_rules
  for insert to authenticated
  with check (public.is_platform_admin());

create policy compliance_rules_update on public.compliance_rules
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy compliance_rules_delete on public.compliance_rules
  for delete to authenticated
  using (public.is_platform_admin());

-- 14. alerts
create policy alerts_select on public.alerts
  for select to authenticated
  using (public.user_is_org_member(public.iec_org_id(iec_id)));

create policy alerts_insert on public.alerts
  for insert to authenticated
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

create policy alerts_update on public.alerts
  for update to authenticated
  using (public.user_can_write_org(public.iec_org_id(iec_id)))
  with check (public.user_can_write_org(public.iec_org_id(iec_id)));

-- 15. subscriptions (SELECT only for org members; writes strictly restricted to service_role)
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.user_is_org_member(org_id));

-- 16. payment_events (SELECT only for org members when org_id is linked, or platform admin; writes strictly service_role)
create policy payment_events_select on public.payment_events
  for select to authenticated
  using (
    (org_id is not null and public.user_is_org_member(org_id))
    or public.is_platform_admin()
  );

-- 17. usage_counters
create policy usage_counters_select on public.usage_counters
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy usage_counters_insert on public.usage_counters
  for insert to authenticated
  with check (public.user_can_write_org(org_id));

create policy usage_counters_update on public.usage_counters
  for update to authenticated
  using (public.user_can_write_org(org_id))
  with check (public.user_can_write_org(org_id));

-- 18. audit_log (append-only for org writers; readable by org members)
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.user_is_org_member(org_id));

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (public.user_can_write_org(org_id));

