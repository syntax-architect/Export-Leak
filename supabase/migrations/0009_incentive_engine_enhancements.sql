-- Prompt 8: Incentive calculation engine, scroll importer metadata, scrip expiry provenance,
-- overlapping rate range protection, and missing DELETE RLS policies.

create or replace function public.enforce_no_overlapping_incentive_rates()
returns trigger
language plpgsql
as $$
declare
  new_end date;
  conflict_id uuid;
begin
  new_end := coalesce(new.effective_to, date '9999-12-31');

  if new.effective_to is not null and new.effective_to < new.effective_from then
    raise exception 'effective_to (%) cannot precede effective_from (%)', new.effective_to, new.effective_from
      using errcode = '23514';
  end if;

  if length(trim(new.hs_code)) <> 8 or trim(new.hs_code) !~ '^[0-9]{8}$' then
    raise exception 'hs_code (%) must be an 8-digit code', new.hs_code
      using errcode = '23514';
  end if;

  select ir.id
    into conflict_id
  from public.incentive_rates ir
  where ir.scheme = new.scheme
    and ir.hs_code = new.hs_code
    and ir.id is distinct from new.id
    and ir.effective_from <= new_end
    and coalesce(ir.effective_to, date '9999-12-31') >= new.effective_from
  limit 1;

  if conflict_id is not null then
    raise exception 'Overlapping effective date range for scheme % and hs_code % (conflicts with %)',
      new.scheme, new.hs_code, conflict_id
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists incentive_rates_no_overlap on public.incentive_rates;
create trigger incentive_rates_no_overlap
  before insert or update on public.incentive_rates
  for each row execute function public.enforce_no_overlapping_incentive_rates();

alter table public.incentive_credits
  add column if not exists scroll_number text not null default '',
  add column if not exists raw jsonb not null default '{}'::jsonb;

create unique index if not exists incentive_credits_sb_scheme_scroll_unique
  on public.incentive_credits (shipping_bill_id, scheme, scroll_number)
  where scroll_number <> '';

alter table public.scrips
  add column if not exists expiry_source text not null default 'unconfirmed'
    check (expiry_source in ('compliance_rule', 'manual', 'unconfirmed')),
  add column if not exists notes text not null default '';

-- Missing DELETE RLS policies for recomputation / cleanup / scrip deletion
create policy incentive_expectations_delete_member
  on public.incentive_expectations for delete
  using (
    exists (
      select 1
      from public.shipping_bills sb
      join public.iec_profiles iec on iec.id = sb.iec_id
      where sb.id = incentive_expectations.shipping_bill_id
        and public.user_can_write_org(iec.org_id)
    )
  );

create policy incentive_credits_delete_member
  on public.incentive_credits for delete
  using (
    exists (
      select 1
      from public.shipping_bills sb
      join public.iec_profiles iec on iec.id = sb.iec_id
      where sb.id = incentive_credits.shipping_bill_id
        and public.user_can_write_org(iec.org_id)
    )
  );

create policy scrips_delete_member
  on public.scrips for delete
  using (
    exists (
      select 1
      from public.iec_profiles iec
      where iec.id = scrips.iec_id
        and public.user_can_write_org(iec.org_id)
    )
  );

