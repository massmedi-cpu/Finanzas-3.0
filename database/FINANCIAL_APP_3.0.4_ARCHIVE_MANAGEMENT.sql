begin;

create or replace function financial_app.archive_restore_core(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_before jsonb;
  v_after jsonb;
begin
  v_email := financial_app.authorized_email();
  if v_email is null then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select to_jsonb(d) into v_before
  from financial_app.documents d
  where d.id=p_id and d.archived_at is not null;
  if v_before is null then raise exception 'archived document not found'; end if;

  update financial_app.documents
  set archived_at=null, updated_at=now()
  where id=p_id;

  select to_jsonb(d) into v_after from financial_app.documents d where d.id=p_id;
  insert into financial_app.document_history(document_id,action,before_value,after_value,changed_by)
  values(p_id,'restore',v_before,v_after,v_email);
  return true;
end $$;

create or replace function public.financial_app_archive_restore(p_id uuid)
returns boolean
language sql
volatile
set search_path to 'pg_catalog','financial_app','auth'
as $$ select financial_app.archive_restore_core(p_id) $$;

create or replace function financial_app.archive_delete_core(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_archived_at timestamptz;
begin
  v_email := financial_app.authorized_email();
  if v_email is null then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select archived_at into v_archived_at
  from financial_app.documents
  where id=p_id;
  if not found then raise exception 'document not found'; end if;
  if v_archived_at is null then raise exception 'archive document before permanent deletion'; end if;

  delete from financial_app.documents where id=p_id;
  return true;
end $$;

create or replace function public.financial_app_archive_delete(p_id uuid)
returns boolean
language sql
volatile
set search_path to 'pg_catalog','financial_app','auth'
as $$ select financial_app.archive_delete_core(p_id) $$;

revoke all on function public.financial_app_archive_restore(uuid) from public;
revoke all on function public.financial_app_archive_delete(uuid) from public;
grant execute on function public.financial_app_archive_restore(uuid) to authenticated;
grant execute on function public.financial_app_archive_delete(uuid) to authenticated;

commit;
