begin;

-- Financial App 7.0.0 · cierre de Agenda Financiera Inteligente.
-- El runtime de liquidez ya debe existir como capa aditiva; este cierre solo alinea metadata.
-- No modifica movimientos, cuentas, saldos de origen, documentos, matching ni previsiones guardadas.
do $$
declare
  v_app_version text;
  v_target_version text;
  v_private_definer boolean;
  v_public_definer boolean;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';

  if coalesce(v_app_version,'') not in ('6.5.0','7.0.0')
    or coalesce(v_target_version,'') not in ('6.5.0','7.0.0') then
    raise exception 'financial_app_7_0_0_requires_6_5_0_baseline';
  end if;

  select p.prosecdef into v_private_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='forecast_liquidity_core'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_days integer';

  select p.prosecdef into v_public_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_app_forecast_liquidity'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_days integer';

  if v_private_definer is distinct from true or v_public_definer is distinct from false then
    raise exception 'financial_app_7_0_0_liquidity_security_contract_missing';
  end if;

  if has_function_privilege('anon','public.financial_app_forecast_liquidity(date,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.financial_app_forecast_liquidity(date,integer)','EXECUTE') then
    raise exception 'financial_app_7_0_0_liquidity_grants_invalid';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('7.0.0'::text),now()),
  ('target_version',to_jsonb('7.0.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value #>> '{}' <> '7.0.0'
  ) or (
    select count(*) from financial_app.app_meta where key in('app_version','target_version')
  )<>2 then
    raise exception 'financial_app_7_0_0_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='7.0.0' and target_version='7.0.0'
  ) then
    raise exception 'financial_app_7_0_0_manifest_alignment_failed';
  end if;
end
$$;

commit;