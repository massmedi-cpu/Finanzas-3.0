-- Financial App 3.1.0
-- Archivo funciona como biblioteca única: eliminar no requiere archivado previo.

create or replace function financial_app.archive_delete_core(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
begin
  v_email := financial_app.authorized_email();
  if v_email is null then
    raise exception 'forbidden' using errcode='42501';
  end if;

  if not exists(select 1 from financial_app.documents where id=p_id) then
    raise exception 'document not found';
  end if;

  delete from financial_app.documents where id=p_id;
  return true;
end
$$;

insert into financial_app.app_meta(key,value)
values('app_version',to_jsonb('3.1.0'::text))
on conflict(key) do update set value=excluded.value;
