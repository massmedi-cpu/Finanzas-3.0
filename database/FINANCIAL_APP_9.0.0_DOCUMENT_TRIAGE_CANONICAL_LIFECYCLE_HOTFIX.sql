begin;

-- Financial App 9.0.0 — reparación del triage documental tras la optimización
-- 20260901. Restaura íntegramente el contrato de ciclo canónico 9.0.0 y conserva
-- únicamente el short-circuit seguro del matching secundario.

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
    select
      d.id,d.file_name,d.document_type,d.storage_provider,d.storage_url,d.document_date,d.amount,d.merchant,
      d.ocr_status,d.created_at,d.updated_at,
      financial_app.archive_document_state_core(
        d.id,d.document_date,d.amount,d.ocr_status,d.archived_at
      ) as lifecycle_state,
      financial_app.archive_document_pending_reasons_core(
        d.id,d.document_date,d.amount,d.ocr_status
      ) as pending_reasons,
      (select count(*)::int from financial_app.transaction_documents td where td.document_id=d.id) as link_count
    from financial_app.documents d
    where d.archived_at is null
  ), candidate_docs as (
    -- Solo los documentos que ya superaron OCR/metadatos y siguen sin vínculo
    -- necesitan la segunda evaluación detallada de candidatos del triage.
    select d.*
    from docs d
    where d.ocr_status not in ('pending','processing','needs_review','failed','error')
      and d.document_date is not null
      and d.amount is not null
      and d.merchant is not null
      and btrim(d.merchant)<>''
      and d.link_count=0
  ), policy as (
    select coalesce((financial_app.document_matching_active_policy_core()->>'minMargin')::numeric,8) as min_margin
  ), top_candidate as (
    select d.id document_id,c.source_id,c.score,c.confidence_tier,c.candidate_count,c.score_margin,c.auto_eligible,c.reasons
    from candidate_docs d
    left join lateral financial_app.document_match_candidates_rows_core(d.id,2)c on c.candidate_rank=1
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
        when d.link_count=0 then 55
        else 30
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
    from docs d
    left join top_candidate tc on tc.document_id=d.id
    cross join policy pol
  ), summary as (
    select
      count(*)::int active,
      count(*) filter(where action='review_ocr')::int review_ocr,
      count(*) filter(where action='complete_metadata')::int complete_metadata,
      count(*) filter(where action='ready_to_link')::int ready_to_link,
      count(*) filter(where action='review_match')::int review_match,
      count(*) filter(where action='investigate_no_match')::int investigate_no_match,
      count(*) filter(where action='archive_candidate')::int archive_candidate
    from evaluated
  ), priority as (
    select *
    from evaluated
    order by priority_score desc,updated_at asc,created_at asc
    limit v_limit
  ), payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'fileName',p.file_name,
      'documentType',coalesce(p.document_type,'document'),
      'storageProvider',p.storage_provider,
      'storageUrl',p.storage_url,
      'documentDate',p.document_date,
      'amount',p.amount,
      'merchant',p.merchant,
      'ocrStatus',p.ocr_status,
      'lifecycleState',p.lifecycle_state,
      'pendingReasons',to_jsonb(p.pending_reasons),
      'linkCount',p.link_count,
      'action',p.action,
      'priorityScore',p.priority_score,
      'reasons',p.triage_reasons,
      'suggestions',case
        when p.action in ('ready_to_link','review_match')
          then financial_app.document_match_candidates_json_core(p.id,3)
        else '[]'::jsonb
      end
    ) order by p.priority_score desc,p.updated_at asc,p.created_at asc),'[]'::jsonb) documents
    from priority p
  )
  select jsonb_build_object(
    'version',financial_app.current_app_version(),
    'generatedAt',now(),
    'summary',jsonb_build_object(
      'active',s.active,
      'reviewOcr',s.review_ocr,
      'completeMetadata',s.complete_metadata,
      'readyToLink',s.ready_to_link,
      'reviewMatch',s.review_match,
      'investigateNoMatch',s.investigate_no_match,
      'archiveCandidate',s.archive_candidate
    ),
    'documents',p.documents,
    'rules',jsonb_build_object(
      'readOnly',true,
      'noAutomaticActions',true,
      'usesCanonicalMatchingPolicy',true,
      'usesCanonicalLifecycleState',true,
      'priorityOrder',jsonb_build_array('review_ocr','complete_metadata','ready_to_link','review_match','investigate_no_match','archive_candidate')
    )
  ) into v_result
  from summary s cross join payload p;

  return v_result;
end
$function$;

revoke all on function financial_app.document_triage_core(integer) from public,anon,authenticated,service_role;

commit;
