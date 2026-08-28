begin;

-- Financial App 6.4.0 — cierre de release.
-- Requiere baseline 6.3.2. El contrato operativo se instala previamente de forma compatible
-- para que CI y producción puedan transicionar sin una ventana de incompatibilidad.
do $$
declare
  v_app_version text;
  v_target_version text;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';
  if coalesce(v_app_version,'') not in ('6.3.2','6.4.0')
    or coalesce(v_target_version,'') not in ('6.3.2','6.4.0') then
    raise exception 'financial_app_6_4_0_requires_6_3_2_baseline';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('6.4.0'::text),now()),
  ('target_version',to_jsonb('6.4.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(select 1 from financial_app.app_meta where key in('app_version','target_version') and value #>> '{}' <> '6.4.0')
    or (select count(*) from financial_app.app_meta where key in('app_version','target_version'))<>2 then
    raise exception 'financial_app_6_4_0_metadata_alignment_failed';
  end if;
  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='6.4.0' and target_version='6.4.0'
  ) then raise exception 'financial_app_6_4_0_manifest_alignment_failed'; end if;
end
$$;

commit;
