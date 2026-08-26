-- Financial App 3.8.1 hotfix · sync documental set-based y finalización de autoenlace ordenada.
-- Mantiene app_version/target_version en 3.8.1 para ser compatible con el release ya publicado.

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
set search_path = pg_catalog
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
      nullif(btrim(x.merchant),'') as merchant,
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

revoke all on function financial_app.drive_document_rows(jsonb) from public, anon, authenticated, service_role;

create or replace function financial_app.import_drive_documents_core(p_files jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
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
    merchant=coalesce(documents.merchant,excluded.merchant),
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
    or (documents.merchant is null and excluded.merchant is not null)
    or documents.ocr_status='pending'
    or coalesce(documents.ocr_data->>'driveModifiedTime','') is distinct from coalesce(excluded.ocr_data->>'driveModifiedTime','')
    or coalesce(documents.ocr_data->>'driveFolderPath','') is distinct from coalesce(excluded.ocr_data->>'driveFolderPath','');

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

-- Compatibilidad con Edge Function anterior: conserva autoenlace, pero solo si Drive cambió.
create or replace function public.financial_app_import_drive_documents(p_files jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, financial_app
as $$
declare
  v_result jsonb;
  v_auto jsonb:=jsonb_build_object('linked',0,'skipped',true);
begin
  v_result:=financial_app.import_drive_documents_core(p_files);
  if coalesce((v_result->>'changed')::boolean,false) then
    begin
      v_auto:=financial_app.auto_link_documents_core();
    exception when others then
      v_auto:=jsonb_build_object('linked',0,'error','auto_link_failed');
    end;
  end if;
  return v_result || jsonb_build_object(
    'autoLink',v_auto,
    'changed',(coalesce((v_result->>'changed')::boolean,false) or coalesce((v_auto->>'linked')::int,0)>0)
  );
end
$$;

revoke all on function public.financial_app_import_drive_documents(jsonb) from public, anon, authenticated;
grant execute on function public.financial_app_import_drive_documents(jsonb) to service_role;

-- Camino optimizado: importa primero y enlaza una sola vez después de aplicar también la fuente bancaria.
create or replace function public.financial_app_import_drive_documents_deferred(p_files jsonb)
returns jsonb
language sql
set search_path = pg_catalog, financial_app
as $$
  select financial_app.import_drive_documents_core(p_files)
$$;

revoke all on function public.financial_app_import_drive_documents_deferred(jsonb) from public, anon, authenticated;
grant execute on function public.financial_app_import_drive_documents_deferred(jsonb) to service_role;

create or replace function public.financial_app_finalize_document_links()
returns jsonb
language sql
set search_path = pg_catalog, financial_app
as $$
  select financial_app.auto_link_documents_core()
$$;

revoke all on function public.financial_app_finalize_document_links() from public, anon, authenticated;
grant execute on function public.financial_app_finalize_document_links() to service_role;

create index if not exists transactions_document_match_idx
  on financial_app.transactions(
    financial_app.transaction_match_date(source_original_concept,effective_date,source_date),
    (abs(source_amount))
  )
  where source_missing=false and is_duplicate=false;

-- 3.8.0 dejó dos índices únicos equivalentes sobre la identidad de Drive. Conservamos el canónico previo.
drop index if exists financial_app.documents_storage_identity_uq;

notify pgrst,'reload schema';
