-- 0006_documents_upload_and_purge.sql
-- Adds upload metadata columns (file_size_bytes, mime_type, parse_error),
-- soft-delete purge index, and transactional Asia/Kolkata usage metering RPC.

alter table public.documents
  add column if not exists file_size_bytes integer check (file_size_bytes is null or file_size_bytes >= 0),
  add column if not exists mime_type text,
  add column if not exists parse_error text;

create index if not exists documents_deleted_at_idx
  on public.documents (deleted_at)
  where deleted_at is not null;

create or replace function public.increment_shipping_bill_usage(
  target_org_id uuid,
  target_period_start date,
  delta integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_used integer;
begin
  if delta is null or delta <= 0 then
    select coalesce(shipping_bills_used, 0)
      into new_used
      from public.usage_counters
      where org_id = target_org_id and period_start = target_period_start;
    return coalesce(new_used, 0);
  end if;

  if auth.uid() is not null and not public.user_can_write_org(target_org_id) then
    raise exception 'Permission denied to update organization usage counter';
  end if;

  insert into public.usage_counters (org_id, period_start, shipping_bills_used)
  values (target_org_id, target_period_start, delta)
  on conflict (org_id, period_start) do update
    set shipping_bills_used = public.usage_counters.shipping_bills_used + excluded.shipping_bills_used,
        updated_at = now()
  returning shipping_bills_used into new_used;

  return new_used;
end;
$$;

revoke all on function public.increment_shipping_bill_usage(uuid, date, integer) from public;
grant execute on function public.increment_shipping_bill_usage(uuid, date, integer) to authenticated;
grant execute on function public.increment_shipping_bill_usage(uuid, date, integer) to service_role;

