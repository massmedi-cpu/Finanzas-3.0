begin;

-- AXIOMA 3.4.1: la implementación vigente de Movimientos deja de vivir bajo un
-- nombre histórico (_v14). Se promueve exactamente esa implementación a los
-- nombres canónicos y después se eliminan las firmas antiguas sin CASCADE.
do $axioma$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='movements_advanced_v14_core' and p.pronargs=23;
  if v_definition is null then raise exception 'Missing movements_advanced_v14_core source'; end if;
  execute replace(v_definition,'_v14','');

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='movements_advanced_v14_enriched_core' and p.pronargs=23;
  if v_definition is null then raise exception 'Missing movements_advanced_v14_enriched_core source'; end if;
  execute replace(v_definition,'_v14','');

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_app_movements_advanced_v14' and p.pronargs=23;
  if v_definition is null then raise exception 'Missing financial_app_movements_advanced_v14 source'; end if;
  execute replace(v_definition,'_v14','');
end
$axioma$;

-- La nueva firma canónica conserva el filtro p_duplicate pero solo se expone a
-- los roles que usa Financial App.
do $permissions$
declare
  r record;
begin
  for r in
    select n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='financial_app_movements_advanced' and p.pronargs=23
  loop
    execute format('revoke execute on function %I.%I(%s) from public, anon',r.schema_name,r.proname,r.args);
    execute format('grant execute on function %I.%I(%s) to authenticated, service_role',r.schema_name,r.proname,r.args);
  end loop;
end
$permissions$;

-- Se retiran primero los wrappers y después los cores. RESTRICT es intencional:
-- si apareciera una dependencia no contemplada, la migración debe fallar en vez
-- de borrar en cascada algo funcional.
do $cleanup$
declare
  r record;
begin
  for r in
    select * from (
      select 10 ord,n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) args
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='financial_app_movements_advanced_v14'
      union all
      select 20,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='financial_app_movements_advanced' and p.pronargs=22
      union all
      select 30,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app' and p.proname='movements_advanced_v14_enriched_core'
      union all
      select 40,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app' and p.proname='movements_advanced_enriched_core' and p.pronargs=22
      union all
      select 50,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app' and p.proname='movements_advanced_v14_core'
      union all
      select 60,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app' and p.proname='movements_advanced_core' and p.pronargs=22
    ) q order by ord
  loop
    execute format('drop function %I.%I(%s) restrict',r.schema_name,r.proname,r.args);
  end loop;
end
$cleanup$;

-- El acceso anónimo a operaciones de archivo nunca forma parte del contrato.
revoke execute on function public.financial_app_archive_delete(uuid) from public, anon;
revoke execute on function public.financial_app_archive_restore(uuid) from public, anon;
grant execute on function public.financial_app_archive_delete(uuid) to authenticated, service_role;
grant execute on function public.financial_app_archive_restore(uuid) to authenticated, service_role;

-- El core privilegiado de autoenlace no necesita ser invocable directamente por
-- clientes. El wrapper público conserva la comprobación de authorized_email().
revoke execute on function financial_app.auto_link_documents_core() from public, anon, authenticated;
grant execute on function financial_app.auto_link_documents_core() to service_role;

-- Los endpoints antiguos arrastraban como metadato la versión en la que nacieron.
-- No se reescribe su lógica: se sustituye únicamente el literal esperado y la
-- migración falla si la definición ya no coincide, evitando modificaciones opacas.
do $version_cleanup$
declare
  r record;
  v_definition text;
  v_old_marker text;
  v_new_marker constant text := '''version'',financial_app.current_app_version()';
begin
  for r in
    select * from (values
      ('account_detail_core','0.4.0'),
      ('accounts_core','0.4.0'),
      ('archive_overview_core','0.10.0'),
      ('forecast_overview_core','0.8.1'),
      ('net_worth_overview_core','0.8.0')
    ) as expected(proname,old_version)
  loop
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='financial_app' and p.proname=r.proname;
    if v_definition is null then raise exception 'Missing function %',r.proname; end if;
    v_old_marker:=format('''version'',''%s''',r.old_version);
    if position(v_old_marker in v_definition)=0 then
      raise exception 'Expected version marker % not found in %',v_old_marker,r.proname;
    end if;
    execute replace(v_definition,v_old_marker,v_new_marker);
  end loop;

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='settings_overview_core';
  if v_definition is null then raise exception 'Missing settings_overview_core'; end if;
  if position('''version'',coalesce(v_target,v_schema,''1.0.0'')' in v_definition)=0
     or position('''targetVersion'',coalesce(v_target,''1.0.0'')' in v_definition)=0 then
    raise exception 'Unexpected settings_overview_core version contract';
  end if;
  v_definition:=replace(v_definition,
    '''version'',coalesce(v_target,v_schema,''1.0.0'')',
    '''version'',financial_app.current_app_version()');
  v_definition:=replace(v_definition,
    '''targetVersion'',coalesce(v_target,''1.0.0'')',
    '''targetVersion'',coalesce(v_target,financial_app.current_app_version())');
  execute v_definition;
end
$version_cleanup$;

create or replace function financial_app.current_app_version()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app'
as $function$
  select coalesce((select value #>> '{}' from financial_app.app_meta where key='app_version'),'unknown')
$function$;

-- Metadato de una RC 1.0 que ya no interviene en ningún contrato activo.
delete from financial_app.app_meta where key='release_candidate';

-- La versión visible y la versión objetivo vuelven a quedar alineadas.
insert into financial_app.app_meta(key,value,updated_at)
values ('app_version',to_jsonb('3.4.1'::text),now()),('target_version',to_jsonb('3.4.1'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

commit;
