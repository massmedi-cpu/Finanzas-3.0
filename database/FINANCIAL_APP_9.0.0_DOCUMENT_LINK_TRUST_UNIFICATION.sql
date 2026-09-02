begin;

create or replace function financial_app.transaction_document_matches_core(p_transaction_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_source_id text;
  v_date date;
  v_amount numeric;
  v_linked jsonb:='[]'::jsonb;
  v_suggestions jsonb:='[]'::jsonb;
  v_status text:='none';
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select
    t.source_id,
    financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date),
    abs(t.source_amount)
  into v_source_id,v_date,v_amount
  from financial_app.transactions t
  where t.id=p_transaction_id;

  if v_source_id is null or v_date is null then raise exception 'transaction not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'fileName',d.file_name,
    'documentType',d.document_type,
    'documentDate',d.document_date,
    'amount',d.amount,
    'merchant',d.merchant,
    'ocrStatus',d.ocr_status,
    'pendingReasons',to_jsonb(financial_app.archive_document_pending_reasons_core(d.id,d.document_date,d.amount,d.ocr_status)),
    'lifecycleState',financial_app.archive_document_state_core(d.id,d.document_date,d.amount,d.ocr_status,d.archived_at),
    'storageProvider',d.storage_provider,
    'storageUrl',d.storage_url,
    'associationOrigin',td.association_origin,
    'confidence',td.confidence
  ) order by coalesce(d.document_date,d.created_at::date) desc),'[]'::jsonb)
  into v_linked
  from financial_app.transaction_documents td
  join financial_app.documents d on d.id=td.document_id
  where td.transaction_id=p_transaction_id
    and d.archived_at is null;

  with candidate_docs as materialized (
    select d.id,d.document_date,d.amount,d.merchant,d.ocr_status,d.storage_provider,d.storage_url,d.file_name,d.document_type,d.created_at
    from financial_app.documents d
    where d.archived_at is null
      and lower(coalesce(d.ocr_status,'')) not in ('pending','processing','needs_review','failed','error')
      and d.document_date is not null
      and coalesce(
        case when replace(coalesce(d.ocr_data->>'installmentAmount',''),',','.') ~ '^[0-9]+(?:\\.[0-9]+)?$'
          then replace(d.ocr_data->>'installmentAmount',',','.')::numeric end,
        d.amount
      ) is not null
      and (
        (
          not (d.ocr_data?'installmentAmount')
          and v_date between coalesce(
            case when coalesce(d.ocr_data->>'chargeDate','') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (d.ocr_data->>'chargeDate')::date end,
            d.document_date
          )-7 and coalesce(
            case when coalesce(d.ocr_data->>'chargeDate','') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (d.ocr_data->>'chargeDate')::date end,
            d.document_date
          )+7
          and abs(abs(d.amount)-v_amount)<=greatest(3::numeric,abs(d.amount)*0.15)
        )
        or (
          d.ocr_data?'installmentAmount'
          and replace(coalesce(d.ocr_data->>'installmentAmount',''),',','.') ~ '^[0-9]+(?:\\.[0-9]+)?$'
          and v_date between d.document_date and d.document_date+
            case when coalesce(d.ocr_data->>'paymentWindowDays','') ~ '^[0-9]+$'
              then greatest(30,least((d.ocr_data->>'paymentWindowDays')::integer,730)) else 100 end
          and abs(abs(replace(d.ocr_data->>'installmentAmount',',','.')::numeric)-v_amount)<=
            greatest(0.50::numeric,abs(replace(d.ocr_data->>'installmentAmount',',','.')::numeric)*0.05)
        )
      )
    order by abs(d.document_date-v_date),coalesce(abs(abs(d.amount)-v_amount),999999),d.created_at desc
    limit 40
  ), canonical as (
    select d.*,c.score,c.confidence_tier,c.match_mode,c.amount_diff,c.days_diff,c.merchant_match,
      c.candidate_rank,c.candidate_count,c.score_margin,c.auto_eligible,c.reasons
    from candidate_docs d
    cross join lateral financial_app.document_match_candidates_rows_core(d.id,8) c
    where c.transaction_id=p_transaction_id
      and c.score>=50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'fileName',c.file_name,
    'documentType',c.document_type,
    'documentDate',c.document_date,
    'amount',c.amount,
    'merchant',c.merchant,
    'ocrStatus',c.ocr_status,
    'pendingReasons','[]'::jsonb,
    'storageProvider',c.storage_provider,
    'storageUrl',c.storage_url,
    'score',round(c.score,1),
    'confidenceTier',c.confidence_tier,
    'matchMode',c.match_mode,
    'daysDiff',c.days_diff,
    'amountDiff',round(c.amount_diff,2),
    'merchantMatch',c.merchant_match,
    'candidateRank',c.candidate_rank,
    'candidateCount',c.candidate_count,
    'scoreMargin',c.score_margin,
    'autoEligible',c.auto_eligible,
    'reasons',c.reasons,
    'installmentMatch',c.match_mode='installment'
  ) order by c.score desc,c.amount_diff,c.days_diff,c.id),'[]'::jsonb)
  into v_suggestions
  from canonical c;

  if jsonb_array_length(v_linked)>0 then v_status:='linked';
  elsif jsonb_array_length(v_suggestions)>0 then v_status:='possible';
  else v_status:='none'; end if;

  return jsonb_build_object(
    'status',v_status,
    'linked',v_linked,
    'suggestions',v_suggestions,
    'matchingEngine','canonical_supervised',
    'ocrReadinessRequiredForSuggestions',true
  );
end
$function$;

create or replace function financial_app.archive_restore_and_link_calibrated_core(p_document_id uuid,p_source_id text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from financial_app.documents where id=p_document_id and archived_at is not null) then
    raise exception 'archived document not found';
  end if;
  perform financial_app.archive_restore_core(p_document_id);
  return financial_app.archive_link_calibrated_core(p_document_id,p_source_id);
end
$function$;

create or replace function public.financial_app_archive_restore_and_link_calibrated(p_document_id uuid,p_source_id text)
returns boolean
language sql
set search_path to 'pg_catalog','financial_app','auth','public'
as $function$
  select financial_app.require_authorized_access();
  select financial_app.archive_restore_and_link_calibrated_core(p_document_id,p_source_id);
$function$;

revoke all on function public.financial_app_archive_restore_and_link_calibrated(uuid,text) from public,anon;
grant execute on function public.financial_app_archive_restore_and_link_calibrated(uuid,text) to authenticated,service_role;
revoke all on function financial_app.archive_restore_and_link_calibrated_core(uuid,text) from public,anon;
grant execute on function financial_app.archive_restore_and_link_calibrated_core(uuid,text) to authenticated,service_role;

commit;
