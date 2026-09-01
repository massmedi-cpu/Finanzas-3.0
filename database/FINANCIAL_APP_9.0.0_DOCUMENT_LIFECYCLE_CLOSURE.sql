-- Financial App 9.0.0 — cierre canónico del ciclo documental.
-- Fuente reproducible para estado, revisión, triage y archivado supervisado.

begin;

create or replace function financial_app.archive_document_pending_reasons_core(
  p_document_id uuid,
  p_document_date date,
  p_amount numeric,
  p_ocr_status text
)
returns text[]
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select array_remove(array[
    case lower(coalesce(p_ocr_status,''))
      when 'pending' then 'ocr_pending'
      when 'processing' then 'ocr_processing'
      when 'needs_review' then 'ocr_needs_review'
      when 'failed' then 'ocr_failed'
      when 'error' then 'ocr_error'
      else null
    end,
    case when financial_app.document_has_match_candidate_core(p_document_id)
      then 'movement_match_pending' else null end
  ]::text[],null)
$function$;

create or replace function financial_app.archive_document_pending_core(
  p_document_id uuid,
  p_document_date date,
  p_amount numeric,
  p_ocr_status text
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select cardinality(financial_app.archive_document_pending_reasons_core(
    p_document_id,p_document_date,p_amount,p_ocr_status
  ))>0
$function$;

create or replace function financial_app.archive_document_state_core(
  p_document_id uuid,
  p_document_date date,
  p_amount numeric,
  p_ocr_status text,
  p_archived_at timestamptz
)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select case
    when p_archived_at is not null then 'archived'
    when financial_app.archive_document_pending_core(
      p_document_id,p_document_date,p_amount,p_ocr_status
    ) then 'pending'
    else 'new'
  end
$function$;

create or replace function financial_app.archive_document_payload_core(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select jsonb_build_object(
    'id',d.id,
    'fileName',d.file_name,
    'mimeType',d.mime_type,
    'storagePath',d.storage_path,
    'fileSize',d.file_size,
    'contentHash',d.content_hash,
    'documentType',d.document_type,
    'documentDate',d.document_date,
    'amount',d.amount,
    'merchant',d.merchant,
    'ocrStatus',d.ocr_status,
    'lifecycleState',financial_app.archive_document_state_core(
      d.id,d.document_date,d.amount,d.ocr_status,d.archived_at
    ),
    'pendingReasons',to_jsonb(financial_app.archive_document_pending_reasons_core(
      d.id,d.document_date,d.amount,d.ocr_status
    )),
    'hasOcrText',d.ocr_text is not null,
    'hasReconstruction',d.digital_reconstruction is not null,
    'notes',d.notes,
    'archivedAt',d.archived_at,
    'createdAt',d.created_at,
    'updatedAt',d.updated_at,
    'links',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceId',t.source_id,
          'date',coalesce(t.effective_date,t.source_date),
          'amount',t.source_amount,
          'concept',coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept),
          'counterparty',coalesce(t.counterparty_override,t.source_counterparty),
          'associationOrigin',td.association_origin,
          'confidence',td.confidence
        ) order by coalesce(t.effective_date,t.source_date) desc
      )
      from financial_app.transaction_documents td
      join financial_app.transactions t on t.id=td.transaction_id
      where td.document_id=d.id
    ),'[]'::jsonb),
    'suggestions',financial_app.document_match_candidates_json_core(d.id,5)
  )
  from financial_app.documents d
  where d.id=p_document_id
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

  select to_jsonb(d),d.archived_at into v_before,v_archived_at
  from financial_app.documents d where d.id=p_document_id for update;
  if v_before is null then raise exception 'document_not_found' using errcode='P0002'; end if;
  if v_archived_at is not null then raise exception 'document_already_archived' using errcode='P0001'; end if;

  select count(*)::integer into v_link_count
  from financial_app.transaction_documents td where td.document_id=p_document_id;

  if v_action='link' then
    if v_link_count>0 then raise exception 'document_already_linked' using errcode='P0001'; end if;
    if nullif(trim(coalesce(p_source_id,'')),'') is null then raise exception 'source_id_required' using errcode='22023'; end if;
    select c.source_id,c.auto_eligible into v_top_source_id,v_top_auto_eligible
    from financial_app.document_match_candidates_rows_core(p_document_id,2)c
    where c.candidate_rank=1 limit 1;
    if v_top_source_id is null or v_top_source_id<>p_source_id or not coalesce(v_top_auto_eligible,false) then
      raise exception 'safe_match_no_longer_valid' using errcode='P0001';
    end if;
    v_linked:=financial_app.archive_link_calibrated_core(p_document_id,p_source_id);
    if not coalesce(v_linked,false) then raise exception 'document_link_failed' using errcode='P0001'; end if;
    return jsonb_build_object(
      'ok',true,'documentId',p_document_id,'action','link','sourceId',p_source_id,
      'revalidated',true,'undo',jsonb_build_object('action','unlink','sourceId',p_source_id)
    );
  end if;

  if v_link_count<=0 then raise exception 'archive_requires_linked_document' using errcode='P0001'; end if;
  perform financial_app.archive_archive_core(p_document_id);
  return jsonb_build_object(
    'ok',true,'documentId',p_document_id,'action','archive','revalidated',true,
    'canonicalArchiveGate',true,'undo',jsonb_build_object('action','restore')
  );
end
$function$;

create or replace function financial_app.document_triage_core(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_limit integer;
  v_result jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_limit:=greatest(1,least(coalesce(p_limit,30),100));

  with docs as (
    select d.id,d.file_name,d.document_type,d.storage_provider,d.storage_url,d.document_date,d.amount,d.merchant,
      d.ocr_status,d.created_at,d.updated_at,
      financial_app.archive_document_state_core(d.id,d.document_date,d.amount,d.ocr_status,d.archived_at) as lifecycle_state,
      financial_app.archive_document_pending_reasons_core(d.id,d.document_date,d.amount,d.ocr_status) as pending_reasons,
      (select count(*)::int from financial_app.transaction_documents td where td.document_id=d.id) as link_count
    from financial_app.documents d where d.archived_at is null
  ), policy as (
    select coalesce((financial_app.document_matching_active_policy_core()->>'minMargin')::numeric,8) as min_margin
  ), top_candidate as (
    select d.id document_id,c.source_id,c.score,c.confidence_tier,c.candidate_count,c.score_margin,c.auto_eligible,c.reasons
    from docs d left join lateral financial_app.document_match_candidates_rows_core(d.id,2)c on c.candidate_rank=1
  ), evaluated as (
    select d.*,tc.source_id,tc.score,tc.confidence_tier,tc.candidate_count,tc.score_margin,tc.auto_eligible,tc.reasons,
      case
        when d.ocr_status in ('pending','processing','needs_review','failed','error') then 'review_ocr'
        when d.document_date is null or d.amount is null or d.merchant is null or btrim(d.merchant)='' then 'complete_metadata'
        when d.link_count>0 and d.lifecycle_state<>'pending' then 'archive_candidate'
        when coalesce(tc.auto_eligible,false) then 'ready_to_link'
        when tc.source_id is not null then 'review_match'
        else 'investigate_no_match'
      end as action,
      case
        when d.ocr_status in ('pending','processing','needs_review','failed','error') then 100
        when d.document_date is null or d.amount is null or d.merchant is null or btrim(d.merchant)='' then 90
        when coalesce(tc.auto_eligible,false) then 80
        when tc.source_id is not null and coalesce(tc.candidate_count,0)>1 and coalesce(tc.score_margin,0)<pol.min_margin then 75
        when tc.source_id is not null then 65
        when d.link_count=0 then 55 else 30
      end as priority_score,
      to_jsonb(array_remove(array[
        case when d.ocr_status in ('pending','processing','needs_review','failed','error') then 'El OCR todavía no está resuelto y necesita revisión' end,
        case when d.document_date is null then 'Falta la fecha del documento' end,
        case when d.amount is null then 'Falta el importe del documento' end,
        case when d.merchant is null or btrim(d.merchant)='' then 'Falta identificar el comercio o emisor' end,
        case when d.link_count>0 and d.lifecycle_state<>'pending' then 'El documento ya tiene un movimiento asociado y está resuelto' end,
        case when coalesce(tc.auto_eligible,false) then 'Existe un candidato que cumple la política supervisada activa' end,
        case when tc.source_id is not null and coalesce(tc.candidate_count,0)>1 and coalesce(tc.score_margin,0)<pol.min_margin then 'Hay candidatos demasiado próximos y requiere decisión manual' end,
        case when tc.source_id is not null and not coalesce(tc.auto_eligible,false) then 'Existe una coincidencia posible, pero no es segura para autoenlace' end,
        case when tc.source_id is null and d.link_count=0 and d.ocr_status not in ('pending','processing','needs_review','failed','error') and d.document_date is not null and d.amount is not null then 'No se ha encontrado un movimiento candidato con la evidencia actual' end
      ]::text[],null)) as triage_reasons
    from docs d left join top_candidate tc on tc.document_id=d.id cross join policy pol
  ), summary as (
    select count(*)::int active,
      count(*) filter(where action='review_ocr')::int review_ocr,
      count(*) filter(where action='complete_metadata')::int complete_metadata,
      count(*) filter(where action='ready_to_link')::int ready_to_link,
      count(*) filter(where action='review_match')::int review_match,
      count(*) filter(where action='investigate_no_match')::int investigate_no_match,
      count(*) filter(where action='archive_candidate')::int archive_candidate
    from evaluated
  ), priority as (
    select * from evaluated order by priority_score desc,updated_at asc,created_at asc limit v_limit
  ), payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'fileName',p.file_name,'documentType',coalesce(p.document_type,'document'),
      'storageProvider',p.storage_provider,'storageUrl',p.storage_url,'documentDate',p.document_date,
      'amount',p.amount,'merchant',p.merchant,'ocrStatus',p.ocr_status,
      'lifecycleState',p.lifecycle_state,'pendingReasons',to_jsonb(p.pending_reasons),
      'linkCount',p.link_count,'action',p.action,'priorityScore',p.priority_score,
      'reasons',p.triage_reasons,'suggestions',financial_app.document_match_candidates_json_core(p.id,3)
    ) order by p.priority_score desc,p.updated_at asc,p.created_at asc),'[]'::jsonb) documents
    from priority p
  )
  select jsonb_build_object(
    'version',financial_app.current_app_version(),'generatedAt',now(),
    'summary',jsonb_build_object(
      'active',s.active,'reviewOcr',s.review_ocr,'completeMetadata',s.complete_metadata,
      'readyToLink',s.ready_to_link,'reviewMatch',s.review_match,
      'investigateNoMatch',s.investigate_no_match,'archiveCandidate',s.archive_candidate
    ),
    'documents',p.documents,
    'rules',jsonb_build_object(
      'readOnly',true,'noAutomaticActions',true,'usesCanonicalMatchingPolicy',true,
      'usesCanonicalLifecycleState',true,
      'priorityOrder',jsonb_build_array('review_ocr','complete_metadata','ready_to_link','review_match','investigate_no_match','archive_candidate')
    )
  ) into v_result from summary s cross join payload p;

  return v_result;
end
$function$;

revoke all on function financial_app.archive_document_pending_reasons_core(uuid,date,numeric,text) from public,anon,authenticated,service_role;
revoke all on function financial_app.archive_document_pending_core(uuid,date,numeric,text) from public,anon,authenticated,service_role;
revoke all on function financial_app.archive_document_state_core(uuid,date,numeric,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function financial_app.archive_document_payload_core(uuid) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_operation_core(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_triage_core(integer) from public,anon,authenticated,service_role;

commit;
