-- 0003_storage_documents.sql
-- Private storage bucket "documents" with path structure {org_id}/{iec_id}/{uuid}.pdf

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.storage_path_belongs_to_org(
  object_name text,
  require_write boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, auth
as $$
declare
  folders text[];
  path_org_id uuid;
  path_iec_id uuid;
begin
  folders := storage.foldername(object_name);
  if array_length(folders, 1) <> 2 then
    return false;
  end if;

  path_org_id := public.try_parse_uuid(folders[1]);
  path_iec_id := public.try_parse_uuid(folders[2]);

  if path_org_id is null or path_iec_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.iec_profiles p
    where p.id = path_iec_id
      and p.org_id = path_org_id
  ) then
    return false;
  end if;

  if require_write then
    return public.user_can_write_org(path_org_id);
  else
    return public.user_is_org_member(path_org_id);
  end if;
end;
$$;

create policy documents_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.storage_path_belongs_to_org(name, false)
  );

create policy documents_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.storage_path_belongs_to_org(name, true)
  );

create policy documents_bucket_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and public.storage_path_belongs_to_org(name, true)
  )
  with check (
    bucket_id = 'documents'
    and public.storage_path_belongs_to_org(name, true)
  );

create policy documents_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.storage_path_belongs_to_org(name, true)
  );

