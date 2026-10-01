-- Financial App · PRE-034 · contrato OCR/documental Axioma
-- Mantiene cuatro capas separadas:
--   original privado e inmutable -> reconocimiento OCR -> interpretación -> revisión de usuario.
-- No modifica movimientos bancarios ni la fuente oficial.

alter table financial_app.documents
  add column if not exists ocr_recognition jsonb null,
  add column if not exists ocr_interpretation jsonb null,
  add column if not exists ocr_status text not null default 'not_processed',
  add column if not exists ocr_extracted_at timestamptz null,
  add column if not exists issuer_tax_id text null,
  add column if not exists document_time time without time zone null,
  add column if not exists document_number text null,
  add column if not exists document_period text null,
  add column if not exists base_cents bigint null,
  add column if not exists tax_cents bigint null,
  add column if not exists payment_method text null,
  add column if not exists line_items jsonb not null default '[]'::jsonb;

alter table financial_app.documents
  drop constraint if exists documents_ocr_status_check,
  add constraint documents_ocr_status_check
    check (ocr_status in ('not_processed','ready','needs_review','empty','failed')),
  drop constraint if exists documents_ocr_recognition_object_check,
  add constraint documents_ocr_recognition_object_check
    check (ocr_recognition is null or jsonb_typeof(ocr_recognition) = 'object'),
  drop constraint if exists documents_ocr_interpretation_object_check,
  add constraint documents_ocr_interpretation_object_check
    check (ocr_interpretation is null or jsonb_typeof(ocr_interpretation) = 'object'),
  drop constraint if exists documents_issuer_tax_id_length_check,
  add constraint documents_issuer_tax_id_length_check
    check (issuer_tax_id is null or char_length(issuer_tax_id) between 1 and 40),
  drop constraint if exists documents_document_number_length_check,
  add constraint documents_document_number_length_check
    check (document_number is null or char_length(document_number) between 1 and 100),
  drop constraint if exists documents_document_period_length_check,
  add constraint documents_document_period_length_check
    check (document_period is null or char_length(document_period) between 1 and 100),
  drop constraint if exists documents_payment_method_length_check,
  add constraint documents_payment_method_length_check
    check (payment_method is null or char_length(payment_method) between 1 and 100),
  drop constraint if exists documents_base_cents_check,
  add constraint documents_base_cents_check
    check (base_cents is null or base_cents between -9007199254740991 and 9007199254740991),
  drop constraint if exists documents_tax_cents_check,
  add constraint documents_tax_cents_check
    check (tax_cents is null or tax_cents between -9007199254740991 and 9007199254740991),
  drop constraint if exists documents_line_items_array_check,
  add constraint documents_line_items_array_check
    check (jsonb_typeof(line_items) = 'array');

create index if not exists documents_workspace_ocr_status_idx
  on financial_app.documents(workspace_id, ocr_status, updated_at desc);

-- Persistencia de OCR. Esta función solo actualiza la capa derivada OCR; no toca los
-- metadatos revisados por el usuario ni asociaciones con movimientos.
create or replace function financial_app.save_document_ocr_result(
  p_document_id uuid,
  p_recognition jsonb,
  p_interpretation jsonb,
  p_ocr_status text,
  p_extracted_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_old_recognition jsonb;
  v_old_interpretation jsonb;
begin
  if p_document_id is null then raise exception 'invalid_document_id'; end if;
  if p_recognition is null or jsonb_typeof(p_recognition) <> 'object' then
    raise exception 'invalid_ocr_recognition';
  end if;
  if p_interpretation is null or jsonb_typeof(p_interpretation) <> 'object' then
    raise exception 'invalid_ocr_interpretation';
  end if;
  if p_ocr_status not in ('ready','needs_review','empty') then
    raise exception 'invalid_ocr_status';
  end if;
  if p_extracted_at is null then raise exception 'invalid_ocr_extracted_at'; end if;
  if coalesce(p_recognition->>'documentId','') <> p_document_id::text then
    raise exception 'ocr_document_mismatch';
  end if;
  if pg_catalog.pg_column_size(p_recognition) > 10485760
     or pg_catalog.pg_column_size(p_interpretation) > 5242880 then
    raise exception 'ocr_payload_too_large';
  end if;

  select ocr_recognition, ocr_interpretation
    into v_old_recognition, v_old_interpretation
  from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id
  for update;
  if not found then raise exception 'document_not_found'; end if;

  update financial_app.documents
  set ocr_recognition=p_recognition,
      ocr_interpretation=p_interpretation,
      ocr_status=p_ocr_status,
      ocr_extracted_at=p_extracted_at,
      status=case when status='imported' then 'pending_review' else status end,
      updated_at=now()
  where workspace_id=v_workspace_id and id=p_document_id;

  insert into financial_app.audit_changes(
    workspace_id, entity_type, entity_id, field_name,
    original_value, new_value, change_origin
  ) values (
    v_workspace_id, 'document', p_document_id, 'ocr_result',
    case when v_old_recognition is null and v_old_interpretation is null then null
         else jsonb_build_object('recognition',v_old_recognition,'interpretation',v_old_interpretation) end,
    jsonb_build_object(
      'status',p_ocr_status,
      'extractedAt',p_extracted_at,
      'recognition',p_recognition,
      'interpretation',p_interpretation
    ),
    'system'
  );

  return financial_app.document_detail(p_document_id);
end;
$$;

-- Metadatos revisados por la persona usuaria. El OCR bruto/interpretado no se sobrescribe:
-- la corrección queda en las columnas canónicas y audit_changes conserva cada diferencia.
create or replace function financial_app.update_document_metadata_v2(
  p_document_id uuid,
  p_type text,
  p_document_date date,
  p_issuer_name text,
  p_total_cents bigint,
  p_notes text,
  p_issuer_tax_id text default null,
  p_document_time time without time zone default null,
  p_document_number text default null,
  p_document_period text default null,
  p_base_cents bigint default null,
  p_tax_cents bigint default null,
  p_payment_method text default null,
  p_line_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_old financial_app.documents%rowtype;
  v_new financial_app.documents%rowtype;
  v_field text;
  v_old_value jsonb;
  v_new_value jsonb;
begin
  select * into v_old
  from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id
  for update;
  if not found then raise exception 'document_not_found'; end if;

  if p_type not in ('ticket','invoice','other') then raise exception 'invalid_document_type'; end if;
  if p_issuer_name is not null and char_length(trim(p_issuer_name)) > 300 then raise exception 'invalid_document_issuer'; end if;
  if p_issuer_tax_id is not null and char_length(trim(p_issuer_tax_id)) > 40 then raise exception 'invalid_document_tax_id'; end if;
  if p_document_number is not null and char_length(trim(p_document_number)) > 100 then raise exception 'invalid_document_number'; end if;
  if p_document_period is not null and char_length(trim(p_document_period)) > 100 then raise exception 'invalid_document_period'; end if;
  if p_payment_method is not null and char_length(trim(p_payment_method)) > 100 then raise exception 'invalid_document_payment_method'; end if;
  if p_total_cents is not null and (p_total_cents < -9007199254740991 or p_total_cents > 9007199254740991) then raise exception 'invalid_document_total'; end if;
  if p_base_cents is not null and (p_base_cents < -9007199254740991 or p_base_cents > 9007199254740991) then raise exception 'invalid_document_base'; end if;
  if p_tax_cents is not null and (p_tax_cents < -9007199254740991 or p_tax_cents > 9007199254740991) then raise exception 'invalid_document_tax'; end if;
  if p_notes is null or char_length(p_notes) > 2000 then raise exception 'invalid_document_notes'; end if;
  if p_line_items is null or jsonb_typeof(p_line_items) <> 'array' then raise exception 'invalid_document_line_items'; end if;
  if pg_catalog.pg_column_size(p_line_items) > 2097152 then raise exception 'document_line_items_too_large'; end if;

  update financial_app.documents
  set type=p_type,
      document_date=p_document_date,
      issuer_name=nullif(trim(coalesce(p_issuer_name,'')),''),
      issuer_tax_id=nullif(trim(coalesce(p_issuer_tax_id,'')),''),
      document_time=p_document_time,
      document_number=nullif(trim(coalesce(p_document_number,'')),''),
      document_period=nullif(trim(coalesce(p_document_period,'')),''),
      base_cents=p_base_cents,
      tax_cents=p_tax_cents,
      total_cents=p_total_cents,
      payment_method=nullif(trim(coalesce(p_payment_method,'')),''),
      line_items=p_line_items,
      notes=p_notes,
      status=case when status='imported' then 'pending_review' else status end,
      updated_at=now()
  where workspace_id=v_workspace_id and id=p_document_id
  returning * into v_new;

  foreach v_field in array array[
    'type','document_date','issuer_name','issuer_tax_id','document_time',
    'document_number','document_period','base_cents','tax_cents','total_cents',
    'payment_method','line_items','notes'
  ] loop
    v_old_value := case v_field
      when 'type' then to_jsonb(v_old.type)
      when 'document_date' then to_jsonb(v_old.document_date)
      when 'issuer_name' then to_jsonb(v_old.issuer_name)
      when 'issuer_tax_id' then to_jsonb(v_old.issuer_tax_id)
      when 'document_time' then to_jsonb(v_old.document_time)
      when 'document_number' then to_jsonb(v_old.document_number)
      when 'document_period' then to_jsonb(v_old.document_period)
      when 'base_cents' then to_jsonb(v_old.base_cents)
      when 'tax_cents' then to_jsonb(v_old.tax_cents)
      when 'total_cents' then to_jsonb(v_old.total_cents)
      when 'payment_method' then to_jsonb(v_old.payment_method)
      when 'line_items' then v_old.line_items
      when 'notes' then to_jsonb(v_old.notes)
    end;
    v_new_value := case v_field
      when 'type' then to_jsonb(v_new.type)
      when 'document_date' then to_jsonb(v_new.document_date)
      when 'issuer_name' then to_jsonb(v_new.issuer_name)
      when 'issuer_tax_id' then to_jsonb(v_new.issuer_tax_id)
      when 'document_time' then to_jsonb(v_new.document_time)
      when 'document_number' then to_jsonb(v_new.document_number)
      when 'document_period' then to_jsonb(v_new.document_period)
      when 'base_cents' then to_jsonb(v_new.base_cents)
      when 'tax_cents' then to_jsonb(v_new.tax_cents)
      when 'total_cents' then to_jsonb(v_new.total_cents)
      when 'payment_method' then to_jsonb(v_new.payment_method)
      when 'line_items' then v_new.line_items
      when 'notes' then to_jsonb(v_new.notes)
    end;
    if v_old_value is distinct from v_new_value then
      insert into financial_app.audit_changes(
        workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin
      ) values (
        v_workspace_id,'document',p_document_id,v_field,v_old_value,v_new_value,'user'
      );
    end if;
  end loop;

  return financial_app.document_detail(p_document_id);
end;
$$;

-- Detail becomes the single read contract for original metadata, OCR-derived evidence,
-- reviewed values and confirmed movement associations.
create or replace function financial_app.document_detail(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document financial_app.documents%rowtype;
  v_associations jsonb;
begin
  select * into v_document
  from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id,
      'transactionId',a.transaction_id,
      'method',a.method,
      'confidence',a.confidence,
      'confirmed',a.confirmed,
      'date',t.bank_date,
      'amountCents',t.amount_cents,
      'concept',t.concept_normalized,
      'accountId',t.account_id,
      'accountName',ac.name,
      'merchantId',f.effective_merchant_id,
      'merchantName',m.name,
      'categoryId',f.effective_category_id,
      'effectiveKind',f.effective_kind,
      'createdAt',a.created_at,
      'updatedAt',a.updated_at
    ) order by t.bank_date desc, a.created_at desc
  ), '[]'::jsonb)
  into v_associations
  from financial_app.document_transaction_associations a
  join financial_app.transactions t
    on t.workspace_id=v_workspace_id and t.id=a.transaction_id
  join financial_app.accounts ac
    on ac.workspace_id=v_workspace_id and ac.id=t.account_id
  left join financial_app.financial_transaction_facts() f on f.transaction_id=t.id
  left join financial_app.merchants m
    on m.workspace_id=v_workspace_id and m.id=f.effective_merchant_id
  where a.workspace_id=v_workspace_id
    and a.document_id=p_document_id
    and a.confirmed=true;

  return jsonb_build_object(
    'contractVersion',2,
    'document',jsonb_build_object(
      'id',v_document.id,
      'type',v_document.type,
      'status',v_document.status,
      'originalFileName',v_document.original_file_name,
      'mimeType',v_document.mime_type,
      'storageProvider',v_document.storage_provider,
      'storageKey',v_document.storage_key,
      'sourceDriveFileId',v_document.source_drive_file_id,
      'documentDate',v_document.document_date,
      'issuerName',v_document.issuer_name,
      'issuerTaxId',v_document.issuer_tax_id,
      'documentTime',v_document.document_time,
      'documentNumber',v_document.document_number,
      'documentPeriod',v_document.document_period,
      'baseCents',v_document.base_cents,
      'taxCents',v_document.tax_cents,
      'totalCents',v_document.total_cents,
      'paymentMethod',v_document.payment_method,
      'lineItems',v_document.line_items,
      'sizeBytes',v_document.size_bytes,
      'sourceModifiedAt',v_document.source_modified_at,
      'notes',v_document.notes,
      'ocrStatus',v_document.ocr_status,
      'ocrExtractedAt',v_document.ocr_extracted_at,
      'ocrRecognition',v_document.ocr_recognition,
      'ocrInterpretation',v_document.ocr_interpretation,
      'createdAt',v_document.created_at,
      'updatedAt',v_document.updated_at
    ),
    'associations',v_associations,
    'principles',jsonb_build_object(
      'ocrEnabled',true,
      'recognitionSeparatedFromInterpretation',true,
      'userReviewSeparatedFromOcr',true,
      'bankSource','read_only',
      'financialWrites',false,
      'suggestionsPersisted',false,
      'associationsRequireConfirmation',true,
      'originalMovementImmutable',true,
      'getHasSideEffects',false
    )
  );
end;
$$;

-- List exposes only compact OCR state; large OCR JSON remains detail-only.
create or replace function financial_app.document_list(
  p_status text default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_total integer;
  v_items jsonb;
begin
  if p_status is not null and p_status not in ('imported','pending_review','confirmed','archived') then
    raise exception 'invalid_document_status';
  end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid_document_limit'; end if;
  if p_offset < 0 then raise exception 'invalid_document_offset'; end if;
  if p_query is not null and char_length(trim(p_query)) > 200 then raise exception 'invalid_document_query'; end if;

  select count(*)::int into v_total
  from financial_app.documents d
  where d.workspace_id=v_workspace_id
    and (p_status is null or d.status=p_status)
    and (
      p_query is null or trim(p_query)=''
      or d.original_file_name ilike '%' || trim(p_query) || '%'
      or coalesce(d.issuer_name,'') ilike '%' || trim(p_query) || '%'
      or coalesce(d.document_number,'') ilike '%' || trim(p_query) || '%'
      or coalesce(d.issuer_tax_id,'') ilike '%' || trim(p_query) || '%'
    );

  select coalesce(jsonb_agg(item order by sort_date desc nulls last, sort_created desc, sort_id), '[]'::jsonb)
    into v_items
  from (
    select
      jsonb_build_object(
        'id',d.id,
        'type',d.type,
        'status',d.status,
        'originalFileName',d.original_file_name,
        'mimeType',d.mime_type,
        'storageProvider',d.storage_provider,
        'sourceDriveFileId',d.source_drive_file_id,
        'documentDate',d.document_date,
        'issuerName',d.issuer_name,
        'issuerTaxId',d.issuer_tax_id,
        'documentNumber',d.document_number,
        'totalCents',d.total_cents,
        'paymentMethod',d.payment_method,
        'ocrStatus',d.ocr_status,
        'ocrExtractedAt',d.ocr_extracted_at,
        'sizeBytes',d.size_bytes,
        'sourceModifiedAt',d.source_modified_at,
        'notes',d.notes,
        'associationCount',(
          select count(*)::int
          from financial_app.document_transaction_associations a
          where a.workspace_id=v_workspace_id and a.document_id=d.id and a.confirmed=true
        ),
        'createdAt',d.created_at,
        'updatedAt',d.updated_at
      ) as item,
      d.document_date as sort_date,
      d.created_at as sort_created,
      d.id as sort_id
    from financial_app.documents d
    where d.workspace_id=v_workspace_id
      and (p_status is null or d.status=p_status)
      and (
        p_query is null or trim(p_query)=''
        or d.original_file_name ilike '%' || trim(p_query) || '%'
        or coalesce(d.issuer_name,'') ilike '%' || trim(p_query) || '%'
        or coalesce(d.document_number,'') ilike '%' || trim(p_query) || '%'
        or coalesce(d.issuer_tax_id,'') ilike '%' || trim(p_query) || '%'
      )
    order by d.document_date desc nulls last, d.created_at desc, d.id
    limit p_limit offset p_offset
  ) s;

  return jsonb_build_object(
    'contractVersion',2,
    'total',v_total,
    'limit',p_limit,
    'offset',p_offset,
    'items',v_items,
    'principles',jsonb_build_object(
      'ocrEnabled',true,
      'bankSource','read_only',
      'financialWrites',false,
      'suggestionsPersisted',false,
      'getHasSideEffects',false
    )
  );
end;
$$;

revoke all on function financial_app.save_document_ocr_result(uuid,jsonb,jsonb,text,timestamptz) from public;
revoke all on function financial_app.update_document_metadata_v2(uuid,text,date,text,bigint,text,text,time without time zone,text,text,bigint,bigint,text,jsonb) from public;
revoke all on function financial_app.document_detail(uuid) from public;
revoke all on function financial_app.document_list(text,text,integer,integer) from public;

grant execute on function financial_app.save_document_ocr_result(uuid,jsonb,jsonb,text,timestamptz) to financial_app_gateway;
grant execute on function financial_app.update_document_metadata_v2(uuid,text,date,text,bigint,text,text,time without time zone,text,text,bigint,bigint,text,jsonb) to financial_app_gateway;
grant execute on function financial_app.document_detail(uuid) to financial_app_gateway;
grant execute on function financial_app.document_list(text,text,integer,integer) to financial_app_gateway;
