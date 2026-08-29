begin;

-- Financial App 9.0.0 · cierre de Facturas pendientes inteligentes.
-- La capacidad funcional debe existir previamente en FINANCIAL_APP_9.0.0_PENDING_INVOICE_COMMITMENTS.sql.
-- Este cierre solo valida contratos y alinea metadata; no modifica documentos, movimientos ni saldos de origen.
do $$
declare
  v_app_version text;
  v_target_version text;
  v_document_definer boolean;
  v_calendar_definer boolean;
  v_liquidity_definer boolean;
begin
  select value#>>'{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value#>>'{}' into v_target_version from financial_app.app_meta where key='target_version';

  if coalesce(v_app_version,'') not in('8.0.0','9.0.0')
    or coalesce(v_target_version,'') not in('8.0.0','9.0.0') then
    raise exception 'financial_app_9_0_0_requires_8_0_0_baseline';
  end if;

  select p.prosecdef into v_document_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='forecast_calendar_document_commitments_core'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_months integer';

  select p.prosecdef into v_calendar_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_app_forecast_calendar'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_months integer';

  select p.prosecdef into v_liquidity_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='forecast_liquidity_core'
    and pg_get_function_identity_arguments(p.oid)='p_start date, p_days integer';

  if v_document_definer is distinct from true
    or v_calendar_definer is distinct from false
    or v_liquidity_definer is distinct from true then
    raise exception 'financial_app_9_0_0_security_contract_missing';
  end if;

  if has_function_privilege('anon','public.financial_app_forecast_calendar(date,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.financial_app_forecast_calendar(date,integer)','EXECUTE') then
    raise exception 'financial_app_9_0_0_calendar_grants_invalid';
  end if;

  if not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='financial_app' and p.proname='forecast_calendar_document_commitments_core'
      and lower(pg_get_functiondef(p.oid)) like '%forecast_calendar_visible_core(p_start,p_months)%'
      and lower(pg_get_functiondef(p.oid)) like '%document_match_candidates_rows_core(f.document_id,1)%'
      and lower(pg_get_functiondef(p.oid)) like '%forecast_event_overrides%'
  ) then
    raise exception 'financial_app_9_0_0_document_forecast_contract_missing';
  end if;

  if not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='financial_app' and p.proname='forecast_liquidity_core'
      and lower(pg_get_functiondef(p.oid)) like '%forecast_calendar_document_commitments_core(v_start,v_months)%'
  ) then
    raise exception 'financial_app_9_0_0_canonical_liquidity_dependency_missing';
  end if;

  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='financial_app' and p.proname='forecast_calendar_document_commitments_core'
      and lower(pg_get_functiondef(p.oid)) ~ '(insert[[:space:]]+into[[:space:]]+financial_app\.(documents|transactions)|update[[:space:]]+financial_app\.(documents|transactions)|delete[[:space:]]+from[[:space:]]+financial_app\.(documents|transactions))'
  ) then
    raise exception 'financial_app_9_0_0_source_data_mutation_detected';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('9.0.0'::text),now()),
  ('target_version',to_jsonb('9.0.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value#>>'{}'<>'9.0.0'
  ) or (select count(*) from financial_app.app_meta where key in('app_version','target_version'))<>2 then
    raise exception 'financial_app_9_0_0_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='9.0.0' and target_version='9.0.0'
  ) then
    raise exception 'financial_app_9_0_0_manifest_alignment_failed';
  end if;
end
$$;

commit;