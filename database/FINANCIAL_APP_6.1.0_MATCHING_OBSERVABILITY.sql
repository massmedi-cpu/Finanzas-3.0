begin;

-- Financial App 6.1.0 — observabilidad server-side del matching documental.
-- Solo lectura: no crea vínculos ni modifica documentos o movimientos.

create or replace function financial_app.document_matching_observability_core(
  p_limit integer default 8
)
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
  v_limit:=greatest(1,least(coalesce(p_limit,8),20));

  with docs as (
    select d.id,d.file_name,d.document_type,d.storage_provider,d.storage_url,d.document_date,d.amount,d.merchant,d.created_at
    from financial_app.documents d
    where d.archived_at is null
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), top_candidate as (
    select d.id document_id,c.source_id,c.match_date,c.amount candidate_amount,c.concept,c.counterparty,
      c.score,c.confidence_tier,c.match_mode,c.amount_diff,c.days_diff,c.merchant_match,
      c.candidate_rank,c.candidate_count,c.score_margin,c.auto_eligible,c.reasons
    from docs d
    left join lateral financial_app.document_match_candidates_rows_core(d.id,2) c on c.candidate_rank=1
  ), summary as (
    select
      count(*)::int active_unlinked,
      count(*) filter(where tc.source_id is not null)::int with_candidates,
      count(*) filter(where tc.auto_eligible)::int safe_auto,
      count(*) filter(where tc.source_id is not null and tc.candidate_count>1 and coalesce(tc.score_margin,0)<8)::int ambiguous,
      count(*) filter(where tc.confidence_tier in('exact','high'))::int high_confidence,
      count(*) filter(where tc.confidence_tier='medium')::int medium_confidence,
      count(*) filter(where tc.confidence_tier='low')::int low_confidence,
      count(*) filter(where tc.source_id is null)::int no_candidates
    from docs d
    left join top_candidate tc on tc.document_id=d.id
  ), priority as (
    select d.*,tc.*,
      case
        when tc.auto_eligible then 4
        when tc.source_id is not null and tc.candidate_count>1 and coalesce(tc.score_margin,0)<8 then 3
        when tc.confidence_tier in('exact','high') then 2
        when tc.source_id is not null then 1
        else 0
      end priority_rank
    from docs d
    left join top_candidate tc on tc.document_id=d.id
    where tc.source_id is not null
    order by priority_rank desc,coalesce(tc.score,0) desc,d.document_date desc nulls last,d.created_at desc
    limit v_limit
  ), payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'fileName',p.file_name,
      'documentType',p.document_type,
      'storageProvider',p.storage_provider,
      'storageUrl',p.storage_url,
      'documentDate',p.document_date,
      'amount',p.amount,
      'merchant',p.merchant,
      'priority',case when p.auto_eligible then 'auto_safe' when p.candidate_count>1 and coalesce(p.score_margin,0)<8 then 'ambiguous' when p.confidence_tier in('exact','high') then 'high' else 'review' end,
      'suggestions',financial_app.document_match_candidates_json_core(p.id,3)
    ) order by p.priority_rank desc,coalesce(p.score,0) desc,p.document_date desc nulls last,p.created_at desc),'[]'::jsonb) documents
    from priority p
  )
  select jsonb_build_object(
    'version',financial_app.current_app_version(),
    'generatedAt',now(),
    'summary',jsonb_build_object(
      'activeUnlinked',s.active_unlinked,
      'withCandidates',s.with_candidates,
      'safeAuto',s.safe_auto,
      'ambiguous',s.ambiguous,
      'highConfidence',s.high_confidence,
      'mediumConfidence',s.medium_confidence,
      'lowConfidence',s.low_confidence,
      'noCandidates',s.no_candidates
    ),
    'documents',p.documents,
    'rules',jsonb_build_object(
      'safeAutoMinimumScore',93,
      'safeAutoMinimumMargin',8,
      'requiresMerchantMatch',true,
      'readOnlyObservability',true
    )
  ) into v_result
  from summary s cross join payload p;

  return v_result;
end
$function$;

create or replace function public.financial_app_document_matching_observability(
  p_limit integer default 8
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select financial_app.document_matching_observability_core(p_limit)
$function$;

revoke all on function financial_app.document_matching_observability_core(integer) from public,anon,authenticated;
revoke all on function public.financial_app_document_matching_observability(integer) from public,anon;
grant execute on function public.financial_app_document_matching_observability(integer) to authenticated;

commit;
