-- Financial App · Fase 9 · Documentos sin OCR
-- Núcleo documental: registro, estados, metadatos, sugerencias efímeras,
-- asociaciones confirmables/reversibles y almacenamiento privado.

alter table financial_app.documents
  add column if not exists size_bytes bigint null,
  add column if not exists source_modified_at timestamptz null,
  add column if not exists notes text not null default '';

alter table financial_app.documents
  drop constraint if exists documents_size_bytes_check,
  add constraint documents_size_bytes_check
    check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 9007199254740991)),
  drop constraint if exists documents_notes_length_check,
  add constraint documents_notes_length_check check (char_length(notes) <= 2000),
  drop constraint if exists documents_file_name_length_check,
  add constraint documents_file_name_length_check check (char_length(original_file_name) between 1 and 500),
  drop constraint if exists documents_mime_type_length_check,
  add constraint documents_mime_type_length_check check (char_length(mime_type) between 1 and 200),
  drop constraint if exists documents_storage_key_length_check,
  add constraint documents_storage_key_length_check check (char_length(storage_key) between 1 and 1000),
  drop constraint if exists documents_source_contract_check,
  add constraint documents_source_contract_check check (
    (storage_provider = 'google_drive' and source_drive_file_id is not null and char_length(source_drive_file_id) between 1 and 300)
    or
    (storage_provider = 'supabase' and source_drive_file_id is null)
  );

create index if not exists documents_status_date_idx
  on financial_app.documents(status, document_date desc nulls last, created_at desc);

create unique index if not exists documents_drive_file_id_unique_idx
  on financial_app.documents(source_drive_file_id)
  where source_drive_file_id is not null;

alter table financial_app.documents enable row level security;
alter table financial_app.document_transaction_associations enable row level security;
revoke all on table financial_app.documents from anon, authenticated;
revoke all on table financial_app.document_transaction_associations from anon, authenticated;
grant select, insert, update, delete on table financial_app.documents to service_role;
grant select, insert, update, delete on table financial_app.document_transaction_associations to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-app-documents',
  'financial-app-documents',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function financial_app.document_list(
  p_status text default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  if p_status is not null and p_status not in ('imported','pending_review','confirmed','archived') then
    raise exception 'invalid_document_status';
  end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid_document_limit'; end if;
  if p_offset < 0 then raise exception 'invalid_document_offset'; end if;
  if p_query is not null and char_length(trim(p_query)) > 200 then raise exception 'invalid_document_query'; end if;

  with filtered as (
    select d.*
    from financial_app.documents d
    where (p_status is null or d.status = p_status)
      and (
        p_query is null or trim(p_query) = ''
        or d.original_file_name ilike '%' || trim(p_query) || '%'
        or coalesce(d.issuer_name,'') ilike '%' || trim(p_query) || '%'
      )
  )
  select count(*)::int into v_total from filtered;

  with filtered as (
    select d.*
    from financial_app.documents d
    where (p_status is null or d.status = p_status)
      and (
        p_query is null or trim(p_query) = ''
        or d.original_file_name ilike '%' || trim(p_query) || '%'
        or coalesce(d.issuer_name,'') ilike '%' || trim(p_query) || '%'
      )
    order by d.document_date desc nulls last, d.created_at desc, d.id
    limit p_limit offset p_offset
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'type', d.type,
      'status', d.status,
      'originalFileName', d.original_file_name,
      'mimeType', d.mime_type,
      'storageProvider', d.storage_provider,
      'sourceDriveFileId', d.source_drive_file_id,
      'documentDate', d.document_date,
      'issuerName', d.issuer_name,
      'totalCents', d.total_cents,
      'sizeBytes', d.size_bytes,
      'sourceModifiedAt', d.source_modified_at,
      'notes', d.notes,
      'associationCount', (select count(*)::int from financial_app.document_transaction_associations a where a.document_id=d.id and a.confirmed=true),
      'createdAt', d.created_at,
      'updatedAt', d.updated_at
    ) order by d.document_date desc nulls last, d.created_at desc, d.id
  ), '[]'::jsonb) into v_items
  from filtered d;

  return jsonb_build_object(
    'contractVersion', 1,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'items', v_items,
    'principles', jsonb_build_object(
      'ocrEnabled', false,
      'bankSource', 'read_only',
      'suggestionsPersisted', false,
      'associationsRequireConfirmation', true,
      'getHasSideEffects', false
    )
  );
end;
$$;

create or replace function financial_app.document_detail(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document financial_app.documents%rowtype;
  v_associations jsonb;
begin
  select * into v_document from financial_app.documents where id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'transactionId', a.transaction_id,
      'method', a.method,
      'confidence', a.confidence,
      'confirmed', a.confirmed,
      'date', t.bank_date,
      'amountCents', t.amount_cents,
      'concept', t.concept_normalized,
      'accountId', t.account_id,
      'accountName', ac.name,
      'merchantId', f.effective_merchant_id,
      'merchantName', m.name,
      'categoryId', f.effective_category_id,
      'effectiveKind', f.effective_kind,
      'createdAt', a.created_at,
      'updatedAt', a.updated_at
    ) order by t.bank_date desc, a.created_at desc
  ), '[]'::jsonb)
  into v_associations
  from financial_app.document_transaction_associations a
  join financial_app.transactions t on t.id=a.transaction_id
  join financial_app.accounts ac on ac.id=t.account_id
  left join financial_app.financial_transaction_facts() f on f.transaction_id=t.id
  left join financial_app.merchants m on m.id=f.effective_merchant_id
  where a.document_id=p_document_id and a.confirmed=true;

  return jsonb_build_object(
    'contractVersion', 1,
    'document', jsonb_build_object(
      'id', v_document.id,
      'type', v_document.type,
      'status', v_document.status,
      'originalFileName', v_document.original_file_name,
      'mimeType', v_document.mime_type,
      'storageProvider', v_document.storage_provider,
      'storageKey', v_document.storage_key,
      'sourceDriveFileId', v_document.source_drive_file_id,
      'documentDate', v_document.document_date,
      'issuerName', v_document.issuer_name,
      'totalCents', v_document.total_cents,
      'sizeBytes', v_document.size_bytes,
      'sourceModifiedAt', v_document.source_modified_at,
      'notes', v_document.notes,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at
    ),
    'associations', v_associations,
    'principles', jsonb_build_object(
      'ocrEnabled', false,
      'bankSource', 'read_only',
      'suggestionsPersisted', false,
      'associationsRequireConfirmation', true,
      'getHasSideEffects', false
    )
  );
end;
$$;

create or replace function financial_app.register_document(
  p_type text,
  p_original_file_name text,
  p_mime_type text,
  p_storage_provider text,
  p_storage_key text,
  p_source_drive_file_id text default null,
  p_size_bytes bigint default null,
  p_source_modified_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_type not in ('ticket','invoice','other') then raise exception 'invalid_document_type'; end if;
  if p_storage_provider not in ('supabase','google_drive') then raise exception 'invalid_document_storage_provider'; end if;
  if p_original_file_name is null or char_length(trim(p_original_file_name)) not between 1 and 500 then raise exception 'invalid_document_file_name'; end if;
  if p_mime_type is null or char_length(trim(p_mime_type)) not between 1 and 200 then raise exception 'invalid_document_mime_type'; end if;
  if p_storage_key is null or char_length(trim(p_storage_key)) not between 1 and 1000 then raise exception 'invalid_document_storage_key'; end if;
  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 9007199254740991) then raise exception 'invalid_document_size'; end if;
  if p_storage_provider='google_drive' and (p_source_drive_file_id is null or trim(p_source_drive_file_id)='') then raise exception 'invalid_document_drive_file_id'; end if;
  if p_storage_provider='supabase' and p_source_drive_file_id is not null then raise exception 'invalid_document_drive_file_id'; end if;

  insert into financial_app.documents(
    type,status,original_file_name,mime_type,storage_provider,storage_key,
    source_drive_file_id,size_bytes,source_modified_at
  ) values (
    p_type,'imported',trim(p_original_file_name),trim(p_mime_type),p_storage_provider,trim(p_storage_key),
    nullif(trim(coalesce(p_source_drive_file_id,'')),''),p_size_bytes,p_source_modified_at
  )
  on conflict (storage_provider,storage_key) do update
  set original_file_name=excluded.original_file_name,
      mime_type=excluded.mime_type,
      source_drive_file_id=excluded.source_drive_file_id,
      size_bytes=excluded.size_bytes,
      source_modified_at=excluded.source_modified_at,
      updated_at=now()
  returning id into v_id;

  return financial_app.document_detail(v_id);
end;
$$;

create or replace function financial_app.update_document_metadata(
  p_document_id uuid,
  p_type text,
  p_document_date date,
  p_issuer_name text,
  p_total_cents bigint,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old financial_app.documents%rowtype;
  v_new financial_app.documents%rowtype;
begin
  select * into v_old from financial_app.documents where id=p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if p_type not in ('ticket','invoice','other') then raise exception 'invalid_document_type'; end if;
  if p_issuer_name is not null and char_length(trim(p_issuer_name)) > 300 then raise exception 'invalid_document_issuer'; end if;
  if p_total_cents is not null and (p_total_cents < -9007199254740991 or p_total_cents > 9007199254740991) then raise exception 'invalid_document_total'; end if;
  if p_notes is null or char_length(p_notes) > 2000 then raise exception 'invalid_document_notes'; end if;

  update financial_app.documents
  set type=p_type,
      document_date=p_document_date,
      issuer_name=nullif(trim(coalesce(p_issuer_name,'')),''),
      total_cents=p_total_cents,
      notes=p_notes,
      status=case when status='imported' then 'pending_review' else status end,
      updated_at=now()
  where id=p_document_id
  returning * into v_new;

  if v_old.type is distinct from v_new.type then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'type',to_jsonb(v_old.type),to_jsonb(v_new.type),'user');
  end if;
  if v_old.document_date is distinct from v_new.document_date then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'document_date',to_jsonb(v_old.document_date),to_jsonb(v_new.document_date),'user');
  end if;
  if v_old.issuer_name is distinct from v_new.issuer_name then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'issuer_name',to_jsonb(v_old.issuer_name),to_jsonb(v_new.issuer_name),'user');
  end if;
  if v_old.total_cents is distinct from v_new.total_cents then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'total_cents',to_jsonb(v_old.total_cents),to_jsonb(v_new.total_cents),'user');
  end if;
  if v_old.notes is distinct from v_new.notes then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'notes',to_jsonb(v_old.notes),to_jsonb(v_new.notes),'user');
  end if;
  if v_old.status is distinct from v_new.status then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'status',to_jsonb(v_old.status),to_jsonb(v_new.status),'user');
  end if;

  return financial_app.document_detail(p_document_id);
end;
$$;

create or replace function financial_app.set_document_status(
  p_document_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_status not in ('imported','pending_review','confirmed','archived') then raise exception 'invalid_document_status'; end if;
  select status into v_old from financial_app.documents where id=p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if v_old is distinct from p_status then
    update financial_app.documents set status=p_status,updated_at=now() where id=p_document_id;
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('document',p_document_id,'status',to_jsonb(v_old),to_jsonb(p_status),'user');
  end if;
  return financial_app.document_detail(p_document_id);
end;
$$;

create or replace function financial_app.document_transaction_candidates(
  p_document_id uuid,
  p_days integer default 7,
  p_limit integer default 8
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document financial_app.documents%rowtype;
  v_candidates jsonb;
  v_tolerance bigint;
begin
  if p_days < 0 or p_days > 31 then raise exception 'invalid_document_candidate_days'; end if;
  if p_limit < 1 or p_limit > 20 then raise exception 'invalid_document_candidate_limit'; end if;
  select * into v_document from financial_app.documents where id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;

  if v_document.document_date is null or v_document.total_cents is null then
    return jsonb_build_object(
      'contractVersion',1,
      'documentId',p_document_id,
      'ready',false,
      'reason','metadata_required',
      'candidates','[]'::jsonb,
      'principles',jsonb_build_object('bankSource','read_only','suggestionsPersisted',false,'requiresConfirmation',true)
    );
  end if;

  v_tolerance := greatest(200::bigint, ceil(abs(v_document.total_cents)::numeric * 0.03)::bigint);

  with ranked as (
    select
      f.transaction_id,
      f.bank_date,
      f.amount_cents,
      t.concept_normalized,
      t.account_id,
      ac.name as account_name,
      f.effective_merchant_id,
      m.name as merchant_name,
      f.effective_category_id,
      f.effective_kind,
      abs(f.bank_date - v_document.document_date)::int as day_difference,
      abs(abs(f.amount_cents) - abs(v_document.total_cents))::bigint as amount_difference,
      greatest(0::numeric, least(1::numeric,
        1::numeric
        - (abs(f.bank_date - v_document.document_date)::numeric / greatest(p_days + 1,1)::numeric) * 0.35
        - (abs(abs(f.amount_cents) - abs(v_document.total_cents))::numeric / greatest(abs(v_document.total_cents),1)::numeric) * 2
      )) as confidence
    from financial_app.financial_transaction_facts(
      v_document.document_date - p_days,
      v_document.document_date + p_days,
      null
    ) f
    join financial_app.transactions t on t.id=f.transaction_id
    join financial_app.accounts ac on ac.id=t.account_id
    left join financial_app.merchants m on m.id=f.effective_merchant_id
    where f.analytics_eligible=true
      and f.effective_kind in ('expense','income')
      and abs(abs(f.amount_cents) - abs(v_document.total_cents)) <= v_tolerance
      and not exists (
        select 1 from financial_app.document_transaction_associations a
        where a.document_id=p_document_id and a.transaction_id=f.transaction_id and a.confirmed=true
      )
    order by amount_difference asc, day_difference asc, f.bank_date desc, f.transaction_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'transactionId',transaction_id,
    'date',bank_date,
    'amountCents',amount_cents,
    'concept',concept_normalized,
    'accountId',account_id,
    'accountName',account_name,
    'merchantId',effective_merchant_id,
    'merchantName',merchant_name,
    'categoryId',effective_category_id,
    'effectiveKind',effective_kind,
    'dayDifference',day_difference,
    'amountDifferenceCents',amount_difference,
    'confidence',round(confidence,4)
  ) order by amount_difference,day_difference,date desc), '[]'::jsonb)
  into v_candidates from ranked;

  return jsonb_build_object(
    'contractVersion',1,
    'documentId',p_document_id,
    'ready',true,
    'reason',null,
    'days',p_days,
    'amountToleranceCents',v_tolerance,
    'candidates',v_candidates,
    'principles',jsonb_build_object('bankSource','read_only','suggestionsPersisted',false,'requiresConfirmation',true)
  );
end;
$$;

create or replace function financial_app.confirm_document_transaction(
  p_document_id uuid,
  p_transaction_id uuid,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document financial_app.documents%rowtype;
  v_exists boolean;
  v_candidate boolean := false;
  v_confidence numeric := null;
  v_old jsonb := null;
  v_new jsonb;
  v_tolerance bigint;
begin
  if p_method not in ('manual','suggested') then raise exception 'invalid_document_association_method'; end if;
  select * into v_document from financial_app.documents where id=p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;

  select exists(select 1 from financial_app.transactions where id=p_transaction_id) into v_exists;
  if not v_exists then raise exception 'document_transaction_not_found'; end if;

  if p_method='suggested' then
    if v_document.document_date is null or v_document.total_cents is null then raise exception 'document_suggestion_metadata_required'; end if;
    v_tolerance := greatest(200::bigint, ceil(abs(v_document.total_cents)::numeric * 0.03)::bigint);
    select exists(
      select 1
      from financial_app.financial_transaction_facts(
        v_document.document_date - 7,
        v_document.document_date + 7,
        null
      ) f
      where f.transaction_id=p_transaction_id
        and f.analytics_eligible=true
        and f.effective_kind in ('expense','income')
        and abs(abs(f.amount_cents)-abs(v_document.total_cents)) <= v_tolerance
    ) into v_candidate;
    if not v_candidate then raise exception 'document_suggestion_not_current'; end if;

    select greatest(0::numeric, least(1::numeric,
      1::numeric
      - (abs(f.bank_date-v_document.document_date)::numeric / 8::numeric) * 0.35
      - (abs(abs(f.amount_cents)-abs(v_document.total_cents))::numeric / greatest(abs(v_document.total_cents),1)::numeric) * 2
    ))
    into v_confidence
    from financial_app.financial_transaction_facts(
      v_document.document_date - 7,
      v_document.document_date + 7,
      null
    ) f where f.transaction_id=p_transaction_id;
  end if;

  select jsonb_build_object('transactionId',transaction_id,'method',method,'confidence',confidence,'confirmed',confirmed)
  into v_old
  from financial_app.document_transaction_associations
  where document_id=p_document_id and transaction_id=p_transaction_id;

  insert into financial_app.document_transaction_associations(document_id,transaction_id,method,confidence,confirmed)
  values(p_document_id,p_transaction_id,p_method,case when p_method='suggested' then round(v_confidence,4) else null end,true)
  on conflict(document_id,transaction_id) do update
  set method=excluded.method,confidence=excluded.confidence,confirmed=true,updated_at=now();

  select jsonb_build_object('transactionId',transaction_id,'method',method,'confidence',confidence,'confirmed',confirmed)
  into v_new
  from financial_app.document_transaction_associations
  where document_id=p_document_id and transaction_id=p_transaction_id;

  insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
  values('document',p_document_id,'transaction_association',v_old,v_new,'user');

  return financial_app.document_detail(p_document_id);
end;
$$;

create or replace function financial_app.remove_document_transaction(
  p_document_id uuid,
  p_transaction_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  if not exists(select 1 from financial_app.documents where id=p_document_id) then raise exception 'document_not_found'; end if;
  select jsonb_build_object('transactionId',transaction_id,'method',method,'confidence',confidence,'confirmed',confirmed)
  into v_old
  from financial_app.document_transaction_associations
  where document_id=p_document_id and transaction_id=p_transaction_id and confirmed=true
  for update;
  if v_old is null then raise exception 'document_association_not_found'; end if;

  delete from financial_app.document_transaction_associations
  where document_id=p_document_id and transaction_id=p_transaction_id;

  insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
  values('document',p_document_id,'transaction_association',v_old,null,'user');

  return financial_app.document_detail(p_document_id);
end;
$$;

revoke all on function financial_app.document_list(text,text,integer,integer) from public, anon, authenticated;
revoke all on function financial_app.document_detail(uuid) from public, anon, authenticated;
revoke all on function financial_app.register_document(text,text,text,text,text,text,bigint,timestamptz) from public, anon, authenticated;
revoke all on function financial_app.update_document_metadata(uuid,text,date,text,bigint,text) from public, anon, authenticated;
revoke all on function financial_app.set_document_status(uuid,text) from public, anon, authenticated;
revoke all on function financial_app.document_transaction_candidates(uuid,integer,integer) from public, anon, authenticated;
revoke all on function financial_app.confirm_document_transaction(uuid,uuid,text) from public, anon, authenticated;
revoke all on function financial_app.remove_document_transaction(uuid,uuid) from public, anon, authenticated;

grant execute on function financial_app.document_list(text,text,integer,integer) to service_role;
grant execute on function financial_app.document_detail(uuid) to service_role;
grant execute on function financial_app.register_document(text,text,text,text,text,text,bigint,timestamptz) to service_role;
grant execute on function financial_app.update_document_metadata(uuid,text,date,text,bigint,text) to service_role;
grant execute on function financial_app.set_document_status(uuid,text) to service_role;
grant execute on function financial_app.document_transaction_candidates(uuid,integer,integer) to service_role;
grant execute on function financial_app.confirm_document_transaction(uuid,uuid,text) to service_role;
grant execute on function financial_app.remove_document_transaction(uuid,uuid) to service_role;
