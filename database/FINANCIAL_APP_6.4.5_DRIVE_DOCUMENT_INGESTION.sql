begin;

-- Financial App 6.4.5 — ingesta documental Drive alineada con la estructura real.
-- No inventa fechas: conserva AAAA-MM como pista mensual separada y solo autoenlaza
-- por mes cuando importe + comercio producen una correspondencia unívoca.

create or replace function financial_app.drive_document_month(p_file_name text)
returns text
language sql
immutable
strict
set search_path to 'pg_catalog'
as $$
  select (regexp_match(p_file_name,'(?:^|[^0-9])(20[0-9]{2}-(?:0[1-9]|1[0-2]))(?:[^0-9]|$)'))[1]
$$;

create or replace function financial_app.drive_folder_merchant(p_folder_path text)
returns text
language sql
immutable
strict
set search_path to 'pg_catalog'
as $$
  select nullif(btrim(regexp_replace(segment,'^.*\s+-\s+','','i')),'')
  from unnest(regexp_split_to_array(p_folder_path,'\s+/\s+')) with ordinality as parts(segment,ord)
  where nullif(btrim(segment),'') is not null
    and btrim(segment) !~ '^20[0-9]{2}$'
    and lower(btrim(segment)) not in (
      'compras_y_facturas','compras','servicios y suministros','facturas','factura',
      'tickets','ticket','contratos','contrato','documentos','supermercado'
    )
  order by ord desc
  limit 1
$$;

revoke all on function financial_app.drive_document_month(text) from public, anon, authenticated;
revoke all on function financial_app.drive_folder_merchant(text) from public, anon, authenticated;

create or replace function financial_app.drive_document_rows(p_files jsonb)
returns table(
  drive_id text,
  file_name text,
  mime_type text,
  storage_url text,
  folder_path text,
  modified_time text,
  document_type text,
  document_date date,
  amount numeric,
  merchant text,
  file_size bigint
)
language sql
immutable
set search_path to 'pg_catalog','financial_app'
as $$
  select distinct on (q.drive_id)
    q.drive_id,
    q.file_name,
    q.mime_type,
    q.storage_url,
    q.folder_path,
    q.modified_time,
    q.document_type,
    q.document_date,
    q.amount,
    q.merchant,
    q.file_size
  from (
    select
      nullif(btrim(x.id),'') as drive_id,
      nullif(btrim(x.name),'') as file_name,
      nullif(btrim(x."mimeType"),'') as mime_type,
      coalesce(nullif(btrim(x."webViewLink"),''),'https://drive.google.com/file/d/'||nullif(btrim(x.id),'')||'/view') as storage_url,
      nullif(btrim(x."folderPath"),'') as folder_path,
      nullif(btrim(x."modifiedTime"),'') as modified_time,
      case
        when nullif(btrim(x."documentType"),'') in ('invoice','receipt','contract','statement','tax','other') then btrim(x."documentType")
        else 'other'
      end as document_type,
      case
        when nullif(btrim(x."documentDate"),'') is not null
          and pg_input_is_valid(btrim(x."documentDate"),'date')
        then btrim(x."documentDate")::date
        else null
      end as document_date,
      case
        when nullif(btrim(x.amount),'') is not null
          and pg_input_is_valid(replace(btrim(x.amount),',','.'),'numeric')
        then replace(btrim(x.amount),',','.')::numeric
        else null
      end as amount,
      case
        when nullif(btrim(x.merchant),'') is null
          or lower(btrim(x.merchant)) ~ '^(factura|invoice|ticket|recibo|contrato)(\s|$)'
        then coalesce(
          financial_app.drive_folder_merchant(nullif(btrim(x."folderPath"),'')),
          nullif(btrim(x.merchant),'')
        )
        else nullif(btrim(x.merchant),'')
      end as merchant,
      case
        when nullif(btrim(x.size),'') is not null
          and pg_input_is_valid(btrim(x.size),'bigint')
        then btrim(x.size)::bigint
        else null
      end as file_size
    from jsonb_to_recordset(p_files) as x(
      id text,
      name text,
      "mimeType" text,
      "modifiedTime" text,
      size text,
      "webViewLink" text,
      "folderPath" text,
      "documentType" text,
      "documentDate" text,
      amount text,
      merchant text
    )
  ) q
  where q.drive_id is not null and q.file_name is not null
  order by q.drive_id, q.modified_time desc nulls last, q.file_name
$$;

revoke all on function financial_app.drive_document_rows(jsonb) from public, anon, authenticated;

create or replace function financial_app.import_drive_documents_core(p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_scanned int:=0;
  v_valid int:=0;
  v_inserted int:=0;
  v_mutated int:=0;
  v_updated int:=0;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_files) is distinct from 'array' then
    raise exception 'invalid_drive_files';
  end if;

  v_scanned:=jsonb_array_length(p_files);
  if v_scanned>2000 then raise exception 'drive_file_limit_exceeded'; end if;

  perform pg_advisory_xact_lock(hashtext('financial_app:drive_documents_import'));

  select count(*) into v_valid
  from financial_app.drive_document_rows(p_files);

  select count(*) into v_inserted
  from financial_app.drive_document_rows(p_files) i
  where not exists (
    select 1
    from financial_app.documents d
    where d.storage_provider='google_drive' and d.storage_path=i.drive_id
  );

  insert into financial_app.documents(
    file_name,mime_type,storage_provider,storage_url,storage_path,file_size,original_preserved,
    document_type,document_date,amount,merchant,ocr_status,ocr_data,uploaded_by,created_at,updated_at
  )
  select
    i.file_name,
    i.mime_type,
    'google_drive',
    i.storage_url,
    i.drive_id,
    i.file_size,
    true,
    i.document_type,
    i.document_date,
    i.amount,
    i.merchant,
    'not_required',
    jsonb_strip_nulls(jsonb_build_object(
      'driveModifiedTime',i.modified_time,
      'driveFolderPath',i.folder_path,
      'driveDocumentMonth',financial_app.drive_document_month(i.file_name),
      'importedBy','financial-app-sync'
    )),
    'financial-app-sync',
    now(),
    now()
  from financial_app.drive_document_rows(p_files) i
  on conflict (storage_provider,storage_path) where storage_path is not null
  do update set
    file_name=excluded.file_name,
    mime_type=coalesce(excluded.mime_type,documents.mime_type),
    storage_url=excluded.storage_url,
    file_size=coalesce(excluded.file_size,documents.file_size),
    document_type=case
      when documents.document_type='other' and excluded.document_type<>'other' then excluded.document_type
      else documents.document_type
    end,
    document_date=coalesce(documents.document_date,excluded.document_date),
    amount=coalesce(documents.amount,excluded.amount),
    merchant=case
      when documents.merchant is null
        or lower(documents.merchant) ~ '^(factura|invoice|ticket|recibo|contrato)(\s|$)'
      then coalesce(excluded.merchant,documents.merchant)
      else documents.merchant
    end,
    ocr_status=case when documents.ocr_status='pending' then 'not_required' else documents.ocr_status end,
    ocr_data=coalesce(documents.ocr_data,'{}'::jsonb)||excluded.ocr_data,
    updated_at=now()
  where
    documents.file_name is distinct from excluded.file_name
    or documents.mime_type is distinct from coalesce(excluded.mime_type,documents.mime_type)
    or documents.storage_url is distinct from excluded.storage_url
    or documents.file_size is distinct from coalesce(excluded.file_size,documents.file_size)
    or (documents.document_type='other' and excluded.document_type<>'other')
    or (documents.document_date is null and excluded.document_date is not null)
    or (documents.amount is null and excluded.amount is not null)
    or (
      (documents.merchant is null or lower(documents.merchant) ~ '^(factura|invoice|ticket|recibo|contrato)(\s|$)')
      and excluded.merchant is not null
      and documents.merchant is distinct from excluded.merchant
    )
    or documents.ocr_status='pending'
    or coalesce(documents.ocr_data->>'driveModifiedTime','') is distinct from coalesce(excluded.ocr_data->>'driveModifiedTime','')
    or coalesce(documents.ocr_data->>'driveFolderPath','') is distinct from coalesce(excluded.ocr_data->>'driveFolderPath','')
    or coalesce(documents.ocr_data->>'driveDocumentMonth','') is distinct from coalesce(excluded.ocr_data->>'driveDocumentMonth','');

  get diagnostics v_mutated=row_count;
  v_updated:=greatest(v_mutated-v_inserted,0);

  return jsonb_build_object(
    'ok',true,
    'scanned',v_scanned,
    'valid',v_valid,
    'inserted',v_inserted,
    'updated',v_updated,
    'changed',(v_inserted+v_updated)>0,
    'autoLink',jsonb_build_object('deferred',true,'linked',0)
  );
end
$$;

revoke all on function financial_app.import_drive_documents_core(jsonb) from public, anon, authenticated;
grant execute on function financial_app.import_drive_documents_core(jsonb) to service_role;

create or replace function financial_app.apply_drive_document_delta_core(
  p_files jsonb,
  p_removed_ids text[],
  p_next_token text,
  p_full_scan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_import jsonb;
  v_archived integer:=0;
  v_reactivated integer:=0;
  v_removed text[];
  v_seen integer:=0;
  v_changed boolean:=false;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_files) is distinct from 'array' then raise exception 'invalid_drive_files'; end if;
  if jsonb_array_length(p_files)>2000 then raise exception 'drive_file_limit_exceeded'; end if;
  if coalesce(p_full_scan,false) and jsonb_array_length(p_files)=0 then
    raise exception 'drive_documents_empty_full_scan';
  end if;
  if p_next_token is not null and (length(p_next_token)=0 or length(p_next_token)>4096) then raise exception 'invalid_drive_change_token'; end if;

  select coalesce(array_agg(distinct nullif(btrim(x),'')) filter(where nullif(btrim(x),'') is not null),array[]::text[])
    into v_removed
  from unnest(coalesce(p_removed_ids,array[]::text[])) x;
  if cardinality(v_removed)>2000 then raise exception 'drive_removed_limit_exceeded'; end if;

  v_import:=financial_app.import_drive_documents_core(p_files);
  v_seen:=coalesce((v_import->>'valid')::int,(v_import->>'scanned')::int,0);

  with incoming as (
    select distinct nullif(btrim(value->>'id'),'') id
    from jsonb_array_elements(p_files)
    where nullif(btrim(value->>'id'),'') is not null
  )
  update financial_app.documents d
     set archived_at=null,updated_at=now()
   where d.storage_provider='google_drive'
     and d.archived_at is not null
     and exists(select 1 from incoming i where i.id=d.storage_path);
  get diagnostics v_reactivated=row_count;

  update financial_app.documents d
     set archived_at=coalesce(d.archived_at,now()),updated_at=now()
   where d.storage_provider='google_drive'
     and d.archived_at is null
     and (coalesce(d.ocr_data->>'importedBy','')='financial-app-sync' or d.uploaded_by='financial-app-sync')
     and (
       d.storage_path=any(v_removed)
       or (
         coalesce(p_full_scan,false)
         and not exists(
           select 1 from jsonb_array_elements(p_files) e
           where nullif(btrim(e->>'id'),'')=d.storage_path
         )
       )
     );
  get diagnostics v_archived=row_count;

  insert into financial_app.drive_sync_state(id,change_token,initialized_at,updated_at,last_mode,last_seen_files)
  values('documents',p_next_token,now(),now(),case when coalesce(p_full_scan,false) then 'full' else 'incremental' end,v_seen)
  on conflict(id) do update
    set change_token=coalesce(excluded.change_token,financial_app.drive_sync_state.change_token),
        initialized_at=coalesce(financial_app.drive_sync_state.initialized_at,excluded.initialized_at),
        updated_at=now(),
        last_mode=excluded.last_mode,
        last_seen_files=excluded.last_seen_files;

  v_changed:=coalesce((v_import->>'changed')::boolean,false) or v_archived>0 or v_reactivated>0;

  return jsonb_build_object(
    'ok',true,
    'mode',case when coalesce(p_full_scan,false) then 'full' else 'incremental' end,
    'scanned',coalesce((v_import->>'scanned')::int,0),
    'valid',coalesce((v_import->>'valid')::int,0),
    'inserted',coalesce((v_import->>'inserted')::int,0),
    'updated',coalesce((v_import->>'updated')::int,0),
    'archived',v_archived,
    'reactivated',v_reactivated,
    'removedSignals',cardinality(v_removed),
    'changed',v_changed,
    'autoLink',jsonb_build_object('linked',0,'deferred',true),
    'changeTokenStored',p_next_token is not null
  );
end
$$;

revoke all on function financial_app.apply_drive_document_delta_core(jsonb,text[],text,boolean) from public, anon, authenticated;
grant execute on function financial_app.apply_drive_document_delta_core(jsonb,text[],text,boolean) to service_role;

create or replace function financial_app.auto_link_documents_core()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_service boolean:=false;
  v_drive_exact int:=0;
  v_drive_month_exact int:=0;
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
    select d.id,d.amount,d.merchant,(d.ocr_data->>'driveDocumentMonth') month_hint
    from financial_app.documents d
    where d.storage_provider='google_drive'
      and d.archived_at is null
      and d.document_date is null
      and d.amount is not null
      and d.merchant is not null and btrim(d.merchant)<>''
      and coalesce(d.ocr_data->>'driveDocumentMonth','') ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), tx as (
    select t.id,t.source_amount,
      financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) match_date,
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')) match_text
    from financial_app.transactions t
    where t.source_missing=false and t.is_duplicate=false
  ), candidates as (
    select d.id document_id,tx.id transaction_id,
      count(*) over(partition by d.id) document_candidates,
      count(*) over(partition by tx.id) transaction_candidates
    from docs d
    join tx on tx.match_date>=to_date(d.month_hint||'-01','YYYY-MM-DD')
      and tx.match_date<(to_date(d.month_hint||'-01','YYYY-MM-DD')+interval '1 month')::date
      and abs(abs(tx.source_amount)-abs(d.amount))<=0.01
      and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'drive_month_exact',0.99,now()
    from candidates where document_candidates=1 and transaction_candidates=1
    on conflict(transaction_id,document_id) do nothing returning 1
  ) select count(*) into v_drive_month_exact from ins;

  with docs as (
    select d.id
    from financial_app.documents d
    where d.archived_at is null
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

  return jsonb_build_object(
    'linked',v_drive_exact+v_drive_month_exact+v_normal+v_installments,
    'driveExact',v_drive_exact,
    'driveMonthExact',v_drive_month_exact,
    'normal',v_normal,
    'installments',v_installments
  );
end
$$;

revoke all on function financial_app.auto_link_documents_core() from public, anon;
grant execute on function financial_app.auto_link_documents_core() to authenticated, service_role;

-- El estado 6.4.4 quedó inicializado con cero documentos. Se invalida el token una sola vez
-- para obligar a un escaneo completo en la siguiente sincronización. Si sigue devolviendo cero,
-- apply_drive_document_delta_core lo rechazará y no volverá a fijar un token incremental silencioso.
update financial_app.drive_sync_state
set change_token=null,
    updated_at=now(),
    last_mode='full_recheck_required',
    last_seen_files=0
where id='documents'
  and not exists(
    select 1 from financial_app.documents d
    where d.storage_provider='google_drive' and d.archived_at is null
  );

commit;