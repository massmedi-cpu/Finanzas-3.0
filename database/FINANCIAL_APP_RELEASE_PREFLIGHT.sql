begin;

-- Financial App — preflight de contrato código ↔ Supabase.
-- Expone exclusivamente versión/capacidades técnicas, nunca datos financieros ni usuarios.
create or replace function public.financial_app_release_preflight(
  p_expected_version text,
  p_required_functions text[] default array[]::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, financial_app
as $$
declare
  v_app_version text;
  v_target_version text;
  v_required text[];
  v_missing text[];
begin
  if p_expected_version is null or p_expected_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    return jsonb_build_object('ok',false,'error','invalid_expected_version');
  end if;

  select coalesce(array_agg(distinct lower(trim(value)) order by lower(trim(value))),array[]::text[])
  into v_required
  from unnest(coalesce(p_required_functions,array[]::text[])) value
  where nullif(trim(value),'') is not null;

  if cardinality(v_required)>200 then
    return jsonb_build_object('ok',false,'error','required_function_limit_exceeded');
  end if;

  if exists(
    select 1 from unnest(v_required) value
    where value !~ '^financial_app_[a-z0-9_]+$'
  ) then
    return jsonb_build_object('ok',false,'error','invalid_required_function');
  end if;

  select value #>> '{}'
  into v_app_version
  from financial_app.app_meta
  where key='app_version';

  select value #>> '{}'
  into v_target_version
  from financial_app.app_meta
  where key='target_version';

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_missing
  from unnest(v_required) value
  where not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=value
  );

  return jsonb_build_object(
    'ok',v_app_version=p_expected_version and v_target_version=p_expected_version and cardinality(v_missing)=0,
    'appVersion',v_app_version,
    'targetVersion',v_target_version,
    'expectedVersion',p_expected_version,
    'requiredCount',cardinality(v_required),
    'missing',to_jsonb(v_missing)
  );
end
$$;

revoke all on function public.financial_app_release_preflight(text,text[]) from public;
grant execute on function public.financial_app_release_preflight(text,text[]) to anon, authenticated, service_role;

commit;
