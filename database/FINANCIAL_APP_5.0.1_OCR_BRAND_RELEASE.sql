begin;

-- Financial App 5.0.1 changes only browser-side OCR and product identity.
-- Keep the release contract aligned without mutating financial records.
do $$
declare
  v_app_version text;
  v_target_version text;
begin
  select value #>> '{}' into v_app_version
  from financial_app.app_meta
  where key='app_version';

  select value #>> '{}' into v_target_version
  from financial_app.app_meta
  where key='target_version';

  if coalesce(v_app_version,'') not in ('5.0.0','5.0.1')
    or coalesce(v_target_version,'') not in ('5.0.0','5.0.1') then
    raise exception 'financial_app_5_0_1_requires_5_0_baseline';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('5.0.1'::text),now()),
  ('target_version',to_jsonb('5.0.1'::text),now())
on conflict (key) do update
set value=excluded.value,
    updated_at=excluded.updated_at;

do $$
begin
  if exists(
    select 1
    from financial_app.app_meta
    where key in ('app_version','target_version')
      and value #>> '{}' <> '5.0.1'
  ) or (
    select count(*)
    from financial_app.app_meta
    where key in ('app_version','target_version')
  ) <> 2 then
    raise exception 'financial_app_5_0_1_metadata_alignment_failed';
  end if;

  if not exists(
    select 1
    from public.financial_app_release_manifest
    where singleton=true
      and app_version='5.0.1'
      and target_version='5.0.1'
  ) then
    raise exception 'financial_app_5_0_1_manifest_alignment_failed';
  end if;
end
$$;

commit;
