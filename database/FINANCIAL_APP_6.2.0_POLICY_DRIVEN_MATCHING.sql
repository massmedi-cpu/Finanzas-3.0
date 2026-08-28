begin;

-- Financial App 6.2.0 — activación del motor gobernado por política supervisada.
-- Con la política inicial 93/8/merchant=true reproduce exactamente el comportamiento 6.1.
-- La migración no crea vínculos ni modifica movimientos/documentos.

create or replace function financial_app.document_match_candidates_rows_core(
  p_document_id uuid,
  p_limit integer default 8
)
returns table(
  transaction_id uuid,
  source_id text,
  match_date date,
  amount numeric,
  concept text,
  counterparty text,
  match_mode text,
  score numeric,
  confidence_tier text,
  amount_diff numeric,
  days_diff integer,
  merchant_match boolean,
  candidate_rank integer,
  candidate_count integer,
  score_margin numeric,
  auto_eligible boolean,
  reasons jsonb
)
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
with policy as (
  select
    coalesce((p.value->>'minScore')::numeric,93) as min_score,
    coalesce((p.value->>'minMargin')::numeric,8) as min_margin,
    coalesce((p.value->>'requireMerchantMatch')::boolean,true) as require_merchant_match
  from (select financial_app.document_matching_active_policy_core() value) p
), doc as (
  select
    d.id,
    d.document_date,
    d.amount as document_amount,
    d.merchant,
    regexp_replace(lower(coalesce(d.merchant,'')),'[^a-z0-9áéíóúüñ]+','','g') as merchant_norm,
    coalesce(
      case when coalesce(d.ocr_data->>'chargeDate','') ~ '^\d{4}-\d{2}-\d{2}$' then (d.ocr_data->>'chargeDate')::date end,
      d.document_date
    ) as standard_match_date,
    case
      when replace(coalesce(d.ocr_data->>'installmentAmount',''),',','.') ~ '^[0-9]+(?:\.[0-9]+)?$'
      then replace(d.ocr_data->>'installmentAmount',',','.')::numeric
      else null
    end as installment_amount,
    case
      when coalesce(d.ocr_data->>'installmentCount','') ~ '^[0-9]+$' then greatest(1,least((d.ocr_data->>'installmentCount')::integer,60))
      else 1
    end as installment_count,
    case
      when coalesce(d.ocr_data->>'paymentWindowDays','') ~ '^[0-9]+$' then greatest(30,least((d.ocr_data->>'paymentWindowDays')::integer,730))
      else 100
    end as payment_window
  from financial_app.documents d
  where d.id=p_document_id and d.archived_at is null
), prepared as (
  select doc.*,
    case when installment_amount is not null and installment_amount>0 then 'installment' else 'standard' end as match_mode,
    case when installment_amount is not null and installment_amount>0 then installment_amount else document_amount end as target_amount,
    case when installment_amount is not null and installment_amount>0 then document_date else standard_match_date end as reference_date
  from doc
  where document_date is not null
    and coalesce(installment_amount,document_amount) is not null
    and coalesce(installment_amount,document_amount)<>0
), tx as (
  select
    t.id,
    t.source_id,
    t.source_amount,
    financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) as match_date,
    coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept) as concept,
    coalesce(t.counterparty_override,t.source_counterparty) as counterparty,
    regexp_replace(
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')),
      '[^a-z0-9áéíóúüñ]+','','g'
    ) as match_text
  from financial_app.transactions t
  where t.source_missing=false and t.is_duplicate=false
), base as (
  select
    tx.id as transaction_id,
    tx.source_id,
    tx.match_date,
    tx.source_amount as amount,
    tx.concept,
    tx.counterparty,
    p.match_mode,
    abs(abs(tx.source_amount)-abs(p.target_amount))::numeric as amount_diff,
    abs(tx.match_date-p.reference_date)::integer as days_diff,
    (length(p.merchant_norm)>=3 and tx.match_text like '%'||p.merchant_norm||'%') as merchant_match,
    case
      when p.match_mode='installment' then case
        when abs(abs(tx.source_amount)-abs(p.target_amount))<=0.02 then 60
        when abs(abs(tx.source_amount)-abs(p.target_amount))<=0.50 then 48
        when abs(abs(tx.source_amount)-abs(p.target_amount))<=greatest(1,abs(p.target_amount)*0.05) then 38
        else 20 end
      else case
        when abs(abs(tx.source_amount)-abs(p.target_amount))<=0.01 then 55
        when abs(abs(tx.source_amount)-abs(p.target_amount))<=0.50 then 45
        when abs(abs(tx.source_amount)-abs(p.target_amount))<=greatest(1,abs(p.target_amount)*0.05) then 35
        else 20 end
    end as amount_score,
    case
      when p.match_mode='installment' then 20
      when abs(tx.match_date-p.reference_date)=0 then 25
      when abs(tx.match_date-p.reference_date)=1 then 22
      when abs(tx.match_date-p.reference_date)<=3 then 18
      else 10
    end as date_score,
    case when length(p.merchant_norm)>=3 and tx.match_text like '%'||p.merchant_norm||'%' then 20 else 0 end as merchant_score
  from prepared p
  join tx on (
    (p.match_mode='standard'
      and tx.match_date between p.reference_date-7 and p.reference_date+7
      and abs(abs(tx.source_amount)-abs(p.target_amount))<=greatest(3,abs(p.target_amount)*0.15))
    or
    (p.match_mode='installment'
      and tx.match_date between p.document_date and p.document_date+p.payment_window
      and abs(abs(tx.source_amount)-abs(p.target_amount))<=greatest(0.50,abs(p.target_amount)*0.05))
  )
  where not exists(select 1 from financial_app.transaction_documents td where td.document_id=p.id and td.transaction_id=tx.id)
    and (p.match_mode='installment' or not exists(select 1 from financial_app.transaction_documents td where td.document_id=p.id))
), scored as (
  select base.*,(amount_score+date_score+merchant_score)::numeric as score from base
), ranked as (
  select scored.*,
    row_number() over(order by score desc,amount_diff,days_diff,source_id) as candidate_rank_raw,
    count(*) over() as candidate_count_raw,
    lead(score) over(order by score desc,amount_diff,days_diff,source_id) as second_score
  from scored
), evaluated as (
  select ranked.*,
    case
      when candidate_rank_raw=1 and second_score is null then 100::numeric
      when candidate_rank_raw=1 then score-second_score
      else null
    end as score_margin,
    case
      when match_mode='standard'
        and candidate_rank_raw=1
        and score>=policy.min_score
        and amount_diff<=0.01
        and days_diff<=3
        and (not policy.require_merchant_match or merchant_match)
        and (candidate_count_raw=1 or second_score is null or score-second_score>=policy.min_margin)
      then true else false
    end as auto_eligible
  from ranked cross join policy
), final as (
  select evaluated.*,
    case
      when match_mode='standard' and score>=100 and amount_diff<=0.01 and days_diff=0 and merchant_match then 'exact'
      when auto_eligible then 'high'
      when match_mode='installment' and amount_diff<=0.02 and merchant_match then 'high'
      when score>=75 then 'medium'
      else 'low'
    end as confidence_tier,
    to_jsonb(array_remove(array[
      case
        when match_mode='installment' and amount_diff<=0.02 then 'Cuota con importe exacto'
        when match_mode='standard' and amount_diff<=0.01 then 'Importe exacto'
        when amount_diff<=0.50 then 'Importe muy próximo'
        else 'Importe dentro de tolerancia'
      end,
      case
        when match_mode='installment' then 'Dentro de la ventana prevista de cuotas'
        when days_diff=0 then 'Fecha exacta'
        when days_diff=1 then '1 día de diferencia'
        else days_diff::text||' días de diferencia'
      end,
      case when merchant_match then 'Comercio coincide' else 'Comercio no confirmado' end,
      case
        when candidate_rank_raw=1 and candidate_count_raw>1 and score_margin>=8 then 'Mejor candidato claramente separado'
        when candidate_rank_raw=1 and candidate_count_raw>1 and score_margin<8 then 'Existe otro candidato muy próximo'
        else null
      end
    ]::text[],null)) as reasons
  from evaluated
)
select
  transaction_id,source_id,match_date,amount,concept,counterparty,match_mode,round(score,1),confidence_tier,
  round(amount_diff,2),days_diff,merchant_match,candidate_rank_raw::integer,candidate_count_raw::integer,
  case when score_margin is null then null else round(score_margin,1) end,auto_eligible,reasons
from final
order by candidate_rank_raw
limit greatest(1,least(coalesce(p_limit,8),20))
$function$;

revoke all on function financial_app.document_match_candidates_rows_core(uuid,integer) from public,anon,authenticated;
grant execute on function financial_app.document_match_candidates_rows_core(uuid,integer) to service_role;

commit;
