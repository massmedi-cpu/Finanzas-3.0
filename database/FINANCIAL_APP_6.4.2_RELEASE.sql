begin;

-- Financial App 6.4.2 — cierre de seguridad.
do $$
declare
  v_app_version text;
  v_target_version text;
  v_wrapper_definer boolean;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';
  if coalesce(v_app_version,'') not in ('6.4.1','6.4.2')
    or coalesce(v_target_version,'') not in ('6.4.1','6.4.2') then
    raise exception 'financial_app_6_4_2_requires_6_4_1_baseline';
  end if;

  select p.prosecdef into v_wrapper_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='financial_app_document_matching_dashboard'
    and pg_get_function_identity_arguments(p.oid)='p_limit integer, p_days integer';

  if coalesce(v_wrapper_definer,true)
    or has_function_privilege('anon','public.financial_app_document_matching_dashboard(integer,integer)','EXECUTE')
    or not has_function_privilege('authenticated','financial_app.document_matching_dashboard_core(integer,integer)','EXECUTE') then
    raise exception 'financial_app_6_4_2_security_contract_required';
  end if;
end
$$;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('6.4.2'::text),now()),
  ('target_version',to_jsonb('6.4.2'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $$
begin
  if exists(select 1 from financial_app.app_meta where key in('app_version','target_version') and value #>> '{}' <> '6.4.2')
    or (select count(*) from financial_app.app_meta where key in('app_version','target_version'))<>2 then
    raise exception 'financial_app_6_4_2_metadata_alignment_failed';
  end if;
  if not exists(
    select 1 from public.financial_app_release_manifest
    where singleton=true and app_version='6.4.2' and target_version='6.4.2'
  ) then raise exception 'financial_app_6_4_2_manifest_alignment_failed'; end if;
end
$$;

commit;
