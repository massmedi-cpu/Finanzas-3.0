begin;

-- Financial App 6.4.6 · cierre de reconciliación documental de Drive.
do $$
declare
  v_app_version text;
  v_target_version text;
  v_checked boolean:=false;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';
  select coalesce((value #>> '{}')::boolean,false)
    into v_checked
  from financial_app.app_meta
  where key='drive_reconciliation_v646_checked';

  if coalesce(v_app_version,'') not in ('6.4.5','6.4.6')
    or coalesce(v_target_version,'') not in ('6.4.5','6.4.6') then
    raise exception 'financial_app_6_4_6_requires_6_4_5_baseline';
  end if;

  if not coalesce(v_checked,false) then
    raise exception 'financial_app_6_4_6_reconciliation_not_armed';
  end if;

  if to_regprocedure('financial_app.home_pulse_core(date)') is null then
    raise exception 'financial_app_6_4_6_home_pulse_missing';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('6.4.6'::text),now()),
  ('target_version',to_jsonb('6.4.6'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1 from financial_app.app_meta
    where key in('app_version','target_version') and value #>> '{}' <> '6.4.6'
  ) or (
    select count(*) from financial_app.app_meta where key in('app_version','target_version')
  )<>2 then
    raise exception 'financial_app_6_4_6_metadata_alignment_failed';
  end if;

  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='6.4.6' and target_version='6.4.6'
  ) then
    raise exception 'financial_app_6_4_6_manifest_alignment_failed';
  end if;
end
$$;

commit;
