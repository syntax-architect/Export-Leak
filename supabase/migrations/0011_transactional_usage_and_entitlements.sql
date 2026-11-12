-- 0011_transactional_usage_and_entitlements.sql
-- Ensures document creation and monthly usage_counters increments run in a single DB transaction.

create or replace function public.commit_document_with_usage(
  p_doc_id uuid,
  p_org_id uuid,
  p_iec_id uuid,
  p_kind text,
  p_storage_path text,
  p_sha256 text,
  p_original_name text,
  p_file_size_bytes integer,
  p_mime_type text,
  p_actor_id uuid,
  p_period_start date,
  p_increment_usage boolean
)
returns table (
  id uuid,
  iec_id uuid,
  kind text,
  original_name text,
  parse_status text,
  file_size_bytes integer,
  mime_type text,
  parse_error text,
  sha256 text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null and not public.user_can_write_org(p_org_id) then
    raise exception 'Permission denied to commit document for this organization';
  end if;

  if not exists (
    select 1
    from public.iec_profiles p
    where p.id = p_iec_id
      and p.org_id = p_org_id
  ) then
    raise exception 'IEC profile does not belong to this organization';
  end if;

  if p_increment_usage then
    insert into public.usage_counters (org_id, period_start, shipping_bills_used)
    values (p_org_id, p_period_start, 1)
    on conflict (org_id, period_start) do update
      set shipping_bills_used = public.usage_counters.shipping_bills_used + 1,
          updated_at = now();
  end if;

  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
  values (
    p_org_id,
    p_actor_id,
    'create',
    'documents',
    p_doc_id,
    jsonb_build_object(
      'kind', p_kind,
      'sha256', p_sha256,
      'bytes', p_file_size_bytes
    )
  );

  return query
  insert into public.documents (
    id,
    iec_id,
    kind,
    storage_path,
    sha256,
    original_name,
    parse_status,
    file_size_bytes,
    mime_type,
    uploaded_by
  )
  values (
    p_doc_id,
    p_iec_id,
    p_kind,
    p_storage_path,
    p_sha256,
    p_original_name,
    'queued',
    p_file_size_bytes,
    p_mime_type,
    p_actor_id
  )
  returning
    documents.id,
    documents.iec_id,
    documents.kind,
    documents.original_name,
    documents.parse_status,
    documents.file_size_bytes,
    documents.mime_type,
    documents.parse_error,
    documents.sha256,
    documents.created_at;
end;
$$;

revoke all on function public.commit_document_with_usage(
  uuid, uuid, uuid, text, text, text, text, integer, text, uuid, date, boolean
) from public;
grant execute on function public.commit_document_with_usage(
  uuid, uuid, uuid, text, text, text, text, integer, text, uuid, date, boolean
) to authenticated;
grant execute on function public.commit_document_with_usage(
  uuid, uuid, uuid, text, text, text, text, integer, text, uuid, date, boolean
) to service_role;

