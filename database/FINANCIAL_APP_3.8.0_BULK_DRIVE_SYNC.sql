begin;

-- Financial App 3.8.0
-- Edición masiva atómica y sincronización documental de Google Drive por service role.

create unique index if not exists documents_storage_identity_uq
  on financial_app.documents(storage_provider,storage_path)
  where storage_path is not null;

create or replace function financial_app.bulk_update_transactions_rpc(
  p_transaction_ids uuid[],
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text;
  v_ids uuid[];
  v_id uuid;
  v_count int;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb then raise exception 'invalid_patch'; end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (select distinct id from unnest(coalesce(p_transaction_ids,array[]::uuid[])) id where id is not null) q;

  v_count:=cardinality(v_ids);
  if v_count=0 then raise exception 'no_transactions_selected'; end if;
  if v_count>200 then raise exception 'bulk_limit_exceeded'; end if;

  -- update_transaction_rpc conserva la validación de campos, bloqueo de fila e historial.
  -- Al ejecutarse dentro de esta misma función, cualquier error revierte todo el lote.
  foreach v_id in array v_ids loop
    perform financial_app.update_transaction_rpc(v_id,p_patch);
  end loop;

  return jsonb_build_object('ok',true,'updated',v_count,'ids',to_jsonb(v_ids));
end
$$;

revoke all on function financial_app.bulk_update_transactions_rpc(uuid[],jsonb) from public, anon;
grant execute on function financial_app.bulk_update_transactions_rpc(uuid[],jsonb) to authenticated, service_role;

create or replace function public.financial_app_bulk_update_transactions(
  p_transaction_ids uuid[],
  p_patch jsonb
)
returns jsonb
language sql
set search_path = pg_catalog, financial_app
as $$
  select financial_app.bulk_update_transactions_rpc(p_transaction_ids,p_patch)
$$;

revoke all on function public.financial_app_bulk_update_transactions(uuid[],jsonb) from public, anon;
grant execute on function public.financial_app_bulk_update_transactions(uuid[],jsonb) to authenticated, service_role;

-- El motor existente sigue siendo privado. Se permite service_role porque la ingesta
-- automática de Drive se ejecuta desde la Edge Function autenticada con esa función.
create or replace function financial_app.auto_link_documents_core()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
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
    where d.storage_provider='google_drive' and d.archived_at is null and d.document_date is not null and d.amount is not null
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'drive_exact',1.0,now()
    from candidates where document_candidates=1 and transaction_candidates=1
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_drive_exact from ins;

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

revoke all on function financial_app.auto_link_documents_core() from public, anon, authenticated;
grant execute on function financial_app.auto_link_documents_core() to service_role;

create or replace function financial_app.import_drive_documents_core(p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_item jsonb;
  v_drive_id text;
  v_name text;
  v_mime text;
  v_url text;
  v_path text;
  v_modified text;
  v_type text;
  v_date date;
  v_amount numeric;
  v_merchant text;
  v_size bigint;
  v_doc_id uuid;
  v_rows int;
  v_inserted int:=0;
  v_updated int:=0;
  v_auto jsonb:='{}'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_files) is distinct from 'array' then raise exception 'invalid_drive_files'; end if;
  if jsonb_array_length(p_files)>2000 then raise exception 'drive_file_limit_exceeded'; end if;

  for v_item in select value from jsonb_array_elements(p_files) loop
    v_drive_id:=nullif(trim(v_item->>'id'),'');
    v_name:=nullif(trim(v_item->>'name'),'');
    if v_drive_id is null or v_name is null then continue; end if;
    v_mime:=nullif(trim(v_item->>'mimeType'),'');
    v_url:=coalesce(nullif(trim(v_item->>'webViewLink'),''),'https://drive.google.com/file/d/'||v_drive_id||'/view');
    v_path:=nullif(trim(v_item->>'folderPath'),'');
    v_modified:=nullif(trim(v_item->>'modifiedTime'),'');
    v_type:=coalesce(nullif(trim(v_item->>'documentType'),''),'other');
    if v_type not in ('invoice','receipt','contract','statement','tax','other') then v_type:='other'; end if;
    begin v_date:=nullif(trim(v_item->>'documentDate'),'')::date; exception when others then v_date:=null; end;
    begin v_amount:=replace(nullif(trim(v_item->>'amount'),''),',','.')::numeric; exception when others then v_amount:=null; end;
    v_merchant:=nullif(trim(v_item->>'merchant'),'');
    begin v_size:=nullif(trim(v_item->>'size'),'')::bigint; exception when others then v_size:=null; end;

    select id into v_doc_id
    from financial_app.documents
    where storage_provider='google_drive' and storage_path=v_drive_id
    limit 1;

    if v_doc_id is null then
      insert into financial_app.documents(
        file_name,mime_type,storage_provider,storage_url,storage_path,file_size,original_preserved,
        document_type,document_date,amount,merchant,ocr_status,ocr_data,uploaded_by,created_at,updated_at
      ) values(
        v_name,v_mime,'google_drive',v_url,v_drive_id,v_size,true,
        v_type,v_date,v_amount,v_merchant,'not_required',
        jsonb_strip_nulls(jsonb_build_object('driveModifiedTime',v_modified,'driveFolderPath',v_path,'importedBy','financial-app-sync')),
        'financial-app-sync',now(),now()
      ) returning id into v_doc_id;
      v_inserted:=v_inserted+1;
    else
      update financial_app.documents d set
        file_name=v_name,
        mime_type=coalesce(v_mime,d.mime_type),
        storage_url=v_url,
        file_size=coalesce(v_size,d.file_size),
        document_type=case when d.document_type='other' and v_type<>'other' then v_type else d.document_type end,
        document_date=coalesce(d.document_date,v_date),
        amount=coalesce(d.amount,v_amount),
        merchant=coalesce(d.merchant,v_merchant),
        ocr_status=case when d.ocr_status='pending' then 'not_required' else d.ocr_status end,
        ocr_data=coalesce(d.ocr_data,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('driveModifiedTime',v_modified,'driveFolderPath',v_path,'importedBy','financial-app-sync')),
        updated_at=now()
      where d.id=v_doc_id and (
        d.file_name is distinct from v_name or d.mime_type is distinct from coalesce(v_mime,d.mime_type)
        or d.storage_url is distinct from v_url or d.file_size is distinct from coalesce(v_size,d.file_size)
        or (d.document_type='other' and v_type<>'other')
        or (d.document_date is null and v_date is not null) or (d.amount is null and v_amount is not null)
        or (d.merchant is null and v_merchant is not null)
        or coalesce(d.ocr_data->>'driveModifiedTime','') is distinct from coalesce(v_modified,'')
        or coalesce(d.ocr_data->>'driveFolderPath','') is distinct from coalesce(v_path,'')
      );
      get diagnostics v_rows=row_count;
      v_updated:=v_updated+v_rows;
    end if;
  end loop;

  begin
    v_auto:=financial_app.auto_link_documents_core();
  exception when others then
    v_auto:=jsonb_build_object('linked',0,'error',sqlerrm);
  end;

  return jsonb_build_object(
    'ok',true,
    'scanned',jsonb_array_length(p_files),
    'inserted',v_inserted,
    'updated',v_updated,
    'autoLink',v_auto,
    'changed',(v_inserted+v_updated+coalesce((v_auto->>'linked')::int,0))>0
  );
end
$$;

revoke all on function financial_app.import_drive_documents_core(jsonb) from public, anon, authenticated;
grant execute on function financial_app.import_drive_documents_core(jsonb) to service_role;

create or replace function public.financial_app_import_drive_documents(p_files jsonb)
returns jsonb
language sql
set search_path = pg_catalog, financial_app
as $$
  select financial_app.import_drive_documents_core(p_files)
$$;

revoke all on function public.financial_app_import_drive_documents(jsonb) from public, anon, authenticated;
grant execute on function public.financial_app_import_drive_documents(jsonb) to service_role;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.8.0'::text),now()),
  ('target_version',to_jsonb('3.8.0'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

commit;
