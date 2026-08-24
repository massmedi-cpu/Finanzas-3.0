-- Financial App 3.3.1
-- Vinculación documental: prioriza la fecha real de compra contenida en el concepto bancario.
-- Mantiene el original de Google Drive intacto y evita vínculos automáticos ambiguos.

create or replace function financial_app.transaction_match_date(
  p_source_original_concept text,
  p_effective_date date,
  p_source_date date
)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_date_text text;
  v_date date;
begin
  v_date_text := substring(coalesce(p_source_original_concept,'') from '([12][0-9]{3}-[0-9]{2}-[0-9]{2})');
  if v_date_text is not null then
    begin
      v_date := v_date_text::date;
      return v_date;
    exception when others then
      null;
    end;
  end if;
  return coalesce(p_effective_date,p_source_date);
end
$$;

revoke all on function financial_app.transaction_match_date(text,date,date) from public;
revoke all on function financial_app.transaction_match_date(text,date,date) from anon;
revoke all on function financial_app.transaction_match_date(text,date,date) from authenticated;

create or replace function financial_app.transaction_document_matches_core(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text;
  v_date date;
  v_amount numeric;
  v_text text;
  v_linked jsonb := '[]'::jsonb;
  v_suggestions jsonb := '[]'::jsonb;
  v_status text := 'none';
begin
  v_email := financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date),
         abs(t.source_amount),
         lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,''))
  into v_date,v_amount,v_text
  from financial_app.transactions t where t.id=p_transaction_id;
  if v_date is null then raise exception 'transaction not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'fileName',d.file_name,'documentType',d.document_type,'documentDate',d.document_date,'amount',d.amount,'merchant',d.merchant,
      'storageProvider',d.storage_provider,'storageUrl',d.storage_url,'associationOrigin',td.association_origin,'confidence',td.confidence
    ) order by coalesce(d.document_date,d.created_at::date) desc),'[]'::jsonb)
  into v_linked
  from financial_app.transaction_documents td join financial_app.documents d on d.id=td.document_id
  where td.transaction_id=p_transaction_id and d.archived_at is null;

  with docs as (
    select d.*,
      coalesce(nullif(d.ocr_data->>'chargeDate','')::date,d.document_date) match_date,
      coalesce(nullif(d.ocr_data->>'installmentAmount','')::numeric,d.amount) match_amount,
      coalesce(nullif(d.ocr_data->>'paymentWindowDays','')::int,7) payment_window,
      (d.ocr_data ? 'installmentAmount') is_installment
    from financial_app.documents d
    where d.archived_at is null and d.document_date is not null
      and coalesce(nullif(d.ocr_data->>'installmentAmount','')::numeric,d.amount) is not null
  ), scored as (
    select d.*,
      case when d.is_installment then greatest(0,v_date-d.document_date) else abs(d.match_date-v_date) end days_diff,
      abs(abs(d.match_amount)-v_amount) amount_diff,
      case when d.merchant is not null and trim(d.merchant)<>'' and
        regexp_replace(v_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
        then 20 else 0 end merchant_score,
      case when abs(abs(d.match_amount)-v_amount)<=0.01 then 55 when abs(abs(d.match_amount)-v_amount)<=0.50 then 45 when abs(abs(d.match_amount)-v_amount)<=greatest(1,abs(d.match_amount)*0.05) then 35 else 20 end amount_score,
      case when d.is_installment then 18 when abs(d.match_date-v_date)=0 then 25 when abs(d.match_date-v_date)=1 then 22 when abs(d.match_date-v_date)<=3 then 18 else 10 end date_score
    from docs d
    where ((not d.is_installment and v_date between d.match_date-7 and d.match_date+7)
       or (d.is_installment and v_date between d.document_date and d.document_date+d.payment_window))
      and abs(abs(d.match_amount)-v_amount)<=greatest(3,abs(d.match_amount)*0.15)
      and not exists(select 1 from financial_app.transaction_documents td where td.transaction_id=p_transaction_id and td.document_id=d.id)
      and (d.is_installment or not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id))
  ), ranked as (
    select *,least(100,amount_score+date_score+merchant_score)::numeric score from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'fileName',r.file_name,'documentType',r.document_type,'documentDate',r.document_date,'amount',r.amount,'merchant',r.merchant,
      'storageProvider',r.storage_provider,'storageUrl',r.storage_url,'score',round(r.score,1),'daysDiff',r.days_diff,'amountDiff',round(r.amount_diff,2),
      'merchantMatch',r.merchant_score>0,'installmentMatch',r.is_installment
    ) order by r.score desc,r.amount_diff,r.days_diff),'[]'::jsonb)
  into v_suggestions from (select * from ranked where score>=50 order by score desc,amount_diff,days_diff limit 5) r;

  if jsonb_array_length(v_linked)>0 then v_status:='linked'; elsif jsonb_array_length(v_suggestions)>0 then v_status:='possible'; else v_status:='none'; end if;
  return jsonb_build_object('status',v_status,'linked',v_linked,'suggestions',v_suggestions);
end
$$;

create or replace function financial_app.auto_link_documents_core()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text;
  v_drive_exact int:=0;
  v_normal int:=0;
  v_installments int:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  -- Google Drive: fecha real de compra + importe exacto + comercio, solo si la relación es inequívoca 1:1.
  with tx as (
    select t.*,
      financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) match_date,
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')) match_text
    from financial_app.transactions t
    where t.source_missing=false and t.is_duplicate=false
  ), candidates as (
    select d.id document_id,tx.id transaction_id,
      count(*) over(partition by d.id) document_candidates,
      count(*) over(partition by tx.id) transaction_candidates
    from financial_app.documents d
    join tx on tx.match_date=d.document_date
      and abs(abs(tx.source_amount)-abs(d.amount))<=0.01
      and d.merchant is not null and trim(d.merchant)<>''
      and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
    where d.storage_provider='google_drive' and d.archived_at is null and d.document_date is not null and d.amount is not null
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'drive_exact',1.0,now()
    from candidates where document_candidates=1 and transaction_candidates=1
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_drive_exact from ins;

  -- Resto de documentos: conserva el scoring prudente, pero compara contra la fecha real de compra cuando exista.
  with docs as (
    select d.*,coalesce(nullif(d.ocr_data->>'chargeDate','')::date,d.document_date) match_date
    from financial_app.documents d
    where d.archived_at is null and d.document_date is not null and d.amount is not null and d.amount<>0 and not(d.ocr_data?'installmentAmount')
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), tx as (
    select t.*,
      financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) match_date,
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')) match_text
    from financial_app.transactions t where t.source_missing=false and t.is_duplicate=false
  ), candidates as (
    select d.id document_id,tx.id transaction_id,
      abs(tx.match_date-d.match_date) days_diff,
      abs(abs(tx.source_amount)-abs(d.amount)) amount_diff,
      case when d.merchant is not null and trim(d.merchant)<>'' and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%' then 20 else 0 end merchant_score,
      (case when abs(abs(tx.source_amount)-abs(d.amount))<=0.01 then 55 when abs(abs(tx.source_amount)-abs(d.amount))<=0.50 then 45 when abs(abs(tx.source_amount)-abs(d.amount))<=greatest(1,abs(d.amount)*0.05) then 35 else 20 end
      +case when abs(tx.match_date-d.match_date)=0 then 25 when abs(tx.match_date-d.match_date)=1 then 22 when abs(tx.match_date-d.match_date)<=3 then 18 else 10 end
      +case when d.merchant is not null and trim(d.merchant)<>'' and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%' then 20 else 0 end)::numeric score
    from docs d join tx on tx.match_date between d.match_date-7 and d.match_date+7
      and abs(abs(tx.source_amount)-abs(d.amount))<=greatest(3,abs(d.amount)*0.15)
  ), ranked as (
    select c.*,row_number() over(partition by document_id order by score desc,amount_diff,days_diff) rn,
      lead(score) over(partition by document_id order by score desc,amount_diff,days_diff) second_score,
      count(*) over(partition by document_id) candidate_count from candidates c
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'auto',least(1,score/100.0),now() from ranked
    where rn=1 and score>=93 and amount_diff<=0.01 and days_diff<=3 and merchant_score=20 and (candidate_count=1 or second_score is null or score-second_score>=8)
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_normal from ins;

  with docs as (
    select d.*,nullif(d.ocr_data->>'installmentAmount','')::numeric installment_amount,
      coalesce(nullif(d.ocr_data->>'installmentCount','')::int,1) installment_count,
      coalesce(nullif(d.ocr_data->>'paymentWindowDays','')::int,100) payment_window
    from financial_app.documents d
    where d.archived_at is null and d.document_date is not null and d.ocr_data?'installmentAmount'
  ), tx as (
    select t.*,financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) match_date,
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')) match_text
    from financial_app.transactions t where t.source_missing=false and t.is_duplicate=false
  ), candidates as (
    select d.id document_id,tx.id transaction_id,tx.match_date txn_date,d.installment_count,
      row_number() over(partition by d.id order by tx.match_date,tx.created_at) rn
    from docs d join tx on tx.match_date between d.document_date and d.document_date+d.payment_window
      and abs(abs(tx.source_amount)-abs(d.installment_amount))<=0.02
      and d.merchant is not null and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'auto',0.98,now() from candidates where rn<=installment_count
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_installments from ins;

  return jsonb_build_object('linked',v_drive_exact+v_normal+v_installments,'driveExact',v_drive_exact,'normal',v_normal,'installments',v_installments);
end
$$;
