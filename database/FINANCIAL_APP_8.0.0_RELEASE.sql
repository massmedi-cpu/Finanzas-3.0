begin;

-- Financial App 8.0.0 · cierre del Simulador de Decisiones.
-- La capacidad funcional debe existir previamente en FINANCIAL_APP_8.0.0_SCENARIO_LAB.sql.
-- Este cierre solo valida contratos y alinea metadata; no persiste escenarios ni modifica datos financieros de origen.
do $$
declare
  v_app_version text;
  v_target_version text;
  v_private_definer boolean;
  v_public_definer boolean;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';

  if coalesce(v_app_version,'') not in ('7.0.0','8.0.0')
    or coalesce(v_target_version,'') not in ('7.0.0','8.0.0') then
    raise exception 'financial_app_8_0_0_requires_7_0_0_baseline';
  end if;

  select p.prosecdef into v_private_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='forecast_scenario_core'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_days integer, p_events jsonb';

  select p.prosecdef into v_public_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_app_forecast_scenario'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_days integer, p_events jsonb';

  if v_private_definer is distinct from true or v_public_definer is distinct from false then
    raise exception 'financial_app_8_0_0_scenario_security_contract_missing';
  end if;

  if has_function_privilege('anon','public.financial_app_forecast_scenario(date,integer,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.financial_app_forecast_scenario(date,integer,jsonb)','EXECUTE') then
    raise exception 'financial_app_8_0_0_scenario_grants_invalid';
  end if;

  if not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='financial_app' and p.proname='forecast_scenario_core'
      and lower(pg_get_functiondef(p.oid)) like '%forecast_liquidity_core(v_start,v_days)%'
  ) then
    raise exception 'financial_app_8_0_0_canonical_liquidity_dependency_missing';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('8.0.0'::text),now()),
  ('target_version',to_jsonb('8.0.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value #>> '{}' <> '8.0.0'
  ) or (
    select count(*) from financial_app.app_meta where key in('app_version','target_version')
  )<>2 then
    raise exception 'financial_app_8_0_0_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='8.0.0' and target_version='8.0.0'
  ) then
    raise exception 'financial_app_8_0_0_manifest_alignment_failed';
  end if;
end
$$;

commit;