begin;

-- Financial App 9.0.0 — Drive document content hydration.
-- The bank source and the Google Drive originals remain read-only. This queue only
-- decides when a weak Drive document needs content extraction before canonical matching.

create table if not exists financial_app.document_content_hydration_queue(
  document_id uuid primary key references financial_app.documents(id) on delete cascade,
  source_modified_at text not null,
  status text not null default 'pending' check(status in('pending','processing','retry','completed','review')),
  attempts integer not null default 0 check(attempts between 0 and 10),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table financial_app.document_content_hydration_queue enable row level security;
revoke all on table financial_app.document_content_hydration_queue from public,anon,authenticated;

create index if not exists document_content_hydration_queue_pending_idx
  on financial_app.document_content_hydration_queue(status,next_attempt_at,updated_at)
  where status in('pending','processing','retry');

create or replace function public.financial_app_prepare_drive_document_hydration(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_limit integer:=least(250,greatest(1,coalesce(p_limit,100)));
  v_queued integer:=0;
  v_pending integer:=0;
  v_review integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  -- Recover a claim left behind by a terminated request. Three unsuccessful claims
  -- stop retrying automatically and are surfaced for manual review instead.
  update financial_app.document_content_hydration_queue q
     set status=case when q.attempts>=3 then 'review' else 'retry' end,
         next_attempt_at=case when q.attempts>=3 then null else now() end,
         last_error=case when q.attempts>=3 then 'processing_timeout_limit' else 'processing_timeout' end,
         updated_at=now()
   where q.status='processing'
     and q.updated_at<=now()-interval '10 minutes';

  update financial_app.documents d
     set ocr_status='needs_review',
         ocr_data=coalesce(d.ocr_data,'{}'::jsonb)||jsonb_build_object(
           'driveContentHydration',jsonb_build_object(
             'status','review',
             'reason','source_too_large',
             'maxBytes',12582912,
             'updatedAt',now()
           )
         ),
         updated_at=now()
   where d.storage_provider='google_drive'
     and d.archived_at is null
     and d.ocr_status<>'manual'
     and coalesce(d.file_size,0)>12582912
     and (d.document_date is null or d.amount is null or nullif(btrim(d.merchant),'') is null or d.document_type='other')
     and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
     and coalesce(d.ocr_data->'driveContentHydration'->>'reason','')<>'source_too_large';
  get diagnostics v_review=row_count;

  with candidates as(
    select d.id,coalesce(nullif(d.ocr_data->>'driveModifiedTime',''),to_char(d.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) source_modified_at
    from financial_app.documents d
    where d.storage_provider='google_drive'
      and d.archived_at is null
      and d.ocr_status<>'manual'
      and (d.mime_type='application/pdf' or d.mime_type like 'image/%')
      and (d.file_size is null or d.file_size<=12582912)
      and (d.document_date is null or d.amount is null or nullif(btrim(d.merchant),'') is null or d.document_type='other' or d.ocr_status in('failed','error','pending','processing'))
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
    order by d.updated_at,d.created_at,d.id
    limit v_limit
  )
  insert into financial_app.document_content_hydration_queue(document_id,source_modified_at,status,attempts,next_attempt_at,last_error,processed_at,created_at,updated_at)
  select c.id,c.source_modified_at,'pending',0,now(),null,null,now(),now()
  from candidates c
  on conflict(document_id) do update
    set source_modified_at=excluded.source_modified_at,
        status='pending',
        attempts=0,
        next_attempt_at=now(),
        last_attempt_at=null,
        last_error=null,
        processed_at=null,
        updated_at=now()
  where financial_app.document_content_hydration_queue.source_modified_at is distinct from excluded.source_modified_at;
  get diagnostics v_queued=row_count;

  update financial_app.documents d
     set ocr_status='pending',updated_at=now()
    from financial_app.document_content_hydration_queue q
   where q.document_id=d.id
     and q.status in('pending','retry')
     and d.ocr_status not in('manual','pending')
     and q.source_modified_at=coalesce(nullif(d.ocr_data->>'driveModifiedTime',''),q.source_modified_at);

  select count(*)::int into v_pending
  from financial_app.document_content_hydration_queue q
  join financial_app.documents d on d.id=q.document_id
  where q.status in('pending','retry','processing') and d.archived_at is null;

  return jsonb_build_object(
    'ok',true,
    'queued',v_queued,
    'pending',v_pending,
    'review',v_review,
    'batchLimit',v_limit,
    'maxSourceBytes',12582912,
    'durableRetries',3,
    'processingTimeoutMinutes',10,
    'sourceDataReadOnly',true
  );
end
$$;

create or replace function public.financial_app_drive_document_hydration_pending(p_limit integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_limit integer:=least(2,greatest(1,coalesce(p_limit,1)));
  v_items jsonb:='[]'::jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  with claim as(
    select q.document_id
    from financial_app.document_content_hydration_queue q
    join financial_app.documents d on d.id=q.document_id
    where q.status in('pending','retry')
      and coalesce(q.next_attempt_at,'epoch'::timestamptz)<=now()
      and q.attempts<3
      and d.storage_provider='google_drive'
      and d.archived_at is null
      and d.ocr_status<>'manual'
      and q.source_modified_at=coalesce(nullif(d.ocr_data->>'driveModifiedTime',''),q.source_modified_at)
    order by coalesce(q.next_attempt_at,q.created_at),q.created_at,q.document_id
    for update of q skip locked
    limit v_limit
  ),claimed as(
    update financial_app.document_content_hydration_queue q
       set status='processing',
           attempts=q.attempts+1,
           last_attempt_at=now(),
           next_attempt_at=null,
           updated_at=now()
      from claim c
     where q.document_id=c.document_id
    returning q.document_id,q.source_modified_at,q.attempts
  ),doc_state as(
    update financial_app.documents d
       set ocr_status='processing',updated_at=now()
      from claimed c
     where d.id=c.document_id and d.ocr_status<>'manual'
    returning d.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'documentId',d.id,
    'fileName',d.file_name,
    'mimeType',d.mime_type,
    'fileSize',d.file_size,
    'sourceModifiedAt',c.source_modified_at,
    'attempt',c.attempts,
    'documentType',d.document_type,
    'documentDate',d.document_date,
    'amount',d.amount,
    'merchant',d.merchant
  ) order by c.document_id),'[]'::jsonb)
  into v_items
  from claimed c
  join financial_app.documents d on d.id=c.document_id;

  return jsonb_build_object('ok',true,'items',v_items,'claimed',jsonb_array_length(v_items));
end
$$;

create or replace function public.financial_app_drive_document_hydration_source(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_payload jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select jsonb_build_object(
    'documentId',d.id,
    'driveId',d.storage_path,
    'fileName',d.file_name,
    'mimeType',d.mime_type,
    'fileSize',d.file_size,
    'sourceModifiedAt',q.source_modified_at
  ) into v_payload
  from financial_app.document_content_hydration_queue q
  join financial_app.documents d on d.id=q.document_id
  where q.document_id=p_document_id
    and q.status='processing'
    and d.storage_provider='google_drive'
    and d.archived_at is null
    and d.storage_path is not null
    and q.source_modified_at=coalesce(nullif(d.ocr_data->>'driveModifiedTime',''),q.source_modified_at);

  return v_payload;
end
$$;

create or replace function public.financial_app_drive_document_hydration_fail(
  p_document_id uuid,
  p_source_modified_at text,
  p_error_code text,
  p_retryable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_attempts integer;
  v_status text;
  v_error text:=left(regexp_replace(coalesce(nullif(btrim(p_error_code),''),'hydration_failed'),'[^a-zA-Z0-9_.:-]+','_','g'),120);
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select attempts into v_attempts
  from financial_app.document_content_hydration_queue
  where document_id=p_document_id and source_modified_at=p_source_modified_at
  for update;
  if v_attempts is null then raise exception 'hydration_claim_not_found'; end if;

  v_status:=case when coalesce(p_retryable,true) and v_attempts<3 then 'retry' else 'review' end;

  update financial_app.document_content_hydration_queue
     set status=v_status,
         next_attempt_at=case when v_status='retry' then now()+(10*greatest(1,v_attempts))*interval '1 minute' else null end,
         last_error=v_error,
         updated_at=now()
   where document_id=p_document_id and source_modified_at=p_source_modified_at;

  update financial_app.documents d
     set ocr_status=case when v_status='retry' then 'error' else 'needs_review' end,
         ocr_data=coalesce(d.ocr_data,'{}'::jsonb)||jsonb_build_object(
           'driveContentHydration',jsonb_build_object(
             'status',v_status,
             'sourceModifiedAt',p_source_modified_at,
             'attempts',v_attempts,
             'error',v_error,
             'updatedAt',now()
           )
         ),
         updated_at=now()
   where d.id=p_document_id and d.ocr_status<>'manual';

  return jsonb_build_object('ok',true,'status',v_status,'attempts',v_attempts,'retryable',v_status='retry');
end
$$;

create or replace function public.financial_app_complete_drive_document_hydration(
  p_document_id uuid,
  p_source_modified_at text,
  p_document_type text,
  p_document_date date,
  p_amount numeric,
  p_merchant text,
  p_ocr_text text,
  p_ocr_data jsonb,
  p_ocr_status text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_current financial_app.documents%rowtype;
  v_attempts integer;
  v_queue_status text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_ocr_status not in('complete','needs_review') then raise exception 'invalid_hydration_status'; end if;
  if p_document_type is not null and p_document_type not in('invoice','receipt','contract','statement','tax','other') then raise exception 'invalid_document_type'; end if;

  select * into v_current from financial_app.documents where id=p_document_id for update;
  if v_current.id is null or v_current.storage_provider<>'google_drive' or v_current.archived_at is not null then
    raise exception 'drive_document_unavailable';
  end if;
  if coalesce(nullif(v_current.ocr_data->>'driveModifiedTime',''),p_source_modified_at)<>p_source_modified_at then
    raise exception 'stale_drive_hydration';
  end if;

  select attempts into v_attempts
  from financial_app.document_content_hydration_queue
  where document_id=p_document_id and source_modified_at=p_source_modified_at and status='processing'
  for update;
  if v_attempts is null then raise exception 'hydration_claim_not_found'; end if;

  if v_current.ocr_status='manual' then
    update financial_app.document_content_hydration_queue
       set status='completed',processed_at=now(),last_error='manual_preserved',next_attempt_at=null,updated_at=now()
     where document_id=p_document_id;
    return jsonb_build_object('ok',true,'status','completed','manualPreserved',true);
  end if;

  v_queue_status:=case when p_ocr_status='complete' then 'completed' else 'review' end;

  update financial_app.documents d
     set document_type=case when p_document_type is not null and p_document_type<>'other' then p_document_type else d.document_type end,
         document_date=coalesce(p_document_date,d.document_date),
         amount=coalesce(p_amount,d.amount),
         merchant=coalesce(nullif(btrim(p_merchant),''),d.merchant),
         ocr_text=coalesce(p_ocr_text,d.ocr_text),
         ocr_data=coalesce(d.ocr_data,'{}'::jsonb)
           ||coalesce(p_ocr_data,'{}'::jsonb)
           ||jsonb_build_object(
             'driveContentHydration',jsonb_build_object(
               'status',v_queue_status,
               'sourceModifiedAt',p_source_modified_at,
               'attempts',v_attempts,
               'processedAt',now(),
               'automatic',true,
               'sourceDataReadOnly',true
             )
           ),
         ocr_status=p_ocr_status,
         updated_at=now()
   where d.id=p_document_id;

  update financial_app.document_content_hydration_queue
     set status=v_queue_status,
         next_attempt_at=null,
         last_error=null,
         processed_at=now(),
         updated_at=now()
   where document_id=p_document_id and source_modified_at=p_source_modified_at;

  return jsonb_build_object('ok',true,'status',v_queue_status,'ocrStatus',p_ocr_status,'manualPreserved',false);
end
$$;

create or replace function public.financial_app_finalize_document_links_after_hydration()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  return financial_app.auto_link_documents_core();
end
$$;

-- Automatic linking must never consume OCR that is still processing or awaiting review.
create or replace function financial_app.auto_link_documents_core()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_service boolean:=false;
  v_drive_exact int:=0;
  v_normal int:=0;
  v_installments int:=0;
begin
  v_email:=financial_app.authorized_email();
  v_service:=coalesce(auth.jwt()->>'role','')='service_role';
  if v_email is null and not v_service then raise exception 'forbidden' using errcode='42501'; end if;

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
    where d.storage_provider='google_drive' and d.archived_at is null
      and d.ocr_status in('complete','manual','not_required')
      and d.document_date is not null and d.amount is not null
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'drive_exact',1.0,now()
    from candidates where document_candidates=1 and transaction_candidates=1
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_drive_exact from ins;

  with docs as (
    select d.id
    from financial_app.documents d
    where d.archived_at is null
      and d.ocr_status in('complete','manual','not_required')
      and d.document_date is not null
      and d.amount is not null
      and d.amount<>0
      and not(d.ocr_data?'installmentAmount')
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), candidates as (
    select d.id as document_id,c.transaction_id,c.score
    from docs d
    cross join lateral financial_app.document_match_candidates_rows_core(d.id,2) c
    where c.match_mode='standard'
      and c.candidate_rank=1
      and c.auto_eligible
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'auto',least(1,score/100.0),now()
    from candidates
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_normal from ins;

  with docs as (
    select d.*,
      nullif(d.ocr_data->>'installmentAmount','')::numeric installment_amount,
      coalesce(nullif(d.ocr_data->>'installmentCount','')::int,1) installment_count,
      coalesce(nullif(d.ocr_data->>'paymentWindowDays','')::int,100) payment_window
    from financial_app.documents d
    where d.archived_at is null
      and d.ocr_status in('complete','manual','not_required')
      and d.document_date is not null
      and d.ocr_data?'installmentAmount'
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

revoke all on function financial_app.auto_link_documents_core() from public,anon,authenticated,service_role;

revoke all on function public.financial_app_prepare_drive_document_hydration(integer) from public,anon;
revoke all on function public.financial_app_drive_document_hydration_pending(integer) from public,anon;
revoke all on function public.financial_app_drive_document_hydration_fail(uuid,text,text,boolean) from public,anon;
revoke all on function public.financial_app_complete_drive_document_hydration(uuid,text,text,date,numeric,text,text,jsonb,text) from public,anon;
revoke all on function public.financial_app_finalize_document_links_after_hydration() from public,anon;
revoke all on function public.financial_app_drive_document_hydration_source(uuid) from public,anon,authenticated;

grant execute on function public.financial_app_prepare_drive_document_hydration(integer) to authenticated,service_role;
grant execute on function public.financial_app_drive_document_hydration_pending(integer) to authenticated,service_role;
grant execute on function public.financial_app_drive_document_hydration_fail(uuid,text,text,boolean) to authenticated,service_role;
grant execute on function public.financial_app_complete_drive_document_hydration(uuid,text,text,date,numeric,text,text,jsonb,text) to authenticated,service_role;
grant execute on function public.financial_app_finalize_document_links_after_hydration() to authenticated,service_role;
grant execute on function public.financial_app_drive_document_hydration_source(uuid) to service_role;

commit;
