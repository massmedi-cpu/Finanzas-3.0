begin;

-- Control must not read the private app_meta table from an invoker wrapper.
-- Reuse the existing guarded version accessor instead.
create or replace function public.financial_app_matching_observability(p_recent_days integer default 90)
returns jsonb
language sql
stable
set search_path=pg_catalog,financial_app
as $$
  select financial_app.matching_observability_core(p_recent_days)
    || jsonb_build_object('version',financial_app.current_app_version())
$$;
revoke all on function public.financial_app_matching_observability(integer) from public,anon;
grant execute on function public.financial_app_matching_observability(integer) to authenticated,service_role;

-- Exact duplicate lookup used before Archive tries to insert a second copy.
create or replace function financial_app.archive_find_by_hash_core(p_content_hash text)
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_id uuid;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_content_hash,'')),'') is null then return null; end if;

  select d.id into v_id
  from financial_app.documents d
  where d.content_hash=lower(trim(p_content_hash))
  order by d.created_at asc
  limit 1;

  return v_id;
end
$$;
revoke all on function financial_app.archive_find_by_hash_core(text) from public,anon;
grant execute on function financial_app.archive_find_by_hash_core(text) to authenticated,service_role;

create or replace function public.financial_app_archive_find_by_hash(p_content_hash text)
returns uuid
language sql
stable
set search_path=pg_catalog,financial_app
as $$
  select financial_app.archive_find_by_hash_core(p_content_hash)
$$;
revoke all on function public.financial_app_archive_find_by_hash(text) from public,anon;
grant execute on function public.financial_app_archive_find_by_hash(text) to authenticated,service_role;

-- A repeated scan is the same original bytes (same SHA-256). Keep the existing
-- document id, links and history, but point it at the newly uploaded identical
-- object so the current OCR pass can proceed normally. The API removes the old
-- Storage object through the supported Storage API after this succeeds.
create or replace function financial_app.archive_reuse_duplicate_core(
  p_id uuid,
  p_content_hash text,
  p_file_name text,
  p_mime_type text,
  p_storage_path text,
  p_file_size bigint
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth,storage
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_uid uuid:=auth.uid();
  v_owner text;
  v_before jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_uid is null then raise exception 'missing user'; end if;
  if nullif(trim(coalesce(p_content_hash,'')),'') is null then raise exception 'content hash required'; end if;
  if nullif(trim(coalesce(p_storage_path,'')),'') is null then raise exception 'file metadata required'; end if;
  if p_storage_path not like v_uid::text||'/%' then raise exception 'invalid storage path'; end if;
  if p_mime_type not in('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif') then raise exception 'unsupported file type'; end if;
  if coalesce(p_file_size,0)<=0 or p_file_size>20971520 then raise exception 'invalid file size'; end if;

  select owner_id into v_owner
  from storage.objects
  where bucket_id='financial-app-documents' and name=p_storage_path
  limit 1;
  if v_owner is null or v_owner<>v_uid::text then raise exception 'stored object not found'; end if;

  select to_jsonb(d) into v_before
  from financial_app.documents d
  where d.id=p_id and d.content_hash=lower(trim(p_content_hash));
  if v_before is null then raise exception 'document_not_found'; end if;

  update financial_app.documents
  set file_name=coalesce(nullif(trim(p_file_name),''),file_name),
      mime_type=p_mime_type,
      storage_provider='supabase_storage',
      storage_url=null,
      storage_path=p_storage_path,
      file_size=p_file_size,
      original_preserved=true,
      updated_at=now()
  where id=p_id;

  insert into financial_app.document_history(document_id,action,before_value,after_value,changed_by)
  select p_id,'reuse_duplicate_original',v_before,to_jsonb(d),v_email
  from financial_app.documents d where d.id=p_id;

  return true;
end
$$;
revoke all on function financial_app.archive_reuse_duplicate_core(uuid,text,text,text,text,bigint) from public,anon;
grant execute on function financial_app.archive_reuse_duplicate_core(uuid,text,text,text,text,bigint) to authenticated,service_role;

create or replace function public.financial_app_archive_reuse_duplicate(
  p_id uuid,
  p_content_hash text,
  p_file_name text,
  p_mime_type text,
  p_storage_path text,
  p_file_size bigint
) returns boolean
language sql
set search_path=pg_catalog,financial_app
as $$
  select financial_app.archive_reuse_duplicate_core(
    p_id,p_content_hash,p_file_name,p_mime_type,p_storage_path,p_file_size
  )
$$;
revoke all on function public.financial_app_archive_reuse_duplicate(uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.financial_app_archive_reuse_duplicate(uuid,text,text,text,text,bigint) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
