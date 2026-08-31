-- Financial App 9.0.0
-- Fuente reproducible del preflight reforzado desplegado en producción.
--
-- SECURITY DEFINER permite que el probe público de CI inspeccione únicamente
-- metadatos técnicos del esquema privado sin conceder USAGE de financial_app
-- a anon. El search_path queda cerrado a pg_catalog + public y cualquier
-- acceso privado se referencia de forma cualificada.

begin;

create or replace function public.financial_app_release_preflight(
  p_expected_version text,
  p_required_functions text[] default array[]::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_app_version text;
  v_target_version text;
  v_required text[];
  v_missing text[];
  v_search_ready boolean:=false;
  v_forecast_document_ready boolean:=false;
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

  select app_version,target_version
  into v_app_version,v_target_version
  from public.financial_app_release_manifest
  where singleton=true;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_missing
  from unnest(v_required) value
  where not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=value
  );

  select
    exists(
      select 1
      from pg_attribute a
      where a.attrelid='financial_app.transactions'::regclass
        and a.attname='search_vector'
        and not a.attisdropped
        and a.attnotnull
        and a.atttypid='tsvector'::regtype
    )
    and exists(
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      join pg_index i on i.indexrelid=c.oid
      where n.nspname='financial_app'
        and c.relname='idx_transactions_search'
        and i.indrelid='financial_app.transactions'::regclass
        and i.indisvalid
        and i.indisready
        and pg_get_indexdef(c.oid) like '%USING gin (search_vector)%'
    )
    and exists(
      select 1
      from pg_trigger t
      where t.tgrelid='financial_app.transactions'::regclass
        and t.tgname='transactions_refresh_search_vector'
        and not t.tgisinternal
        and t.tgenabled<>'D'
    )
    and exists(
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app'
        and p.proname='movements_advanced_core'
        and pg_get_functiondef(p.oid) like '%t.search_vector @@ websearch_to_tsquery%'
        and pg_get_functiondef(p.oid) not like '%to_tsvector(''simple'',coalesce(t.source_original_concept%'
    )
  into v_search_ready;

  select
    exists(
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app'
        and p.proname='document_has_match_candidate_core'
        and not p.prosecdef
    )
    and not has_function_privilege('anon','financial_app.document_has_match_candidate_core(uuid)','execute')
    and not has_function_privilege('authenticated','financial_app.document_has_match_candidate_core(uuid)','execute')
    and exists(
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app'
        and p.proname='forecast_calendar_document_commitments_core'
        and pg_get_functiondef(p.oid) like '%not financial_app.document_has_match_candidate_core(f.document_id)%'
        and pg_get_functiondef(p.oid) not like '%document_match_candidates_rows_core(f.document_id,1)%'
    )
  into v_forecast_document_ready;

  return jsonb_build_object(
    'ok',v_app_version=p_expected_version
      and v_target_version=p_expected_version
      and cardinality(v_missing)=0
      and v_search_ready
      and v_forecast_document_ready,
    'appVersion',v_app_version,
    'targetVersion',v_target_version,
    'expectedVersion',p_expected_version,
    'requiredCount',cardinality(v_required),
    'missing',to_jsonb(v_missing),
    'searchVectorReady',v_search_ready,
    'forecastDocumentCandidateReady',v_forecast_document_ready
  );
end
$$;

revoke all on function public.financial_app_release_preflight(text,text[]) from public;
grant execute on function public.financial_app_release_preflight(text,text[]) to anon, authenticated, service_role;

comment on function public.financial_app_release_preflight(text,text[]) is
  'Read-only release contract probe. SECURITY DEFINER is required so the public CI probe can inspect private financial_app schema metadata without granting anon USAGE on that schema.';

commit;
