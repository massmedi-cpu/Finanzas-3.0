-- Financial App 1.7.0 · alineación de versión canónica
insert into financial_app.app_meta(key,value,updated_at)
values('app_version',to_jsonb('1.7.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
create or replace function financial_app.current_app_version()
returns text language sql stable security definer
set search_path to 'pg_catalog','financial_app'
as $$select coalesce((select value #>> '{}' from financial_app.app_meta where key='app_version'),'1.7.0')$$;
