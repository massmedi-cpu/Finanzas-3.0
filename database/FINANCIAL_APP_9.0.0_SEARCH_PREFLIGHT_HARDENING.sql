begin;

-- Financial App 9.0.0 · parche post-release reproducible.
-- 1) Materializa el vector de busqueda de Movimientos para que canal y etiquetas
--    no invaliden el indice GIN ni obliguen a recalcular to_tsvector por fila.
-- 2) Mantiene el preflight publico como SECURITY INVOKER: el build solo consume
--    metadata publica saneada y nunca necesita privilegios sobre financial_app.

alter table financial_app.transactions
  add column if not exists search_vector tsvector;

create or replace function financial_app.refresh_transaction_search_vector()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','financial_app'
as $function$
begin
  new.search_vector := to_tsvector(
    'simple'::regconfig,
    coalesce(new.source_original_concept,'')||' '||
    coalesce(new.source_normalized_concept,'')||' '||
    coalesce(new.normalized_concept_override,'')||' '||
    coalesce(new.source_counterparty,'')||' '||
    coalesce(new.counterparty_override,'')||' '||
    coalesce(new.notes,'')||' '||
    coalesce(new.source_channel,'')||' '||
    array_to_string(new.tags,' ')
  );
  return new;
end
$function$;

revoke all on function financial_app.refresh_transaction_search_vector() from public,anon,authenticated;

drop trigger if exists transactions_refresh_search_vector on financial_app.transactions;
create trigger transactions_refresh_search_vector
before insert or update of
  source_original_concept,
  source_normalized_concept,
  normalized_concept_override,
  source_counterparty,
  counterparty_override,
  notes,
  source_channel,
  tags
on financial_app.transactions
for each row execute function financial_app.refresh_transaction_search_vector();

update financial_app.transactions t
set search_vector=to_tsvector(
  'simple'::regconfig,
  coalesce(t.source_original_concept,'')||' '||
  coalesce(t.source_normalized_concept,'')||' '||
  coalesce(t.normalized_concept_override,'')||' '||
  coalesce(t.source_counterparty,'')||' '||
  coalesce(t.counterparty_override,'')||' '||
  coalesce(t.notes,'')||' '||
  coalesce(t.source_channel,'')||' '||
  array_to_string(t.tags,' ')
)
where t.search_vector is distinct from to_tsvector(
  'simple'::regconfig,
  coalesce(t.source_original_concept,'')||' '||
  coalesce(t.source_normalized_concept,'')||' '||
  coalesce(t.normalized_concept_override,'')||' '||
  coalesce(t.source_counterparty,'')||' '||
  coalesce(t.counterparty_override,'')||' '||
  coalesce(t.notes,'')||' '||
  coalesce(t.source_channel,'')||' '||
  array_to_string(t.tags,' ')
);

alter table financial_app.transactions alter column search_vector set not null;

drop index if exists financial_app.idx_transactions_search;
create index idx_transactions_search
  on financial_app.transactions using gin(search_vector);

-- La funcion avanzada ya existe en el baseline. Se sustituye solo el predicado
-- FTS conocido; si el baseline ha divergido, abortamos en vez de parchear a ciegas.
do $migration$
declare
  v_oid oid;
  v_definition text;
  v_old text := $old$to_tsvector('simple',coalesce(t.source_original_concept,'')||' '||coalesce(t.source_normalized_concept,'')||' '||coalesce(t.normalized_concept_override,'')||' '||coalesce(t.source_counterparty,'')||' '||coalesce(t.counterparty_override,'')||' '||coalesce(t.notes,'')||' '||coalesce(t.source_channel,'')||' '||array_to_string(t.tags,' ')) @@ websearch_to_tsquery('simple',v_search)$old$;
  v_new text := $new$t.search_vector @@ websearch_to_tsquery('simple',v_search)$new$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='movements_advanced_core';

  if v_oid is null then
    raise exception 'financial_app_search_hardening_missing_movements_core';
  end if;

  v_definition:=pg_get_functiondef(v_oid);
  if position(v_new in v_definition)>0 then
    null;
  elsif position(v_old in v_definition)>0 then
    execute replace(v_definition,v_old,v_new);
  else
    raise exception 'financial_app_search_hardening_unknown_movements_contract';
  end if;
end
$migration$;

alter table public.financial_app_release_manifest
  add column if not exists search_vector_ready boolean not null default false,
  add column if not exists forecast_document_candidate_ready boolean not null default false;

-- Solo publicamos readiness despues de verificar el contrato privado con el rol
-- de migracion. El RPC publico no inspeccionara nunca este esquema directamente.
do $contract$
declare
  v_search_ready boolean;
  v_forecast_ready boolean;
begin
  select
    exists(
      select 1 from pg_attribute a
      where a.attrelid='financial_app.transactions'::regclass
        and a.attname='search_vector'
        and not a.attisdropped
        and a.attnotnull
        and a.atttypid='tsvector'::regtype
    )
    and exists(
      select 1 from pg_indexes i
      where i.schemaname='financial_app'
        and i.tablename='transactions'
        and i.indexname='idx_transactions_search'
        and lower(i.indexdef) like '%using gin (search_vector)%'
    )
    and exists(
      select 1 from pg_trigger t
      where t.tgrelid='financial_app.transactions'::regclass
        and not t.tgisinternal
        and t.tgname='transactions_refresh_search_vector'
    )
    and exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='financial_app' and p.proname='movements_advanced_core'
        and lower(pg_get_functiondef(p.oid)) like '%t.search_vector @@ websearch_to_tsquery(%'
    )
  into v_search_ready;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='financial_app'
      and p.proname='forecast_calendar_document_commitments_core'
      and lower(pg_get_functiondef(p.oid)) like '%forecast_calendar_visible_core(p_start,p_months)%'
      and lower(pg_get_functiondef(p.oid)) like '%document_match_candidates_rows_core(f.document_id,1)%'
      and lower(pg_get_functiondef(p.oid)) like '%forecast_event_overrides%'
  ) into v_forecast_ready;

  if not v_search_ready then
    raise exception 'financial_app_search_vector_contract_missing';
  end if;
  if not v_forecast_ready then
    raise exception 'financial_app_forecast_document_contract_missing';
  end if;

  update public.financial_app_release_manifest
  set search_vector_ready=true,
      forecast_document_candidate_ready=true
  where singleton=true;

  if not found then
    raise exception 'financial_app_release_manifest_missing';
  end if;
end
$contract$;

create or replace function public.financial_app_release_preflight(
  p_expected_version text,
  p_required_functions text[] default array[]::text[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','public'
as $function$
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

  select app_version,target_version,search_vector_ready,forecast_document_candidate_ready
  into v_app_version,v_target_version,v_search_ready,v_forecast_document_ready
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
$function$;

revoke all on function public.financial_app_release_preflight(text,text[]) from public;
grant execute on function public.financial_app_release_preflight(text,text[]) to anon,authenticated,service_role;

do $verify$
begin
  if exists(
    select 1 from financial_app.transactions t
    where t.search_vector is distinct from to_tsvector(
      'simple'::regconfig,
      coalesce(t.source_original_concept,'')||' '||
      coalesce(t.source_normalized_concept,'')||' '||
      coalesce(t.normalized_concept_override,'')||' '||
      coalesce(t.source_counterparty,'')||' '||
      coalesce(t.counterparty_override,'')||' '||
      coalesce(t.notes,'')||' '||
      coalesce(t.source_channel,'')||' '||
      array_to_string(t.tags,' ')
    )
  ) then
    raise exception 'financial_app_search_vector_backfill_mismatch';
  end if;

  if (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='financial_app_release_preflight'
        and pg_get_function_identity_arguments(p.oid)='p_expected_version text, p_required_functions text[]') is distinct from false then
    raise exception 'financial_app_release_preflight_must_be_security_invoker';
  end if;
end
$verify$;

commit;
