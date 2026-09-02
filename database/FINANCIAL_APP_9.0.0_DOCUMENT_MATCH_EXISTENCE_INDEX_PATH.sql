begin;

-- Financial App 9.0.0 — existencia de candidato por rutas indexables.
-- Mantiene exactamente la semántica booleana de document_has_match_candidate_core,
-- pero separa standard/installment y deja que transactions_document_match_idx
-- descarte por fecha+importe antes de comprobar vínculos.

create or replace function financial_app.document_has_match_candidate_core(p_document_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog','financial_app'
as $function$
with doc as (
  select
    d.id,
    d.document_date,
    d.amount as document_amount,
    coalesce(
      case
        when coalesce(d.ocr_data->>'chargeDate','') ~ '^\d{4}-\d{2}-\d{2}$'
          then (d.ocr_data->>'chargeDate')::date
      end,
      d.document_date
    ) as standard_match_date,
    case
      when replace(coalesce(d.ocr_data->>'installmentAmount',''),',','.') ~ '^[0-9]+(?:\.[0-9]+)?$'
        then replace(d.ocr_data->>'installmentAmount',',','.')::numeric
      else null
    end as installment_amount,
    case
      when coalesce(d.ocr_data->>'paymentWindowDays','') ~ '^[0-9]+$'
        then greatest(30,least((d.ocr_data->>'paymentWindowDays')::integer,730))
      else 100
    end as payment_window
  from financial_app.documents d
  where d.id=p_document_id
    and d.archived_at is null
), prepared as (
  select
    doc.*,
    case when installment_amount is not null and installment_amount>0 then 'installment' else 'standard' end as match_mode,
    case when installment_amount is not null and installment_amount>0 then installment_amount else document_amount end as target_amount,
    case when installment_amount is not null and installment_amount>0 then document_date else standard_match_date end as reference_date
  from doc
  where document_date is not null
    and coalesce(installment_amount,document_amount) is not null
    and coalesce(installment_amount,document_amount)<>0
), standard_candidate as (
  select 1
  from prepared p
  join financial_app.transactions t
    on p.match_mode='standard'
   and t.source_missing=false
   and t.is_duplicate=false
   and financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date)
       between p.reference_date-7 and p.reference_date+7
   and abs(t.source_amount) between
       greatest(0::numeric,abs(p.target_amount)-greatest(3::numeric,abs(p.target_amount)*0.15))
       and abs(p.target_amount)+greatest(3::numeric,abs(p.target_amount)*0.15)
  where not exists(
    select 1
    from financial_app.transaction_documents td
    where td.document_id=p.id and td.transaction_id=t.id
  )
    and not exists(
      select 1
      from financial_app.transaction_documents td
      where td.document_id=p.id
    )
  limit 1
), installment_candidate as (
  select 1
  from prepared p
  join financial_app.transactions t
    on p.match_mode='installment'
   and t.source_missing=false
   and t.is_duplicate=false
   and financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date)
       between p.document_date and p.document_date+p.payment_window
   and abs(t.source_amount) between
       greatest(0::numeric,abs(p.target_amount)-greatest(0.50::numeric,abs(p.target_amount)*0.05))
       and abs(p.target_amount)+greatest(0.50::numeric,abs(p.target_amount)*0.05)
  where not exists(
    select 1
    from financial_app.transaction_documents td
    where td.document_id=p.id and td.transaction_id=t.id
  )
  limit 1
)
select exists(
  select 1 from standard_candidate
  union all
  select 1 from installment_candidate
)
$function$;

revoke all on function financial_app.document_has_match_candidate_core(uuid)
  from public,anon,authenticated,service_role;

commit;
