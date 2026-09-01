-- Financial App 9.0.0 — release gate del ciclo documental.
-- El release falla si archivado, estado, triage o limpieza durable dejan de compartir contrato.

begin;

create or replace function public.financial_app_release_preflight(
  p_expected_version text,
  p_required_functions text[] default array[]::text[]
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_app_version text;
  v_target_version text;
  v_required text[];
  v_missing text[];
  v_search_ready boolean:=false;
  v_forecast_document_ready boolean:=false;
  v_archive_review_ready boolean:=false;
  v_archive_detail_ready boolean:=false;
  v_document_lifecycle_ready boolean:=false;
  v_document_storage_ready boolean:=false;
  v_archive_definition text:='';
  v_archive_detail_definition text:='';
  v_archive_payload_definition text:='';
  v_pending_definition text:='';
  v_pending_reasons_definition text:='';
  v_operation_definition text:='';
  v_delete_definition text:='';
  v_duplicate_definition text:='';
  v_triage_definition text:='';
  v_reconcile_definition text:='';
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
  if exists(select 1 from unnest(v_required)value where value !~ '^financial_app_[a-z0-9_]+$') then
    return jsonb_build_object('ok',false,'error','invalid_required_function');
  end if;

  select app_version,target_version,search_vector_ready,forecast_document_candidate_ready
  into v_app_version,v_target_version,v_search_ready,v_forecast_document_ready
  from public.financial_app_release_manifest where singleton=true;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_missing
  from unnest(v_required)value
  where not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=value
  );

  select lower(pg_get_functiondef(p.oid)) into v_archive_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_archive_core'
    and pg_get_function_identity_arguments(p.oid)='p_id uuid';
  select lower(pg_get_functiondef(p.oid)) into v_archive_detail_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_document_core'
    and pg_get_function_identity_arguments(p.oid)='p_id uuid';
  select lower(pg_get_functiondef(p.oid)) into v_archive_payload_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_document_payload_core'
    and pg_get_function_identity_arguments(p.oid)='p_document_id uuid';
  select lower(pg_get_functiondef(p.oid)) into v_pending_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_document_pending_core';
  select lower(pg_get_functiondef(p.oid)) into v_pending_reasons_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_document_pending_reasons_core';
  select lower(pg_get_functiondef(p.oid)) into v_operation_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='document_operation_core';
  select lower(pg_get_functiondef(p.oid)) into v_delete_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_delete_core';
  select lower(pg_get_functiondef(p.oid)) into v_duplicate_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='archive_reuse_duplicate_core';
  select lower(pg_get_functiondef(p.oid)) into v_triage_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='document_triage_core';
  select lower(pg_get_functiondef(p.oid)) into v_reconcile_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='financial_app' and p.proname='document_storage_cleanup_reconcile_core';

  v_archive_review_ready:=coalesce(v_archive_definition,'') like '%archive_document_pending_core%'
    and coalesce(v_archive_definition,'') like '%document requires review before archive%';

  v_archive_detail_ready:=coalesce(v_archive_detail_definition,'') like '%archive_document_payload_core%'
    and coalesce(v_archive_detail_definition,'') like '%ocrdata%'
    and coalesce(v_archive_detail_definition,'') like '%digitalreconstruction%'
    and coalesce(v_archive_detail_definition,'') like '%history%'
    and coalesce(v_archive_payload_definition,'') like '%suggestions%'
    and coalesce(v_archive_payload_definition,'') like '%lifecyclestate%'
    and coalesce(v_archive_payload_definition,'') like '%pendingreasons%';

  v_document_lifecycle_ready:=coalesce(v_pending_definition,'') like '%archive_document_pending_reasons_core%'
    and coalesce(v_pending_reasons_definition,'') like '%document_has_match_candidate_core%'
    and coalesce(v_operation_definition,'') like '%archive_archive_core%'
    and coalesce(v_operation_definition,'') not like '%set archived_at=now()%'
    and coalesce(v_triage_definition,'') like '%needs_review%'
    and coalesce(v_triage_definition,'') like '%processing%'
    and coalesce(v_triage_definition,'') like '%usescanonicallifecyclestate%';

  v_document_storage_ready:=
    exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='financial_app' and c.relname='document_deletion_tombstones'
    )
    and exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='financial_app' and c.relname='document_storage_cleanup_queue'
    )
    and coalesce(v_delete_definition,'') like '%document_deletion_tombstones%'
    and coalesce(v_delete_definition,'') like '%document_storage_cleanup_queue%'
    and coalesce(v_duplicate_definition,'') like '%document_storage_cleanup_queue%'
    and coalesce(v_duplicate_definition,'') like '%duplicate_replaced%'
    and coalesce(v_reconcile_definition,'') like '%storage.objects%'
    and coalesce(v_reconcile_definition,'') like '%orphan_reconciliation%'
    and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='financial_app_document_storage_cleanup_pending')
    and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='financial_app_document_storage_cleanup_reconcile')
    and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='financial_app_document_lifecycle_health');

  return jsonb_build_object(
    'ok',v_app_version=p_expected_version
      and v_target_version=p_expected_version
      and cardinality(v_missing)=0
      and v_search_ready
      and v_forecast_document_ready
      and v_archive_review_ready
      and v_archive_detail_ready
      and v_document_lifecycle_ready
      and v_document_storage_ready,
    'appVersion',v_app_version,
    'targetVersion',v_target_version,
    'expectedVersion',p_expected_version,
    'requiredCount',cardinality(v_required),
    'missing',to_jsonb(v_missing),
    'searchVectorReady',v_search_ready,
    'forecastDocumentCandidateReady',v_forecast_document_ready,
    'archiveReviewGateReady',v_archive_review_ready,
    'archiveDetailParityReady',v_archive_detail_ready,
    'documentLifecycleReady',v_document_lifecycle_ready,
    'documentStorageCleanupReady',v_document_storage_ready
  );
end
$function$;

revoke all on function public.financial_app_release_preflight(text,text[]) from public;
grant execute on function public.financial_app_release_preflight(text,text[]) to anon,authenticated,service_role;

commit;
