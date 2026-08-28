begin;

-- Financial App 6.4.8 · cierre metadata-only tras afinar Previsión.
do $$
declare
  v_app_version text;
  v_target_version text;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';

  if coalesce(v_app_version,'') not in ('6.4.7','6.4.8')
    or coalesce(v_target_version,'') not in ('6.4.7','6.4.8') then
    raise exception 'financial_app_6_4_8_requires_6_4_7_baseline';
  end if;

  if to_regprocedure('financial_app.forecast_calendar_visible_core(date,integer)') is null
    or to_regprocedure('financial_app.forecast_calendar_core(date,integer)') is null then
    raise exception 'financial_app_6_4_8_forecast_contract_missing';
  end if;

  if position('genericTaxNeedsRepeatedIdentity' in pg_get_functiondef('financial_app.forecast_calendar_visible_core(date,integer)'::regprocedure))=0 then
    raise exception 'financial_app_6_4_8_precision_rule_missing';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('6.4.8'::text),now()),
  ('target_version',to_jsonb('6.4.8'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value #>> '{}' <> '6.4.8'
  ) or (
    select count(*) from financial_app.app_meta where key in('app_version','target_version')
  )<>2 then
    raise exception 'financial_app_6_4_8_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='6.4.8' and target_version='6.4.8'
  ) then
    raise exception 'financial_app_6_4_8_manifest_alignment_failed';
  end if;
end
$$;

commit;
