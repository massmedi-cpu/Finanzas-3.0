-- Financial App · PRE-034 · eliminación documental segura
-- Drive: elimina únicamente el registro de Financial App, nunca el original externo.
-- Supabase privado: el Edge gateway elimina el objeto y llama después a la función final.
-- Un documento confirmado o asociado debe desasociarse/cambiar de estado antes.

create or replace function financial_app.document_delete_preflight(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document financial_app.documents%rowtype;
  v_association_count integer;
begin
  select * into v_document
  from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;

  select count(*)::int into v_association_count
  from financial_app.document_transaction_associations
  where workspace_id=v_workspace_id and document_id=p_document_id;

  if v_document.status='confirmed' then raise exception 'document_delete_confirmed'; end if;
  if v_association_count > 0 then raise exception 'document_delete_associated'; end if;

  return jsonb_build_object(
    'allowed',true,
    'documentId',v_document.id,
    'storageProvider',v_document.storage_provider,
    'storageKey',v_document.storage_key,
    'mimeType',v_document.mime_type,
    'originalFileName',v_document.original_file_name,
    'sourceDriveFileId',v_document.source_drive_file_id,
    'driveOriginalMustRemain',v_document.storage_provider='google_drive'
  );
end;
$$;

create or replace function financial_app.delete_document_registration(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_document financial_app.documents%rowtype;
  v_association_count integer;
begin
  select * into v_document
  from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id
  for update;
  if not found then raise exception 'document_not_found'; end if;

  select count(*)::int into v_association_count
  from financial_app.document_transaction_associations
  where workspace_id=v_workspace_id and document_id=p_document_id;

  if v_document.status='confirmed' then raise exception 'document_delete_confirmed'; end if;
  if v_association_count > 0 then raise exception 'document_delete_associated'; end if;

  insert into financial_app.audit_changes(
    workspace_id,entity_type,entity_id,field_name,original_value,new_value,change_origin
  ) values (
    v_workspace_id,'document',p_document_id,'deleted',
    jsonb_build_object(
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
      'documentNumber',v_document.document_number,
      'totalCents',v_document.total_cents,
      'ocrStatus',v_document.ocr_status
    ),
    null,
    'user'
  );

  delete from financial_app.documents
  where workspace_id=v_workspace_id and id=p_document_id;

  return jsonb_build_object(
    'deleted',true,
    'documentId',p_document_id,
    'storageProvider',v_document.storage_provider,
    'driveOriginalPreserved',v_document.storage_provider='google_drive',
    'bankSource','read_only',
    'financialWrites',false
  );
end;
$$;

revoke all on function financial_app.document_delete_preflight(uuid) from public;
revoke all on function financial_app.delete_document_registration(uuid) from public;
grant execute on function financial_app.document_delete_preflight(uuid) to financial_app_gateway;
grant execute on function financial_app.delete_document_registration(uuid) to financial_app_gateway;
