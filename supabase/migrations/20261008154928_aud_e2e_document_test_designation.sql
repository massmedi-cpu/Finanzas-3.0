-- AUD-E2E-DOC-002: explicit owner-reviewed designation, never filename inference.
-- Candidate only. No backfill/designation of the observed production fixture.
-- Source metadata, Drive originals, OCR and bank records are not modified.
alter table financial_app.documents
  add column is_test boolean not null default false,
  add column test_designation_updated_at timestamptz,
  add column test_designation_updated_by uuid,
  add column test_designation_reason text,
  add constraint documents_test_designation_reason_check
    check (test_designation_reason is null or char_length(trim(test_designation_reason)) between 1 and 500),
  add constraint documents_test_designation_evidence_check
    check (not is_test or (test_designation_updated_at is not null and test_designation_updated_by is not null and test_designation_reason is not null));

create or replace function financial_app.document_list_filtered(
  p_status text, p_query text, p_limit integer, p_offset integer,
  p_scope text, p_unassociated_only boolean
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_result jsonb;
begin
  if p_status is not null and p_status not in ('imported','pending_review','confirmed','archived') then raise exception 'invalid_document_status'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'invalid_document_limit'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'invalid_document_offset'; end if;
  if p_query is not null and char_length(trim(p_query)) > 200 then raise exception 'invalid_document_query'; end if;
  if p_scope is null or p_scope not in ('ordinary','tests','all') then raise exception 'invalid_document_scope'; end if;
  if p_unassociated_only is null then raise exception 'invalid_document_association_filter'; end if;

  with filtered as materialized (
    select d.*, (
      select count(*)::int from financial_app.document_transaction_associations a
      where a.workspace_id=v_workspace_id and a.document_id=d.id and a.confirmed=true
    ) as association_count
    from financial_app.documents d
    where d.workspace_id=v_workspace_id
      and (p_scope='all' or d.is_test=(p_scope='tests'))
      and (p_status is null or d.status=p_status)
      and (p_query is null or trim(p_query)='' or d.original_file_name ilike '%'||trim(p_query)||'%'
        or coalesce(d.issuer_name,'') ilike '%'||trim(p_query)||'%'
        or coalesce(d.notes,'') ilike '%'||trim(p_query)||'%')
      and (not p_unassociated_only or (d.status<>'archived' and not exists (
        select 1 from financial_app.document_transaction_associations a
        where a.workspace_id=v_workspace_id and a.document_id=d.id and a.confirmed=true
      )))
  ), page as (
    select * from filtered order by document_date desc nulls last,created_at desc,id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'contractVersion',3,'scope',p_scope,'total',(select count(*)::int from filtered),
    'testCount',(select count(*)::int from financial_app.documents where workspace_id=v_workspace_id and is_test),
    'limit',p_limit,'offset',p_offset,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'type',d.type,'status',d.status,'originalFileName',d.original_file_name,
      'mimeType',d.mime_type,'storageProvider',d.storage_provider,'sourceDriveFileId',d.source_drive_file_id,
      'documentDate',d.document_date,'issuerName',d.issuer_name,'totalCents',d.total_cents,
      'sizeBytes',d.size_bytes,'sourceModifiedAt',d.source_modified_at,'notes',d.notes,
      'isTest',d.is_test,'testDesignationUpdatedAt',d.test_designation_updated_at,
      'testDesignationReason',d.test_designation_reason,'associationCount',d.association_count,
      'createdAt',d.created_at,'updatedAt',d.updated_at
    ) order by d.document_date desc nulls last,d.created_at desc,d.id) from page d),'[]'::jsonb),
    'principles',jsonb_build_object('ocrEnabled',true,'bankSource','read_only',
      'suggestionsPersisted',false,'associationsRequireConfirmation',true,'getHasSideEffects',false,
      'testDesignationSupported',true)
  ) into v_result;
  return v_result;
end;
$$;

-- Preserve the legacy call surface with the same ordinary-queue semantics.
create or replace function financial_app.document_list(
  p_status text default null,p_query text default null,p_limit integer default 50,p_offset integer default 0
) returns jsonb language sql security invoker set search_path = ''
as $$ select financial_app.document_list_filtered(p_status,p_query,p_limit,p_offset,'ordinary',false) $$;

create or replace function financial_app.document_detail(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document financial_app.documents%rowtype;
  v_associations jsonb;
begin
  select * into v_document
  from financial_app.documents
  where workspace_id=financial_app.require_current_workspace_id() and id=p_document_id;
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
  where a.workspace_id=v_document.workspace_id
    and a.document_id=p_document_id
    and a.confirmed=true;

  return jsonb_build_object(
    'contractVersion', 3,
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
      'documentTime', case when v_document.document_time is null then null else to_char(v_document.document_time,'HH24:MI') end,
      'issuerName', v_document.issuer_name,
      'issuerTaxId', v_document.issuer_tax_id,
      'documentNumber', v_document.document_number,
      'billingPeriod', v_document.billing_period,
      'taxBaseCents', v_document.tax_base_cents,
      'taxesCents', v_document.taxes_cents,
      'totalCents', v_document.total_cents,
      'paymentMethod', v_document.payment_method,
      'lineItems', v_document.line_items,
      'sizeBytes', v_document.size_bytes,
      'sourceModifiedAt', v_document.source_modified_at,
      'notes', v_document.notes,
      'isTest', v_document.is_test,
      'testDesignationUpdatedAt', v_document.test_designation_updated_at,
      'testDesignationReason', v_document.test_designation_reason,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at
    ),
    'associations', v_associations,
    'principles', jsonb_build_object(
      'ocrEnabled', true,
      'testDesignationSupported', true,
      'testDesignationEditable', coalesce(pg_catalog.current_setting('financial_app.workspace_role',true),'')='owner',
      'bankSource', 'read_only',
      'suggestionsPersisted', false,
      'associationsRequireConfirmation', true,
      'getHasSideEffects', false
    )
  );
end;
$$;

revoke all on function financial_app.document_detail(uuid) from public, anon, authenticated;
grant execute on function financial_app.document_detail(uuid) to financial_app_gateway;

create or replace function financial_app.set_document_test_designation(
  p_document_id uuid,p_is_test boolean,p_reason text,p_owner_reviewed boolean
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_user_id uuid := nullif(pg_catalog.current_setting('financial_app.user_id',true),'')::uuid;
  v_old financial_app.documents%rowtype;
  v_new financial_app.documents%rowtype;
begin
  if coalesce(pg_catalog.current_setting('financial_app.workspace_role',true),'')<>'owner' or v_user_id is null then
    raise exception 'document_owner_review_required';
  end if;
  if p_owner_reviewed is distinct from true then raise exception 'invalid_document_owner_review'; end if;
  if p_is_test is null then raise exception 'invalid_document_test_designation'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then raise exception 'invalid_document_designation_reason'; end if;
  select * into v_old from financial_app.documents
    where workspace_id=v_workspace_id and id=p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  -- A repeated request does not rewrite provenance or add another audit entry.
  if v_old.is_test=p_is_test then return financial_app.document_detail(p_document_id); end if;
  update financial_app.documents set
    is_test=p_is_test,test_designation_updated_at=now(),test_designation_updated_by=v_user_id,
    test_designation_reason=trim(p_reason),updated_at=now()
  where workspace_id=v_workspace_id and id=p_document_id returning * into v_new;
  insert into financial_app.audit_changes(workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin)
  values(v_workspace_id,'document',p_document_id,'test_designation',
    jsonb_build_object('isTest',v_old.is_test,'reason',v_old.test_designation_reason),
    jsonb_build_object('isTest',v_new.is_test,'reason',v_new.test_designation_reason,'reviewedBy',v_user_id), 'user');
  return financial_app.document_detail(p_document_id);
end;
$$;

revoke all on function financial_app.document_list_filtered(text,text,integer,integer,text,boolean) from public,anon,authenticated,service_role;
revoke all on function financial_app.document_list(text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function financial_app.set_document_test_designation(uuid,boolean,text,boolean) from public,anon,authenticated,service_role;
grant execute on function financial_app.document_list_filtered(text,text,integer,integer,text,boolean) to financial_app_gateway;
grant execute on function financial_app.document_list(text,text,integer,integer) to financial_app_gateway;
grant execute on function financial_app.set_document_test_designation(uuid,boolean,text,boolean) to financial_app_gateway;
