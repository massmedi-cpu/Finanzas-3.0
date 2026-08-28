begin;

-- Financial App 6.4.0 — operaciones documentales supervisadas.
-- 6.3 sigue siendo la fuente canónica de prioridad. 6.4 añade ejecución explícita,
-- revalidación server-side y lote únicamente para acciones que siguen siendo seguras.

create or replace function financial_app.document_operations_core(p_limit integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_triage jsonb;
  v_documents jsonb;
  v_safe integer:=0;
  v_link integer:=0;
  v_archive integer:=0;
  v_manual integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_triage:=financial_app.document_triage_core(greatest(1,least(coalesce(p_limit,60),100)));

  select coalesce(jsonb_agg(
    d.document || jsonb_build_object(
      'safeOperation',
      case
        when d.document->>'action'='ready_to_link'
          and coalesce(((d.document->'suggestions'->0)->>'autoEligible')::boolean,false)
          and nullif((d.document->'suggestions'->0)->>'sourceId','') is not null
        then jsonb_build_object(
          'action','link',
          'sourceId',(d.document->'suggestions'->0)->>'sourceId',
          'label','Asociar con el candidato seguro',
          'reversible',true
        )
        when d.document->>'action'='archive_candidate'
          and coalesce((d.document->>'linkCount')::integer,0)>0
        then jsonb_build_object(
          'action','archive',
          'label','Archivar documento resuelto',
          'reversible',true
        )
        else null
      end
    ) order by d.ordinality
  ),'[]'::jsonb)
  into v_documents
  from jsonb_array_elements(coalesce(v_triage->'documents','[]'::jsonb)) with ordinality as d(document,ordinality);

  select
    count(*) filter(where x.document->'safeOperation' is not null and x.document->'safeOperation'<>'null'::jsonb),
    count(*) filter(where x.document->'safeOperation'->>'action'='link'),
    count(*) filter(where x.document->'safeOperation'->>'action'='archive'),
    count(*) filter(where x.document->'safeOperation' is null or x.document->'safeOperation'='null'::jsonb)
  into v_safe,v_link,v_archive,v_manual
  from jsonb_array_elements(v_documents) as x(document);

  return (v_triage - 'documents' - 'rules') || jsonb_build_object(
    'documents',v_documents,
    'operationSummary',jsonb_build_object(
      'safe',coalesce(v_safe,0),
      'link',coalesce(v_link,0),
      'archive',coalesce(v_archive,0),
      'manual',coalesce(v_manual,0)
    ),
    'rules',coalesce(v_triage->'rules','{}'::jsonb) || jsonb_build_object(
      'readOnly',false,
      'operationsEnabled',true,
      'explicitApprovalRequired',true,
      'serverRevalidationRequired',true,
      'ambiguousBatchActions',false,
      'maxBatchSize',50,
      'reversibleSafeActions',true
    )
  );
end
$function$;

create or replace function financial_app.document_operation_core(
  p_document_id uuid,
  p_action text,
  p_source_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_archived_at timestamptz;
  v_link_count integer:=0;
  v_top_source_id text;
  v_top_auto_eligible boolean:=false;
  v_linked boolean:=false;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_action:=lower(trim(coalesce(p_action,'')));
  if v_action not in ('link','archive') then
    raise exception 'unsupported_document_operation' using errcode='22023';
  end if;

  select to_jsonb(d),d.archived_at
  into v_before,v_archived_at
  from financial_app.documents d
  where d.id=p_document_id
  for update;

  if v_before is null then raise exception 'document_not_found' using errcode='P0002'; end if;
  if v_archived_at is not null then raise exception 'document_already_archived' using errcode='P0001'; end if;

  select count(*)::integer into v_link_count
  from financial_app.transaction_documents td
  where td.document_id=p_document_id;

  if v_action='link' then
    if v_link_count>0 then raise exception 'document_already_linked' using errcode='P0001'; end if;
    if nullif(trim(coalesce(p_source_id,'')),'') is null then
      raise exception 'source_id_required' using errcode='22023';
    end if;

    select c.source_id,c.auto_eligible
    into v_top_source_id,v_top_auto_eligible
    from financial_app.document_match_candidates_rows_core(p_document_id,2) c
    where c.candidate_rank=1
    limit 1;

    if v_top_source_id is null
      or v_top_source_id<>p_source_id
      or not coalesce(v_top_auto_eligible,false) then
      raise exception 'safe_match_no_longer_valid' using errcode='P0001';
    end if;

    v_linked:=financial_app.archive_link_calibrated_core(p_document_id,p_source_id);
    if not coalesce(v_linked,false) then raise exception 'document_link_failed' using errcode='P0001'; end if;

    return jsonb_build_object(
      'ok',true,
      'documentId',p_document_id,
      'action','link',
      'sourceId',p_source_id,
      'revalidated',true,
      'undo',jsonb_build_object('action','unlink','sourceId',p_source_id)
    );
  end if;

  if v_link_count<=0 then raise exception 'archive_requires_linked_document' using errcode='P0001'; end if;

  update financial_app.documents
  set archived_at=now(),updated_at=now()
  where id=p_document_id;

  select to_jsonb(d) into v_after
  from financial_app.documents d
  where d.id=p_document_id;

  insert into financial_app.document_history(document_id,action,before_value,after_value,changed_by)
  values(p_document_id,'archive',v_before,v_after,v_email);

  return jsonb_build_object(
    'ok',true,
    'documentId',p_document_id,
    'action','archive',
    'revalidated',true,
    'undo',jsonb_build_object('action','restore')
  );
end
$function$;

create or replace function financial_app.document_operations_batch_core(p_operations jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_count integer;
  v_item jsonb;
  v_document_id uuid;
  v_action text;
  v_source_id text;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_applied integer:=0;
  v_rejected integer:=0;
  v_error text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_operations)<>'array' then raise exception 'operations_must_be_array' using errcode='22023'; end if;

  v_count:=jsonb_array_length(p_operations);
  if v_count<1 or v_count>50 then raise exception 'operations_batch_size_invalid' using errcode='22023'; end if;

  for v_item in select value from jsonb_array_elements(p_operations)
  loop
    begin
      v_document_id:=nullif(v_item->>'documentId','')::uuid;
      v_action:=lower(trim(coalesce(v_item->>'action','')));
      v_source_id:=nullif(trim(coalesce(v_item->>'sourceId','')),'');
      if v_document_id is null then raise exception 'document_id_required' using errcode='22023'; end if;

      v_result:=financial_app.document_operation_core(v_document_id,v_action,v_source_id);
      v_results:=v_results||jsonb_build_array(v_result);
      v_applied:=v_applied+1;
    exception when others then
      get stacked diagnostics v_error=message_text;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'ok',false,
        'documentId',v_item->>'documentId',
        'action',v_item->>'action',
        'error',v_error
      ));
      v_rejected:=v_rejected+1;
    end;
  end loop;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'applied',v_applied,
    'rejected',v_rejected,
    'results',v_results,
    'rules',jsonb_build_object(
      'explicitApprovalRequired',true,
      'serverRevalidated',true,
      'ambiguousActionsExecuted',false,
      'maxBatchSize',50
    )
  );
end
$function$;

create or replace function public.financial_app_document_operations(p_limit integer default 60)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select financial_app.document_operations_core(p_limit)
$function$;

create or replace function public.financial_app_document_operation(
  p_document_id uuid,
  p_action text,
  p_source_id text default null
)
returns jsonb
language sql
volatile
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select financial_app.document_operation_core(p_document_id,p_action,p_source_id)
$function$;

create or replace function public.financial_app_document_operations_batch(p_operations jsonb)
returns jsonb
language sql
volatile
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select financial_app.document_operations_batch_core(p_operations)
$function$;

revoke all on function financial_app.document_operations_core(integer) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_operation_core(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_operations_batch_core(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.financial_app_document_operations(integer) from public,anon;
revoke all on function public.financial_app_document_operation(uuid,text,text) from public,anon;
revoke all on function public.financial_app_document_operations_batch(jsonb) from public,anon;
grant execute on function public.financial_app_document_operations(integer) to authenticated;
grant execute on function public.financial_app_document_operation(uuid,text,text) to authenticated;
grant execute on function public.financial_app_document_operations_batch(jsonb) to authenticated;

commit;
